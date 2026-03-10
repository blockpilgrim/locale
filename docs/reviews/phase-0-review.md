# Phase 0: Project Scaffolding -- Code Review

**Date:** 2026-03-10
**Reviewer:** Claude Opus 4.6
**Scope:** T0.1 (Next.js project init + core config) and T0.2 (Database setup + schema)
**Commits reviewed:** a3fb2c6, dfd6ce4, f4a8879

---

## Summary

Phase 0 establishes a solid foundation. The Next.js App Router project is correctly configured with TypeScript, Tailwind CSS v4, and the editorial design system. The Drizzle ORM schema maps well to the data architecture described in BUILD-STRATEGY.md. TypeScript compilation and ESLint both pass cleanly. The design tokens are thoughtful and express the "magazine, not dashboard" principle effectively.

There are a few issues worth addressing -- most notably a missing database index that will matter under load, a database connection pattern that could cause problems in serverless cold starts, and the `updatedAt` column not auto-updating. Nothing is a showstopper, but some items should be fixed before Phase 1 builds on top of this foundation.

---

## Files Reviewed

| File | Verdict |
|------|---------|
| `package.json` | Good |
| `tsconfig.json` | Good |
| `src/app/globals.css` | Good |
| `src/app/layout.tsx` | Good |
| `src/app/page.tsx` | Good |
| `src/lib/db/schema.ts` | Has issues |
| `src/lib/db/index.ts` | Has issues |
| `drizzle.config.ts` | Minor issue |
| `drizzle/0000_organic_phantom_reporter.sql` | Has issues (inherits from schema) |
| `.env.example` | Good |
| `.gitignore` | Good |
| `next.config.ts` | Good |
| `eslint.config.mjs` | Good |
| `postcss.config.mjs` | Good |

---

## Critical (Must Fix)

### C1. Missing index on `reports.location_id`

**File:** `src/lib/db/schema.ts`, line 32-33

The `reports.location_id` foreign key has no index. Per BUILD-STRATEGY.md, the report generation flow checks the database for an existing report by location before generating a new one (cache hit path). Without an index, this lookup will degrade to a sequential scan as the table grows. PostgreSQL does not automatically create indexes on foreign key columns.

**Fix:** Add an index on `location_id` in the schema definition. Also consider adding an index on `slug` explicitly via Drizzle (the unique constraint creates one, so `slug` is actually fine -- but `location_id` needs attention).

### C2. `updatedAt` column does not auto-update on modification

**File:** `src/lib/db/schema.ts`, lines 44-46

```typescript
updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
```

The `updatedAt` field uses `.defaultNow()`, which only sets the value on INSERT. When the report row is updated from `"generating"` to `"complete"` (with the narrative and data payload), `updatedAt` will still reflect the original creation time unless the application code explicitly sets it. This is a common mistake.

**Fix:** Either (a) add a `.$onUpdate(() => new Date())` to the column definition so Drizzle handles it at the ORM level, or (b) document clearly that all UPDATE queries must explicitly set `updatedAt`. Option (a) is strongly preferred since it prevents silent bugs in every future update path.

---

## Warnings (Should Fix)

### W1. Database connection helper throws at module load time

**File:** `src/lib/db/index.ts`, lines 5-8

```typescript
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. See .env.example for required environment variables."
  );
}
```

This guard runs at module import time, which means importing any module that transitively imports `db` will throw during `next build` if `DATABASE_URL` is not set. This is a problem because:
- `next build` evaluates server modules during static analysis
- CI pipelines may not have `DATABASE_URL` available at build time
- Any file that imports the schema for type inference will also trigger this

**Fix:** Use a lazy initialization pattern. Export `db` as a function or use a getter that defers the connection check to first use rather than module load:

```typescript
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set.");
    }
    const sql = neon(process.env.DATABASE_URL);
    _db = drizzle(sql, { schema });
  }
  return _db;
}
```

Note: Verify whether the Neon serverless driver already handles connection pooling/reuse correctly in this pattern. Since `@neondatabase/serverless` uses HTTP-based queries (not persistent connections), caching the drizzle instance is safe and avoids re-parsing the URL on every call.

### W2. Foreign key on `reports.location_id` has no cascade behavior

**File:** `src/lib/db/schema.ts`, line 33

The foreign key defaults to `ON DELETE no action`. If a location is ever deleted, orphaned report rows will remain and the foreign key constraint will block the deletion entirely. This may be intentional (locations should never be deleted) but it is worth being explicit about.

**Fix:** Either add `{ onDelete: "cascade" }` if reports should be cleaned up with their location, or add a comment documenting that this is intentional.

### W3. No `db:push` script for local development

**File:** `package.json`

The current scripts include `db:generate` and `db:migrate` but not `db:push`. During local development, `drizzle-kit push` applies schema changes directly without generating migration files, which is faster for iterating. This is a convenience issue, not a correctness one.

**Fix:** Add `"db:push": "drizzle-kit push"` to the scripts.

### W4. Missing `CONVENTIONS.md`

The CLAUDE.md session startup protocol requires reading `CONVENTIONS.md`, but it does not exist yet. While Phase 0 is the right time to establish initial conventions (naming patterns, file organization, etc.), it was not created.

**Fix:** Create an initial `CONVENTIONS.md` documenting the patterns already established: directory structure (`src/app`, `src/components`, `src/lib`, `src/types`), design token location (`globals.css` via `@theme`), database schema conventions (snake_case columns, `createdAt`/`updatedAt` pattern), and font variable naming.

---

## Suggestions (Consider)

### S1. Consider using `uuid` or `cuid2` for primary keys instead of `serial`

**File:** `src/lib/db/schema.ts`

All three tables use `serial` (auto-incrementing integer) primary keys. This works but has some drawbacks:
- Exposes record count and insertion order to anyone who can see an ID
- Makes future database sharding more complex
- Sequential IDs in URLs (if ever exposed) are enumerable

For a project that generates shareable public URLs, using `uuid` or `cuid2` for at least the `reports` table could be worth considering. The `slug` field already handles the public-facing identifier, so this is low priority -- but worth thinking about before the schema is in production.

### S2. The `drizzle.config.ts` uses a non-null assertion on `DATABASE_URL`

**File:** `drizzle.config.ts`, line 8

```typescript
url: process.env.DATABASE_URL!,
```

The non-null assertion (`!`) suppresses the TypeScript error but will cause a runtime error with an unhelpful message if `DATABASE_URL` is not set when running Drizzle Kit commands. A guard with a clear error message (similar to the one in `src/lib/db/index.ts`) would be more developer-friendly.

### S3. Consider defining the status enum as a reusable Drizzle `pgEnum`

**File:** `src/lib/db/schema.ts`, line 36

The `status` field uses `text` with an inline `enum` option:

```typescript
status: text("status", { enum: ["generating", "complete", "failed"] })
```

This provides TypeScript-level type safety but does not create a PostgreSQL enum type, meaning the database itself has no constraint preventing invalid values. Using `pgEnum` would enforce the constraint at the database level as well. This is a minor point since the inline enum approach is a valid Drizzle pattern and keeps the migration simpler.

### S4. Consider adding `@font-source` optimization for self-hosted fonts

**File:** `src/app/layout.tsx`

The fonts are loaded via `next/font/google`, which is already a good choice (it self-hosts the fonts to avoid GDPR/privacy issues with Google Fonts CDN). The `display: "swap"` setting is correct. No issue here -- just noting this is well done.

### S5. The `locations` table has no uniqueness constraint on address/coordinates

**File:** `src/lib/db/schema.ts`, lines 14-25

If the same address is looked up twice, two rows will be created in `locations`. The BUILD-STRATEGY.md describes checking for existing reports before generating, but the check would need to match on `slug` (in `reports`) rather than on the location. Consider whether a unique constraint on `address` (or on `latitude`/`longitude` pair) would be valuable to prevent duplicate location records.

### S6. Responsive typography for headings

**File:** `src/app/globals.css`, lines 87-89

The `h1` font size is set to `2.75rem` (44px) without responsive breakpoints. On a 375px mobile screen, this may be too large for longer headings. Since Tailwind v4 supports `@media` within CSS, consider adding a responsive scale or using `clamp()`:

```css
h1 {
  font-size: clamp(2rem, 5vw, 2.75rem);
  line-height: 1.15;
}
```

---

## Convention Compliance

Since `CONVENTIONS.md` does not exist yet, I am evaluating against the patterns documented in BUILD-STRATEGY.md and IMPLEMENTATION-PLAN.md.

| Convention | Status |
|------------|--------|
| App Router (not Pages Router) | Compliant |
| TypeScript strict mode | Compliant |
| Tailwind CSS v4 with design tokens | Compliant |
| Drizzle ORM (not Prisma) | Compliant |
| Neon serverless driver | Compliant |
| `src/` directory structure (app, components, lib, types) | Compliant |
| Schema matches BUILD-STRATEGY data architecture | Compliant |
| `.env.example` documents all expected env vars | Compliant |
| Editorial design tokens ("magazine, not dashboard") | Compliant |
| snake_case database column names | Compliant |
| Serif headings + sans-serif body | Compliant |

---

## Patterns to Document

The following patterns were established in Phase 0 and should be captured in a `CONVENTIONS.md` file:

1. **Database column naming:** snake_case in PostgreSQL, camelCase in TypeScript (Drizzle handles the mapping via the column name string argument).

2. **Design token location:** All design tokens live in `src/app/globals.css` inside the `@theme` block. Tailwind utility classes reference these tokens directly (e.g., `text-accent`, `bg-cream`).

3. **Font variable pattern:** Google Fonts are loaded in `layout.tsx` with CSS variable names (`--font-inter`, `--font-playfair`) that are then referenced in `globals.css` via `var()`.

4. **Database connection:** Single `db` instance exported from `src/lib/db/index.ts`. Schema defined separately in `src/lib/db/schema.ts`.

5. **Directory structure:**
   - `src/app/` -- Next.js App Router pages and layouts
   - `src/components/` -- Reusable React components
   - `src/lib/` -- Business logic, utilities, database
   - `src/types/` -- Shared TypeScript type definitions
   - `drizzle/` -- Migration files (generated, do not edit manually)

6. **Path aliases:** `@/*` maps to `./src/*` (configured in `tsconfig.json`).

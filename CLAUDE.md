# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Locale: AI-powered neighborhood intelligence reports for any US address. Enter an address, get an editorial-quality report with interactive map, Census demographics, POI data, and a Claude-generated narrative ("The Vibe Check"). Reports are persisted at shareable URLs with OG previews.

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run lint         # ESLint (flat config, ESLint 9+)
npm run test         # Vitest — all tests, single run
npm run test:watch   # Vitest — watch mode
npm run test:eval    # Generate narratives for 20 golden addresses (add --live for real AI calls)
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Apply migrations
npm run db:push      # Push schema directly (rapid local iteration)
npm run db:studio    # Drizzle Studio (DB browser)
```

Run a single test file: `npx vitest run src/lib/__tests__/integration.test.ts`

## Environment Variables

Copy `.env.example` → `.env.local`. Required: `DATABASE_URL`, `MAPBOX_ACCESS_TOKEN`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `CENSUS_API_KEY`, `ANTHROPIC_API_KEY`.

## Architecture

**Stack:** Next.js 16 (App Router), Tailwind v4, Drizzle ORM, Neon Postgres (HTTP driver), Mapbox GL JS, Claude Sonnet via Vercel AI SDK (`ai` + `@ai-sdk/anthropic`), Framer Motion.

**Request flow:**
1. User enters address → `HomepageClient` POSTs to `/api/report/generate`
2. Route checks DB for existing report (case-insensitive address match). Cache hit → returns slug
3. Cache miss → orchestrator (`lib/report/generate.ts`) fires Census + isochrone + POI via `Promise.all` (each `.catch()` returns null)
4. Writes location + report rows (status: `generating`), returns slug
5. Client redirects to `/report/[slug]` → page renders with loading state
6. `NarrativeTrigger` client component POSTs to `/api/report/[slug]/narrative` → generates AI narrative, updates report to `complete`
7. `AutoRefresh` polls via `router.refresh()` until report is complete

**SSR/client split:** Pages are server components. Interactive parts (`HomepageClient`, `ReportContent`, `Map`, `ShareControls`) are `"use client"` islands. Report page queries DB directly (not through API route) for SSR + `generateMetadata`.

**Data flow:** External APIs → typed clients in `src/lib/` → orchestrator assembles → JSONB snapshot stored in `reports.data` → data sections render from snapshot (report always shows data as-of generation time).

**Key architectural decisions** are documented in `docs/DECISIONS.md` (D1–D7). Notable: Neon HTTP driver over `@vercel/postgres`, Overpass API for POIs (free), insert-then-retry for slug uniqueness, custom walkability heuristic.

## Critical Patterns

- **Tailwind v4:** Design tokens live in `@theme` block in `globals.css`, NOT in a `tailwind.config.ts`
- **DB access:** Always use `getDb()` (lazy init), never a bare `db` export — prevents build-time crashes
- **API clients return null on failure**, never throw (except missing env vars). Orchestrator uses `Promise.all` with `.catch()` wrappers
- **Framer Motion animations:** Import `fadeUp` from `@/lib/motion` — don't redefine per-component
- **Formatters:** Import from `@/lib/format` — don't duplicate
- **Map is lazy-loaded** via `next/dynamic` with `ssr: false` in `ReportContent`
- **Error boundaries:** `SectionErrorBoundary` (class component) wraps each section independently — one failure doesn't crash the page
- **Container owns padding** (`px-4 sm:px-6`) — don't add extra `px-*` wrappers
- **Mapbox hex colors** must comment which design token they mirror (can't use CSS vars in GL JS paint props)
- **Escape OSM data** before `.setHTML()` in Map popups (XSS prevention)
- **JSONB columns:** Null-guard before `as` cast to typed interface
- **`force-dynamic`** on report page (status transitions between requests)
- **Anti-pattern:** Never use fire-and-forget promises or `after()` for critical work in route handlers — use client-triggered endpoints instead

## Testing

- Vitest with node environment (no DOM/component tests yet)
- Tests in `src/lib/__tests__/` — mock `fetch` via `vi.spyOn(globalThis, "fetch")`, env vars via `vi.stubEnv()`
- Integration tests cover orchestrator, prompt construction, slug generation, partial failures
- Golden dataset: 20 diverse US addresses in `tests/golden-addresses.ts`

## Key Documentation

- `docs/PRODUCT.md` — Product vision, personas, features, user flows
- `docs/BUILD-STRATEGY.md` — Tech stack rationale, architecture, testing philosophy
- `docs/IMPLEMENTATION-PLAN.md` — Phase breakdown (all 8 phases complete)
- `docs/DECISIONS.md` — Architectural decisions log (D1–D7)
- `CONVENTIONS.md` — Full coding patterns and standards (the authoritative reference)

## Custom Instructions

### Think Before Coding
- State assumptions explicitly. If uncertain, ask.
- If multiple valid approaches exist, present them with tradeoffs — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### Goal-Driven Execution
Transform tasks into verifiable goals before implementing:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

### Surgical Changes
When editing existing code:
- Remove imports/variables/functions that YOUR changes made unused
- Don't remove pre-existing dead code unless asked (mention it instead)

### Session Startup Protocol
At the beginning of each session:
1. Read `docs/PRODUCT.md` to understand what we're building
2. Read `docs/BUILD-STRATEGY.md` for tech stack and architecture decisions
3. Read `CONVENTIONS.md` to understand current patterns and standards
4. Read `docs/IMPLEMENTATION-PLAN.md` to understand the phase breakdown and current progress
5. Read `README.md` (if it exists) for project overview
6. Signal readiness by saying: "⏱️ So much time and so little to do. Wait. Strike that. Reverse it."

### During Implementation
- Follow patterns established in `CONVENTIONS.md` (if any exist)
- If you encounter a decision not covered by existing conventions, make a reasonable choice and document it
- Commit frequently with clear messages

### Completing Work
> When using the `/implement` pipeline, these steps are handled automatically by Step 7 (Finalize). Follow these manually only in non-pipeline sessions.

1. Review `CONVENTIONS.md` — see Self-Improving Protocol below
2. Signal completion by saying: "🧪 Invention is 93% perspiration, 6% electricity, 4% evaporation, and 2% butterscotch ripple. Do you concur?"

### Git Conventions
- Keep commits focused and atomic

### Self-Improving Protocol
This protocol ensures the codebase gets smarter over time. It is **not optional**—execute it after every implementation session.

> When using the `/implement` pipeline, this protocol is executed automatically in Step 7. Follow it manually in non-pipeline sessions.

**After completing any implementation work:**
1. Review `CONVENTIONS.md`
2. Ask yourself:
   - Did I establish any new patterns that should be replicated?
   - Did I discover that an existing pattern was problematic?
   - Did I try an approach that failed and should be documented as an anti-pattern?
3. If yes to any: Update `CONVENTIONS.md` with the learning
4. For significant architectural changes: Add entry to `docs/DECISIONS.md`

**After resolving any bug or unexpected behavior:**
1. Identify root cause
2. Determine if it was caused by:
   - Missing pattern → Add the pattern to `CONVENTIONS.md`
   - Wrong pattern → Update the pattern in `CONVENTIONS.md`
   - One-off issue → No convention update needed
3. If a pattern caused the bug, document it as an anti-pattern with:
   - What the bad approach was
   - Why it failed
   - What the correct approach is

### When to Ask for Human Input
- Unclear or ambiguous requirements
- Decisions that significantly deviate from established patterns
- Security-sensitive implementations
- External service integrations not covered in `docs/BUILD-STRATEGY.md`
- When stuck after 2-3 different approaches
- When unsure if a pattern change is warranted

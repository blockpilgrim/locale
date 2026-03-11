# Architectural Decisions

Record of significant architectural decisions that deviate from or extend the original BUILD-STRATEGY.md.

---

## D1. Use `@neondatabase/serverless` directly instead of `@vercel/postgres`

**Date:** 2026-03-10
**Context:** BUILD-STRATEGY.md specified "Vercel Postgres (Neon under the hood)" for the tightest Vercel integration. During implementation, we evaluated both drivers.
**Decision:** Use `@neondatabase/serverless` with Drizzle's `neon-http` adapter directly.
**Rationale:**
- The Neon HTTP driver is simpler — stateless, no connection pooling needed for serverless
- Direct Neon driver avoids the `@vercel/postgres` abstraction layer, which adds complexity without benefit when using Drizzle ORM
- The HTTP driver is the recommended pattern for serverless environments (each request is independent)
- Doesn't lock deployment to Vercel — any Neon-compatible Postgres works
**Trade-off:** Slightly less "zero-config" than the Vercel wrapper, but the configuration is minimal (just `DATABASE_URL`).

## D2. Tailwind v4 CSS-based tokens instead of `tailwind.config.ts`

**Date:** 2026-03-10
**Context:** IMPLEMENTATION-PLAN T0.1 references configuring `tailwind.config.ts`. Tailwind CSS v4 (shipped with current Next.js) replaces the JS config with CSS `@theme` blocks.
**Decision:** Use the Tailwind v4 `@theme` pattern in `globals.css` for all design tokens.
**Rationale:** This is the standard approach for Tailwind v4. The JS config file is a v3 pattern that v4 does not use.
**Trade-off:** None — this is the correct approach for the installed version.

## D3. Lazy database connection via `getDb()` function

**Date:** 2026-03-10
**Context:** Initial implementation exported `db` directly, which evaluated at module import time and threw if `DATABASE_URL` was missing.
**Decision:** Export a `getDb()` function that lazily initializes the connection on first use.
**Rationale:** Prevents build-time errors in `next build` and CI environments where `DATABASE_URL` may not be available. The Neon HTTP driver is stateless, so caching the Drizzle instance is safe.
**Trade-off:** Callers must use `getDb()` instead of a bare `db` import. Minor ergonomic cost.

## D4. Use Overpass API (OpenStreetMap) for POI data instead of paid provider

**Date:** 2026-03-10
**Context:** BUILD-STRATEGY Decision 2 recommends starting with "Mapbox POI API or a specialized provider like Radar/Foursquare, falling back to OSM via Overpass API only if necessary." The concern is that sparse/inaccurate POI data will lead the AI narrative to hallucinate.
**Decision:** Use the Overpass API (OpenStreetMap) as the primary and only POI data source for MVP.
**Rationale:**
- Free with no API key required — eliminates a paid dependency during prototyping
- OSM coverage is strong in US urban and suburban areas (the primary use case)
- 8 POI categories (dining, groceries, parks, fitness, nightlife, healthcare, shopping, education) are well-tagged in OSM
- The Overpass QL query can be precisely tuned to our tag map, reducing noise
- If POI quality proves insufficient post-MVP, switching to a paid provider requires changing only `src/lib/poi/index.ts` — the typed interface (`PoiResult`, `PointOfInterest`) remains stable
**Trade-off:** Community-run infrastructure with variable availability and no SLA. Added `AbortSignal.timeout(20s)` to mitigate. Data may be sparser in rural areas. Monitor POI quality during golden dataset testing (T7.1).

## D5. Insert-then-retry for slug uniqueness instead of check-then-insert

**Date:** 2026-03-10
**Context:** The initial implementation of `generateUniqueSlug` checked the database for an existing slug, then inserted. Under concurrent requests for similar addresses, two requests could both read "slug is available" and both attempt to insert, causing a unique constraint violation (Postgres error 23505).
**Decision:** Replace with insert-then-retry pattern: attempt the INSERT directly, catch unique constraint errors, and retry with a random 5-char suffix (up to 3 retries).
**Rationale:** Eliminates the TOCTOU (time-of-check-to-time-of-use) race condition entirely. Simpler than wrapping in a transaction with row-level locking. The retry overhead is negligible since collisions are rare.
**Trade-off:** Slightly more complex error detection (inspecting error messages for "unique"/"duplicate key"/"23505") vs. a clean database-level check.

## D6. Case-insensitive address cache lookup

**Date:** 2026-03-10
**Context:** The report generation route checks for existing reports by matching the address string. Exact string matching meant "123 Main St" and "123 main st" would generate separate (duplicate) reports for the same location.
**Decision:** Use SQL `lower()` for case-insensitive comparison in the cache lookup query.
**Rationale:** Reduces unnecessary duplicate report generation and wasted API costs (each report triggers Mapbox, Census, and LLM calls). The `sql` tagged template from `drizzle-orm` provides escape-safe raw SQL for operations not expressible in the type-safe query builder.
**Trade-off:** Cannot use a standard Postgres index on `address` for this query. For MVP traffic this is fine; at scale, add a functional index: `CREATE INDEX ON locations (lower(address))`.

## D7. Custom walkability heuristic instead of third-party walk score

**Date:** 2026-03-10
**Context:** The GettingAroundSection needs to display a walkability assessment (A/B/C/D score). Third-party walk score services (Walk Score API) are paid and require API keys. We already have POI data from Overpass.
**Decision:** Use a custom heuristic in `GettingAroundSection.tsx` based on POI count and category diversity to derive a qualitative walkability label (A: Very Walkable, B: Walkable, C: Somewhat Walkable, D: Car-Dependent).
**Rationale:** The POI data from Overpass already captures what's within walking distance. A simple threshold (e.g., 40+ POIs across 6+ categories = "Very Walkable") provides a meaningful signal without adding another paid API dependency. The thresholds were chosen to roughly correspond to urban, suburban, and rural patterns.
**Trade-off:** Less sophisticated than Walk Score's proprietary algorithm. May not capture transit infrastructure quality or street connectivity. Can be replaced with a third-party API post-MVP if the heuristic proves insufficient.

## D8. Separate AI call for archetype classification vs. embedding in narrative

**Date:** 2026-03-11
**Context:** The neighborhood archetype could be generated in two ways: (a) as part of the narrative prompt, requesting both prose and structured JSON; (b) as a separate AI call with its own system prompt.
**Decision:** Use a separate AI call (`generateText` with temperature 0.3, 500 max tokens) in `src/lib/report/archetype.ts`.
**Rationale:** Different temperature (0.3 for consistency vs. 0.7 for narrative creativity), different output format (strict JSON vs. free-form prose), independent failure handling (archetype is non-fatal), and easier eval testing. The user prompt is reused from `narrative.ts` to avoid maintaining two data serialization functions.
**Trade-off:** Two AI calls per report instead of one. Adds ~1-2s to generation time. Mitigated by sequencing archetype before narrative (archetype informs narrative context) and 5s timeout fallback.

## D9. Non-fatal archetype classification with null fallback

**Date:** 2026-03-11
**Context:** Archetype classification could fail (API errors, malformed JSON, validation failures). The question is whether this should block report generation.
**Decision:** Archetype failure returns `null` and does not change report status. Components null-guard and skip rendering.
**Rationale:** The report is valuable without archetype data. Blocking report generation on an enrichment feature degrades the core experience. Pre-feature reports also lack archetype data and must render correctly.
**Trade-off:** Reports may have inconsistent presentation (some with archetype, some without). This is acceptable as graceful degradation.

## D10. Satori with TTF fonts for social card generation

**Date:** 2026-03-11
**Context:** OG images were previously Mapbox Static Images URLs. The archetype feature requires richer, branded social cards.
**Decision:** Use `@vercel/og` (Satori + Resvg) with TTF font files in `public/fonts/`. Card route at `GET /api/report/[slug]/card`.
**Rationale:** Server-side PNG generation that matches the editorial design system. Deterministic output enables aggressive caching (`immutable`). Satori supports JSX layout and basic SVG, sufficient for the pentagon chart and typography.
**Trade-off:** ~330KB of font files added to `public/`. Satori doesn't support all CSS — card components must use inline styles. Font files must be kept in sync with the Google Fonts used by the app.

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

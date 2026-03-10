# Locale — Implementation Plan

## Phase 0: Project Scaffolding
> Foundation that everything depends on. Must be done first, sequentially.

- [ ] **T0.1 — Next.js project init + core config**
  Initialize Next.js (App Router, TypeScript), install core dependencies (`tailwindcss`, `framer-motion`, `mapbox-gl`), configure `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `.eslintrc.json`, `.gitignore`, `.env.example` with all expected env vars. Set up `src/` directory structure: `app/`, `components/`, `lib/`, `types/`. Establish the Tailwind design tokens (colors, fonts, spacing) that express the "magazine not dashboard" principle.

- [ ] **T0.2 — Database setup + schema**
  Install Drizzle ORM + `@neondatabase/serverless` (Neon HTTP driver for serverless compatibility). Define schema in `lib/db/schema.ts`: `locations`, `reports` (with JSONB `data` column, `status` enum, unique `slug`), optional `search_queries`. Write migration script. Add a `lib/db/index.ts` connection helper with lazy initialization. Verify migration generates cleanly.
  - *Depends on:* T0.1

---

## Phase 1: Data Layer — API Clients & Backend
> These are independent of each other and can be built in parallel after Phase 0.

- [ ] **T1.1 — Mapbox geocoding client + autocomplete API route**
  Build `lib/mapbox/geocoding.ts` — wrapper around Mapbox Geocoding API (forward geocode, US-only filtering). Create `app/api/geocode/route.ts` that proxies client requests, keeping the secret token server-side. Return structured suggestions with coordinates. Add TypeScript types for geocode responses.
  - *Depends on:* T0.1
  - *Parallelizable with:* T1.2, T1.3, T1.4, T1.5

- [ ] **T1.2 — Mapbox isochrone client**
  Build `lib/mapbox/isochrone.ts` — fetches 5/10/15-minute walking isochrone polygons for given coordinates. Return GeoJSON. Add types.
  - *Depends on:* T0.1
  - *Parallelizable with:* T1.1, T1.3, T1.4, T1.5

- [ ] **T1.3 — Census ACS data client**
  Build `lib/census/index.ts` — fetches demographics, housing, economic data from Census Bureau ACS API for a given lat/lng (reverse geocode to FIPS code first). Structure response into typed sections: `demographics`, `housing`, `economic`. Include city-level and national averages for comparison. Handle missing fields gracefully.
  - *Depends on:* T0.1
  - *Parallelizable with:* T1.1, T1.2, T1.4, T1.5

- [ ] **T1.4 — POI / amenities data client**
  Build `lib/poi/index.ts` — fetches nearby points of interest via Mapbox POI API (or Overpass as fallback). Categorize results: dining, groceries, parks, fitness, nightlife, healthcare, shopping, education. Calculate walking time to nearest essentials. Return structured, typed data.
  - *Depends on:* T0.1
  - *Parallelizable with:* T1.1, T1.2, T1.3, T1.5

- [ ] **T1.5 — Rate limiting middleware**
  Build `lib/rate-limit.ts` using `@upstash/ratelimit` or a simple in-memory limiter for dev. Create reusable middleware for API routes. Configure: 10 reports/IP/hour. Return appropriate 429 responses.
  - *Depends on:* T0.1
  - *Parallelizable with:* T1.1–T1.4

---

## Phase 2: Report Generation Engine
> The core orchestrator. Depends on all Phase 1 data clients.

- [ ] **T2.1 — Report orchestrator + slug generation**
  Build `lib/report/generate.ts` — the orchestrator function. Takes geocoded coordinates, fires `Promise.all` for Census, isochrone, and POI data. Generates a URL slug from the address. Creates `location` + `report` (status: `generating`) rows in the DB. Returns structured data payload. Handle partial failures per BUILD-STRATEGY Decision 4 (minimum viable report: map + at least one data section).
  - *Depends on:* T0.2, T1.2, T1.3, T1.4

- [ ] **T2.2 — AI narrative prompt + streaming**
  Build `lib/report/narrative.ts` — constructs the Claude prompt from structured data. Install `ai` + `@ai-sdk/anthropic`. The prompt must: synthesize all available data, maintain the "knowledgeable local friend" voice, acknowledge tradeoffs, explicitly handle missing data fields, be specific to the location. Build the streaming helper that pipes Claude's response. On stream completion, update the report row with the final narrative and `status: complete`.
  - *Depends on:* T2.1

- [ ] **T2.3 — Report generation API route**
  Create `app/api/report/generate/route.ts`. Accepts address + coordinates from the client. Checks DB for existing report (cache hit → return immediately). Otherwise, runs the orchestrator (T2.1), starts narrative streaming (T2.2), returns a streaming response. Apply rate limiting (T1.5). Create `app/api/report/[slug]/route.ts` for fetching saved reports by slug.
  - *Depends on:* T2.1, T2.2, T1.5

---

## Phase 3: Frontend — Core Components
> These can be built in parallel with each other after Phase 0. Some can start during Phase 1/2.

- [ ] **T3.1 — Layout shell + typography + design system components**
  Build `app/layout.tsx` with fonts, metadata, and global styles. Create shared components: `Container`, `SectionHeader`, `Badge`, `StatCard`, `Skeleton` loader. Establish the editorial/magazine visual language — typography scale, spacing rhythm, color palette. This sets the design DNA for every subsequent component.
  - *Depends on:* T0.1
  - *Parallelizable with:* T1.x, T3.2–T3.5

- [ ] **T3.2 — Address input with geocoding autocomplete**
  Build `components/AddressInput.tsx` — debounced input, calls `/api/geocode`, renders suggestion dropdown, handles selection, keyboard navigation, error states for unresolvable addresses. Mobile-friendly. This is the app's entry point interaction.
  - *Depends on:* T1.1, T3.1

- [ ] **T3.3 — Interactive map component**
  Build `components/Map.tsx` — Mapbox GL JS instance, centered on address coordinates, renders isochrone polygons as colored overlays (5/10/15 min), plots POI markers with category icons, supports pan/zoom/tap on desktop and mobile. Handle the map token via `NEXT_PUBLIC_MAPBOX_TOKEN`.
  - *Depends on:* T0.1, T3.1
  - *Parallelizable with:* T3.2, T3.4, T3.5

- [ ] **T3.4 — Data section components (Demographics, Housing, Economic, Getting Around, What's Nearby)**
  Build 5 section components, each rendering structured data with contextual visualizations (bar comparisons vs. city/national avg, donut charts for composition, icon grids for amenity categories). Each section gracefully hides when its data is missing. Use Framer Motion for reveal animations. Source attribution footers on each section.
  - *Depends on:* T3.1
  - *Parallelizable with:* T3.2, T3.3, T3.5

- [ ] **T3.5 — AI narrative display with streaming**
  Build `components/VibeCheck.tsx` — renders the AI narrative with a streaming text effect (character-by-character or word-by-word). Styled as the editorial centerpiece — large type, generous whitespace. Loading skeleton before stream starts. Uses `useChat` or a custom hook consuming the streaming API response.
  - *Depends on:* T3.1
  - *Parallelizable with:* T3.2, T3.3, T3.4

---

## Phase 4: Pages + Integration
> Wire everything together into the actual routes.

- [ ] **T4.1 — Homepage**
  Build `app/page.tsx` — hero section with value proposition, prominent `AddressInput`, featured/example report cards linking to pre-generated reports. Responsive layout (375px+). This is the landing experience.
  - *Depends on:* T3.1, T3.2

- [ ] **T4.2 — Report page + progressive loading**
  Build `app/report/[slug]/page.tsx` — the core report experience. Server-side: fetch report from DB by slug (for SSR + OG metadata). Client-side: if report is `generating`, show progressive loading (map first → data sections as they resolve → streaming narrative). If `complete`, render full report from cached data. Compose: Map, data sections, VibeCheck, share controls. Responsive layout.
  - *Depends on:* T2.3, T3.3, T3.4, T3.5

- [ ] **T4.3 — Report generation flow (client-side orchestration)**
  Build the client-side flow: user selects address on homepage → POST to generate API → redirect to `/report/[slug]` → report page handles progressive rendering. Loading/transition states between homepage and report. Error handling for failed generation (retry CTA). This is the glue between the homepage and the report page.
  - *Depends on:* T4.1, T4.2

---

## Phase 5: Shareability + SEO
> Depends on the report page being functional.

- [ ] **T5.1 — Dynamic Open Graph metadata + social previews**
  Implement `generateMetadata` in the report page for dynamic OG tags (title: address/neighborhood name, description: first ~150 chars of narrative, image: static map thumbnail via Mapbox Static Images API). Add `app/api/og/route.tsx` if a custom OG image is needed (using `@vercel/og`). Test with social media debuggers.
  - *Depends on:* T4.2

- [ ] **T5.2 — Share controls + copy link**
  Build `components/ShareControls.tsx` — copy-to-clipboard button, native share API on mobile, Twitter/Facebook share links with pre-filled text. Placed prominently on the report page. "Generate your own report" CTA for viewers of shared reports.
  - *Depends on:* T4.2
  - *Parallelizable with:* T5.1

---

## Phase 6: Polish + Hardening

- [ ] **T6.1 — Error boundaries + edge case handling**
  Add React error boundaries around each report section (map, data, narrative) so one failure doesn't crash the page. Handle: invalid slugs (404 page), API timeouts (retry UI), empty data (section hiding). Test with the graceful degradation matrix from BUILD-STRATEGY Decision 4.
  - *Depends on:* T4.2

- [ ] **T6.2 — Mobile responsiveness pass**
  Audit and fix all components at 375px, 768px, 1024px, 1440px. Map touch interactions, data visualization scaling, narrative readability, address input usability on mobile keyboards. No horizontal scroll on any width.
  - *Depends on:* T4.3

- [ ] **T6.3 — Performance optimization**
  Lazy-load Mapbox GL JS. Optimize bundle with dynamic imports for heavy components. Verify parallel API fetching in the orchestrator. Add edge caching headers for completed reports. Lighthouse audit targeting 90+ performance score.
  - *Depends on:* T4.3
  - *Parallelizable with:* T6.1, T6.2

---

## Phase 7: Testing

- [ ] **T7.1 — Golden dataset prompt evaluation**
  Create `tests/golden-addresses.ts` with 20 diverse US addresses (urban, suburban, rural, gentrifying, wealthy, etc.). Build a script that generates reports for all 20 and outputs narratives for human review. This is the highest-ROI test per BUILD-STRATEGY.
  - *Depends on:* T2.2
  - *Parallelizable with:* T7.2

- [ ] **T7.2 — Mocked API integration tests**
  Write tests for the report orchestrator and each API client using mocked responses. Cover: successful responses, partial data, missing fields, timeouts, malformed responses. Verify the minimum viable report logic. Use Vitest or Jest.
  - *Depends on:* T2.1
  - *Parallelizable with:* T7.1

---

## Dependency Graph

```
T0.1 ──→ T0.2 ──→ T2.1 ──→ T2.2 ──→ T2.3 ──→ T4.2 ──→ T4.3
  │                  ↑                            ↑         │
  ├→ T1.1 ──→ T3.2  │                            │         ├→ T6.1
  ├→ T1.2 ───────────┤                            │         ├→ T6.2
  ├→ T1.3 ───────────┤        T3.3 ───────────────┤         └→ T6.3
  ├→ T1.4 ───────────┘        T3.4 ───────────────┤
  ├→ T1.5 ──────────────────→ T2.3                │
  │                            T3.5 ───────────────┘
  └→ T3.1 ──→ T3.2, T3.3, T3.4, T3.5 ──→ T4.1 ──→ T4.3

T4.2 ──→ T5.1, T5.2
T2.1 ──→ T7.2
T2.2 ──→ T7.1
```

## Maximum Parallelism Windows

| Window | Tasks that can run concurrently |
|--------|-------------------------------|
| After T0.1 | T1.1, T1.2, T1.3, T1.4, T1.5, T3.1 |
| After T0.2 + T3.1 | T3.3, T3.4, T3.5 (while Phase 1 finishes) |
| After T1.1 + T3.1 | T3.2 |
| After T4.2 | T5.1, T5.2, T6.1 |
| After T4.3 | T6.2, T6.3 |
| After T2.1/T2.2 | T7.1, T7.2 (can start before frontend is done) |

**Critical path:** T0.1 → T0.2 → T2.1 → T2.2 → T2.3 → T4.2 → T4.3

**Total tasks: 22**

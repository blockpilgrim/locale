# Locale

AI-powered neighborhood intelligence for any US address.

**Live at [locale.report](https://locale.report)**

![Locale — homepage](public/screenshots/homepage-full.png)

## What It Does

Locale turns any US street address into an editorial-quality neighborhood report. It pulls real data from the Census Bureau, OpenStreetMap, and Mapbox, then uses Claude to synthesize it into something that reads like a city guide — not a spreadsheet.

The core insight: the gap between "median household income: $72,400" and "this is a neighborhood where young families walk to the farmers market on Saturday mornings" is where real understanding lives. Census data and POI counts exist everywhere, but nobody weaves them into a narrative that conveys what a place actually *feels like*. Locale does that.

Each report includes:

- **Interactive map** with 5/10/15-minute walking isochrones and categorized POI markers
- **Neighborhood archetype** — AI-classified personality (e.g., "The Neon Mile") with a pentagon radar chart scoring five vibe dimensions
- **Five data sections** — demographics, housing, economics, getting around, and what's nearby — contextualized against city and national averages
- **The Vibe Check** — a Claude-generated narrative that synthesizes all the data into a specific, honest portrait of daily life in that area
- **Shareable social cards** with dynamic OG images, generated server-side via Satori

Reports persist at human-readable URLs. Shared links render instantly with rich previews.

![Locale — report page](public/screenshots/report-full.png)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| AI | Claude Sonnet via Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) — two separate calls: archetype classification + narrative generation |
| Database | Neon Postgres (HTTP driver), Drizzle ORM, JSONB snapshots for report data |
| Map | Mapbox GL JS, Mapbox Isochrone API, Mapbox Geocoding v6 |
| Data sources | US Census ACS 5-Year API, OpenStreetMap via Overpass API |
| Styling | Tailwind CSS v4 (CSS-based design tokens), Framer Motion |
| OG images | Satori + `@vercel/og`, custom TTF fonts, SVG pentagon chart |
| Testing | Vitest — 223 tests across 15 files, plus a 20-address golden dataset for narrative evaluation |

## Architecture

```
User enters address
  → Mapbox Geocoding autocomplete
  → POST /api/report/generate
    → DB cache check (case-insensitive address match)
    → Cache miss: Census + Isochrone + POI fetched via Promise.all
    → Insert location + report rows (status: generating), return slug
  → Redirect to /report/[slug]
    → Client triggers archetype classification (non-fatal, 5s timeout)
    → Client triggers narrative generation (Claude)
    → AutoRefresh polls via router.refresh() until complete
```

Notable decisions:

- **Data snapshots, not live queries.** Report data is frozen as JSONB at generation time. A shared link always shows the data the narrative was written against, even months later.
- **Non-fatal AI enrichment.** The archetype call can fail silently — the report still renders with everything else. Components null-guard and skip rendering rather than crashing.
- **Custom walkability scoring.** POI density within isochrone rings, scored A through D. No third-party walkability API — the isochrone and POI data we already have is sufficient.
- **Parallel data fetching with independent failure.** Census, isochrone, and POI calls run concurrently. Each `.catch()` returns null. A report needs at least one data source to succeed; the AI narrative adapts to whatever data is available.
- **Server components with client islands.** Pages are RSC. Interactivity (map, address input, share controls) is isolated to `"use client"` boundaries.

Full decision log in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Getting Started

```bash
git clone https://github.com/blockpilgrim/locale.git
cd locale
npm install

cp .env.example .env.local
# Required: DATABASE_URL, MAPBOX_ACCESS_TOKEN, NEXT_PUBLIC_MAPBOX_TOKEN,
#           CENSUS_API_KEY, ANTHROPIC_API_KEY

npm run db:push   # Push schema to database
npm run dev       # Start dev server
```

## Testing

```bash
npm run test              # 223 tests, single run
npm run test:watch        # Watch mode
npm run test:eval --live  # Generate narratives for 20 golden addresses with real AI calls
```

## Status

Shipped MVP. All implementation phases complete, including the archetype and social card features. The product loop works end-to-end: address input → parallel data fetching → AI classification → AI narrative → shareable report with OG previews.

Remaining work is prompt tuning and narrative evaluation tooling — the product infrastructure is done.

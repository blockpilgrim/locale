# Archetype + Social Card — Implementation Plan

Implementation plan for the Neighborhood Archetype & Social Card feature described in [`docs/FEATURE-ARCHETYPE.md`](./FEATURE-ARCHETYPE.md). Organized as tasks within steps, following the same format as the original [`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md).

**Prerequisite state:** All 8 phases of the original plan are complete. 153 tests passing. MVP is feature-complete.

---

## Step 1: Types + Classification Backend

> New TypeScript types, classification prompt, API route, and DB integration. No frontend changes. Independently demoable via API.

- [x] **T1.1 — ArchetypeResult type + ReportData extension**

  Add `ArchetypeResult` interface and extend the existing `ReportData` interface.

  **Files to modify:**
  - `src/lib/report/generate.ts` — Add `ArchetypeResult` interface export. Add `archetype: ArchetypeResult | null` field to `ReportData`.

  ```typescript
  export interface ArchetypeResult {
    archetype: string;       // "The Brownstone Belt"
    tagline: string;         // "Where stoops are social..."
    vibeSpectrum: {
      walkable: number;      // 0-100
      buzzing: number;
      settled: number;
      accessible: number;
      diverse: number;
    };
    definingTraits: [string, string, string];
    reasoning: string;       // internal only, not displayed
  }
  ```

  **Notes:**
  - Existing reports in the DB have no `archetype` field in their JSONB — the `| null` type handles this. Components must null-check.
  - Co-locate with `ReportData` in `generate.ts` since it's part of the same JSONB payload (follows established pattern: types co-located with their module).
  - No schema migration needed — `archetype` lives inside the existing JSONB `data` column.

  **Verify:** `npm run build` passes. Existing tests pass (type is additive, default `null`).

  ---

- [x] **T1.2 — Archetype classification prompt + AI call**

  Create the archetype classification module with system/user prompt construction and the `classifyArchetype()` function.

  **Files to create:**
  - `src/lib/report/archetype.ts` — System prompt with seed catalog, `classifyArchetype(reportId, data)` function, JSON parsing + validation.

  **Design decisions:**
  - **Separate module** from `narrative.ts` — different temperature (0.3 vs 0.7), different output format (structured JSON vs. free-form prose), different max tokens (500 vs 2000). Matches the spec's rationale in Section 5.
  - **Reuse `buildUserPrompt(data)`** from `narrative.ts` for the user prompt — same data payload, different system prompt. Export it (already exported for testing).
  - **Model:** `claude-sonnet-4-6` (same as narrative, per spec).
  - **Temperature:** 0.3 (consistency over creativity).
  - **Max tokens:** 500.
  - **Use `generateText`** (not `streamText`) since we need the complete JSON response, not a stream. Import from `"ai"`.
  - **JSON parsing:** Parse the response with `JSON.parse()`. Validate required fields exist and spectrum values are 0-100. On parse failure, return `null` (graceful degradation).
  - **Persistence:** On success, merge the archetype into the report's existing `data` JSONB. On failure, leave `data.archetype` as `null` — report renders without it.
  - **Env validation:** Reuse the same `getApiKey()` pattern from `narrative.ts`.

  **Prompt structure (system):**
  ```
  You are a neighborhood classification system. Given structured data about a
  US neighborhood, you assign it a personality archetype...

  SEED ARCHETYPES (use one if it fits, or create a new label in the same style):
  [16 seeds from Section 4 of feature spec]

  OUTPUT FORMAT (strict JSON):
  { archetype, tagline, vibeSpectrum, definingTraits, reasoning }

  RULES:
  - archetype: 2-5 words, title case, evocative but not cutesy
  - tagline: one sentence, vivid and specific, no cliches
  - vibeSpectrum: each value 0-100, justified by data
  - definingTraits: exactly 3 short data-grounded phrases
  - reasoning: 1-2 sentences, for internal eval only
  - Respond with ONLY the JSON object, no markdown fencing
  ```

  **Verify:** Unit test — given mock data, `classifyArchetype()` returns a valid `ArchetypeResult` or `null`. Test JSON parse failure path.

  ---

- [x] **T1.3 — POST /api/report/[slug]/archetype route**

  New API route that triggers archetype classification for a report in `generating` status.

  **Files to create:**
  - `src/app/api/report/[slug]/archetype/route.ts`

  **Pattern:** Mirrors `src/app/api/report/[slug]/narrative/route.ts` exactly:
  1. Look up report by slug
  2. Validate status is `generating` and `data` exists
  3. Call `classifyArchetype(report.id, report.data as ReportData)`
  4. Return `{ status: "classified", archetype }` on success or `{ status: "skipped" }` on failure
  5. **Does not change report status** — archetype failure is non-fatal. The report stays in `generating` status and narrative generation proceeds regardless.

  **Key difference from narrative route:** This route does not set report status to `failed` on error. Archetype is optional; narrative is required for completion.

  **Verify:** `curl -X POST /api/report/{slug}/archetype` returns archetype JSON for an existing generating report.

  ---

- [x] **T1.4 — Unit tests for archetype classification**

  **Files to create:**
  - `src/lib/__tests__/archetype.test.ts`

  **Test cases:**
  - Prompt construction includes seed archetypes and all available data sections
  - Valid JSON response is parsed into `ArchetypeResult`
  - Malformed JSON returns `null` (not throw)
  - Missing required fields returns `null`
  - Spectrum values outside 0-100 are clamped or rejected
  - `definingTraits` must have exactly 3 items
  - When `ANTHROPIC_API_KEY` is missing, throws eagerly

  **Mocking:** `vi.spyOn(globalThis, "fetch")` or mock the `ai` module's `generateText` — follow established pattern from `integration.test.ts`.

  **Verify:** `npx vitest run src/lib/__tests__/archetype.test.ts` passes.

---

## Step 2: Report Flow Integration

> Wire archetype into the generation flow. ArchetypeTrigger fires before NarrativeTrigger. No visual changes yet.

- [x] **T2.1 — ArchetypeTrigger client component**

  **Files to create:**
  - `src/components/ArchetypeTrigger.tsx`

  **Pattern:** Same as `NarrativeTrigger.tsx`:
  - `"use client"` component that renders `null`
  - Fires `POST /api/report/[slug]/archetype` on mount
  - Uses `useRef(false)` guard against React strict mode double-invocation
  - **On completion callback:** Accepts an `onComplete` prop. Calls it when the POST resolves (success or failure) so the parent can then trigger narrative generation.
  - `.catch()` swallows errors — archetype failure is non-fatal

  ```typescript
  interface ArchetypeTriggerProps {
    slug: string;
    onComplete?: () => void;
  }
  ```

  **Why `onComplete`?** The spec requires archetype → narrative sequencing (Section 7.1). The archetype result can optionally inform the narrative prompt. Rather than a monolithic orchestrator component, we use a callback to keep the components simple and composable.

  **Verify:** Component mounts, fires POST, calls `onComplete`.

  ---

- [x] **T2.2 — GenerationOrchestrator client component**

  **Files to create:**
  - `src/components/GenerationOrchestrator.tsx`

  Replaces the current direct usage of `NarrativeTrigger` + `AutoRefresh` on the report page's "generating" state. Orchestrates the sequence:

  1. Render `ArchetypeTrigger` immediately → fires archetype classification
  2. On archetype completion (or 5s timeout) → render `NarrativeTrigger` → fires narrative generation
  3. `AutoRefresh` polls throughout

  ```typescript
  "use client";

  export function GenerationOrchestrator({ slug }: { slug: string }) {
    const [archetypeDone, setArchetypeDone] = useState(false);

    // Timeout fallback — don't block narrative on slow archetype
    useEffect(() => {
      const timer = setTimeout(() => setArchetypeDone(true), 5000);
      return () => clearTimeout(timer);
    }, []);

    return (
      <>
        <ArchetypeTrigger slug={slug} onComplete={() => setArchetypeDone(true)} />
        {archetypeDone && <NarrativeTrigger slug={slug} />}
        <AutoRefresh intervalMs={3000} />
      </>
    );
  }
  ```

  **Verify:** Network tab shows archetype POST fires first, narrative POST fires after archetype completes (or after 5s timeout).

  ---

- [x] **T2.3 — Update report page to use GenerationOrchestrator**

  **Files to modify:**
  - `src/app/report/[slug]/page.tsx` — Replace the `generating` status block's `<NarrativeTrigger>` + `<AutoRefresh>` with `<GenerationOrchestrator>`.

  **Before:**
  ```tsx
  <NarrativeTrigger slug={row.slug} />
  <AutoRefresh intervalMs={3000} />
  ```

  **After:**
  ```tsx
  <GenerationOrchestrator slug={row.slug} />
  ```

  Import `GenerationOrchestrator` instead of importing `NarrativeTrigger` and `AutoRefresh` directly (they're now encapsulated).

  **Verify:** Generate a new report. DevTools network tab shows: archetype POST → narrative POST → report completes. Existing reports still load correctly.

---

## Step 3: Archetype Banner (Frontend)

> Pentagon chart + archetype display on the report page. The visual centerpiece.

- [x] **T3.1 — VibeSpectrum pentagon SVG component**

  **Files to create:**
  - `src/components/VibeSpectrum.tsx`

  A pure SVG component that renders the radar/pentagon chart. Accepts `vibeSpectrum` scores as props.

  **Implementation:**
  - 5 axes equally spaced at 72° intervals around a circle, starting from top (Walkable)
  - Axis order (clockwise from top): Walkable, Buzzing, Settled, Accessible, Diverse
  - Two `<polygon>` elements:
    1. Background: all vertices at full radius, stroke only (`--color-border` / `#E7E0D6`), shows the max shape
    2. Data: vertices at `score / 100 * radius`, filled with `--color-accent` at 15% opacity, stroked at full
  - Axis labels rendered as `<text>` elements outside the pentagon
  - Optional score values next to each label
  - SVG viewBox designed for reuse in both the page component and Satori card generation
  - `aria-label` listing all five scores for screen reader accessibility

  **Design tokens:**
  - Fill: `rgba(45, 90, 61, 0.15)` (accent at 15% opacity — comment: `/* --color-accent at 15% */`)
  - Stroke: `#2D5A3D` (comment: `/* --color-accent */`)
  - Background stroke: `#E7E0D6` (comment: `/* --color-border */`)
  - Labels: `#78716C` (comment: `/* --color-ink-muted */`)

  **Props interface:**
  ```typescript
  interface VibeSpectrumProps {
    scores: {
      walkable: number;
      buzzing: number;
      settled: number;
      accessible: number;
      diverse: number;
    };
    size?: number;        // SVG width/height, default 240
    showLabels?: boolean; // default true
    showScores?: boolean; // default true
    className?: string;
  }
  ```

  **Note:** This component must work in both React DOM and Satori contexts. Satori supports a subset of CSS — use only inline styles and basic SVG elements. No Framer Motion on this component.

  **Verify:** Renders correctly at multiple sizes. Scores of [100,100,100,100,100] produce a regular pentagon. Scores of [0,0,0,0,0] produce a point. Asymmetric scores produce the expected lopsided shape.

  ---

- [x] **T3.2 — ArchetypeBanner component**

  **Files to create:**
  - `src/components/ArchetypeBanner.tsx`

  The banner that appears below the report header, above the map. Displays archetype label, tagline, defining traits, and the vibe spectrum pentagon.

  **Layout (per wireframe 02):**
  - Desktop: two-column. Left: archetype label (Playfair Display, large), tagline (Inter italic), three defining trait pills. Right: VibeSpectrum pentagon.
  - Mobile (per wireframe 03): single-column stack. Label, tagline, traits (wrapped), pentagon below.

  **Design:**
  - `"use client"` (Framer Motion for entrance animation)
  - Background: subtle accent green at very low opacity (`bg-accent-subtle/30`)
  - Archetype label: `font-serif` (Playfair Display), `text-2xl sm:text-3xl`
  - Tagline: `italic text-ink-muted`
  - Defining traits: rendered as inline pills with middot separators, `text-sm`
  - Wrapped in `motion.section` with `fadeUp` variant
  - Accepts `ArchetypeResult` as prop, renders nothing if `null`

  **Props:**
  ```typescript
  interface ArchetypeBannerProps {
    archetype: ArchetypeResult;
    className?: string;
  }
  ```

  **Verify:** Renders correctly with sample data. Responsive at 375px and 1440px. Returns `null` gracefully when archetype data is missing.

  ---

- [x] **T3.3 — Integrate ArchetypeBanner into ReportContent**

  **Files to modify:**
  - `src/components/ReportContent.tsx`

  Insert the `ArchetypeBanner` between the report header and the map section:

  ```tsx
  {/* Archetype banner — below header, above map */}
  {data.archetype && (
    <section className="pt-10 sm:pt-14">
      <Container variant="content">
        <SectionErrorBoundary sectionName="Archetype">
          <ArchetypeBanner archetype={data.archetype} />
        </SectionErrorBoundary>
      </Container>
    </section>
  )}
  ```

  **Placement:** After the `</header>` block, before the Map `<section>`. The archetype sets the tone; the map and data sections are the evidence.

  **Null handling:** `data.archetype` will be `null` for:
  - Reports generated before this feature (no migration needed)
  - Reports where classification failed (graceful degradation)
  Both cases simply skip the banner.

  **Verify:** New reports show the archetype banner. Old reports (without archetype data) render identically to before.

---

## Step 4: Social Card Generation

> Server-side image generation with Satori / @vercel/og. New API route for OG and Story card formats.

- [x] **T4.1 — Install @vercel/og + bundle font files**

  **Commands:**
  ```bash
  npm install @vercel/og
  ```

  **Font files:** Satori requires raw font data (ArrayBuffer) at runtime — it can't use Google Fonts or CSS font-face. Download and place:
  - `public/fonts/PlayfairDisplay-Bold.ttf` (for archetype label)
  - `public/fonts/Inter-Regular.ttf` (for body text)
  - `public/fonts/Inter-Medium.ttf` (for labels/traits)

  These fonts are already used by the app via `next/font/google` in `layout.tsx`. The `.ttf` files are separate assets needed only for Satori image generation.

  **Verify:** Font files exist in `public/fonts/` and are loadable via `fetch` in a server context.

  ---

- [x] **T4.2 — Pentagon chart renderer for Satori**

  The `VibeSpectrum` component from T3.1 should already work in Satori since it uses basic SVG. However, Satori has JSX rendering constraints — verify and create a Satori-compatible variant if needed.

  **Files to create (if needed):**
  - `src/lib/report/card-components.tsx` — Satori-compatible JSX components for the card layout (pentagon, text layout, branding). These use `style={{ }}` props instead of Tailwind classes (Satori doesn't process Tailwind).

  **Alternative:** If `VibeSpectrum.tsx` uses only inline styles and SVG elements (no Tailwind classes on the SVG), it can be reused directly. Design T3.1 with this in mind.

  **Verify:** Pentagon renders correctly in a `new ImageResponse(...)` test call.

  ---

- [x] **T4.3 — GET /api/report/[slug]/card route**

  **Files to create:**
  - `src/app/api/report/[slug]/card/route.tsx`

  **Query params:**
  - `format=og` (default) → 1200x630px OG card
  - `format=story` → 1080x1920px story card

  **Implementation:**
  1. Fetch report by slug (same `getDb()` pattern as other routes)
  2. Extract `data.archetype` from the report JSONB
  3. If no archetype data, return a fallback image (the existing Mapbox static map, or a branded placeholder)
  4. Load font files via `fetch(new URL('/fonts/...', import.meta.url))`
  5. Render JSX → `ImageResponse` using `@vercel/og`

  **Response headers:**
  ```
  Content-Type: image/png
  Cache-Control: public, s-maxage=31536000, immutable
  ```

  Cards are deterministic for a given report. Aggressive caching is safe.

  **OG Card layout (1200x630):**
  ```
  ┌─────────────────────────────────────────────┐
  │  LOCALE · NEIGHBORHOOD INTELLIGENCE          │
  │  {address}                                    │
  │  {city, state}                                │
  │                                               │
  │  [Pentagon]    {ARCHETYPE LABEL}              │
  │               {tagline}                       │
  │               {trait} · {trait} · {trait}      │
  │                                               │
  │                          locale.leroi.ai  ◈   │
  └─────────────────────────────────────────────┘
  ```

  **Story Card layout (1080x1920):**
  ```
  ┌───────────────┐
  │  ◈ LOCALE     │
  │  {address}    │
  │  {city, st}   │
  │               │
  │  [Pentagon]   │
  │  Walkable  97 │
  │  Buzzing   94 │
  │  Settled   78 │
  │  Access.    8 │
  │  Diverse   61 │
  │               │
  │  {ARCHETYPE}  │
  │  {tagline}    │
  │  ───────────  │
  │  {trait 1}    │
  │  {trait 2}    │
  │  {trait 3}    │
  │  ───────────  │
  │  What's your  │
  │  neighborhood?│
  │  locale.ai    │
  └───────────────┘
  ```

  **Design tokens (inline styles for Satori):**
  - Background: `#FAF7F2` (cream)
  - Accent: `#2D5A3D`
  - Text: `#1C1917` (ink)
  - Muted: `#78716C` (ink-muted)

  **Verify:** `curl /api/report/{slug}/card` returns a valid PNG. `curl /api/report/{slug}/card?format=story` returns a taller PNG. Both render text, pentagon, and branding.

  ---

- [x] **T4.4 — Unit tests for card generation**

  **Files to create:**
  - `src/lib/__tests__/card.test.ts`

  **Test cases:**
  - Route returns 404 for non-existent slug
  - Route returns fallback for report without archetype
  - Route returns PNG content-type for valid report
  - Query param `format=story` produces different dimensions
  - Cache-Control header is set correctly
  - Pentagon vertex calculation produces correct coordinates for known inputs

  **Verify:** `npx vitest run src/lib/__tests__/card.test.ts` passes.

---

## Step 5: Distribution Integration

> OG image update, story card download, homepage featured card enhancement. The highest-leverage changes.

- [x] **T5.1 — Update generateMetadata to use card route for OG image**

  **Files to modify:**
  - `src/app/report/[slug]/page.tsx` — In `generateMetadata()`, replace the Mapbox Static Images URL with the card route URL when archetype data is available.

  **Logic:**
  ```typescript
  const reportData = row.data as ReportData | null;
  const hasArchetype = reportData?.archetype != null;

  const ogImage = hasArchetype
    ? `/api/report/${slug}/card?format=og`  // Archetype card
    : mapboxToken && validCoords             // Fallback: Mapbox static map
      ? `https://api.mapbox.com/...`
      : undefined;
  ```

  **Fallback behavior:** Reports without archetypes (pre-feature or classification failure) continue using the Mapbox static map OG image. No regression.

  **Note:** The `/api/report/{slug}/card` path is relative — Next.js will resolve it to the full URL in the rendered `<meta>` tag. If this doesn't work for external crawlers, use an absolute URL constructed from `NEXT_PUBLIC_BASE_URL` or similar.

  **Verify:** Share a report URL on Twitter card validator / Facebook debugger. The preview shows the archetype card, not the map thumbnail.

  ---

- [x] **T5.2 — Add "Download Card" button to ShareControls**

  **Files to modify:**
  - `src/components/ShareControls.tsx` — Add a "Download Card" button alongside existing share buttons.

  **Implementation:**
  - New `DownloadIcon` inline SVG
  - `handleDownloadCard` callback:
    1. `fetch(`/api/report/${slug}/card?format=story`)`
    2. Convert response to blob
    3. Create object URL
    4. Programmatic download via hidden `<a>` element with `download` attribute
    5. File name: `locale-${slug}.png`
    6. Revoke object URL after download

  **Props change:** `ShareControls` needs to know if archetype data exists (to conditionally show the download button). Add an optional `hasArchetype?: boolean` prop.

  **Button placement:** After "Copy link", before social share buttons. Same `buttonBase` styling.

  **Verify:** Click "Download Card" → PNG file downloads with correct name. Button hidden when archetype is null.

  ---

- [x] **T5.3 — Update ReportContent to pass hasArchetype to ShareControls**

  **Files to modify:**
  - `src/components/ReportContent.tsx` — Pass `hasArchetype={!!data.archetype}` to `<ShareControls>`.

  **Verify:** Download button appears for reports with archetype, absent for those without.

  ---

- [ ] **T5.4 — Homepage featured cards: archetype badge overlay** *(stretch goal)*

  **Files to modify:**
  - `src/components/FeaturedCard.tsx` — After a report is generated and has archetype data, show the archetype label as a badge overlay on the card.
  - `src/app/page.tsx` — No changes needed (data flows through FeaturedCard's POST response).

  **Implementation approach:** This is complex because FeaturedCards POST to generate and redirect — they don't have archetype data at render time. Two options:

  **Option A (simple):** Skip for now. The featured cards already work well. Add archetype badges in a future iteration when reports are pre-generated.

  **Option B (enhanced):** After the POST response comes back (before redirect), briefly flash the archetype label. Too complex for initial release.

  **Recommendation:** Option A. Mark as stretch goal. The ROI is low compared to the OG card and download button.

  **Verify:** Homepage renders correctly. No regressions.

---

## Step 6: Evaluation + Polish

> Golden dataset validation, consistency testing, edge cases, prompt tuning.

- [x] **T6.1 — Extend eval script for archetype classification**

  **Files to modify:**
  - `tests/eval-narratives.ts` — Add archetype classification alongside narrative generation. For each golden address, output:
    - Archetype label
    - Tagline
    - Vibe spectrum scores (formatted as a simple table)
    - Defining traits
    - Reasoning

  **New script addition:**
  - `npm run test:eval` already generates narratives for 20 golden addresses
  - Extend to also classify archetypes (separate AI call per address)
  - Output archetype results to `tests/output/archetype-{label}.json`

  **Verify:** `npm run test:eval --live` produces archetype results for all 20 golden addresses.

  ---

- [ ] **T6.2 — Consistency test script**

  **Files to create:**
  - `tests/eval-archetype-consistency.ts`

  **Purpose:** Run archetype classification 5 times for each of 5 selected golden addresses. Measure:
  - Label consistency (exact match or semantic equivalent)
  - Spectrum score variance (should be ±10 points)

  **Selected addresses (covering archetype diversity):**
  1. `dense-urban-manhattan` (should get The Urban Engine or similar)
  2. `urban-residential-brooklyn` (should get The Brownstone Belt or similar)
  3. `rural-small-town-galena` (should get Main Street Time Capsule or similar)
  4. `college-town-ann-arbor` (should get Campus Orbit or similar)
  5. `coastal-hermosa-beach` (should get Saltwater & Sunscreen or similar)

  **Script:**
  ```bash
  npm run test:eval:consistency  # new script in package.json
  ```

  **Output:** Table showing label and score variance per address. Flag any address where labels diverge meaningfully.

  **Verify:** >90% label consistency across runs. Spectrum variance within ±10 points.

  ---

- [x] **T6.3 — Edge case testing for partial data**

  **Files to modify:**
  - `src/lib/__tests__/archetype.test.ts` — Add test cases for partial data scenarios.

  **Test cases:**
  - Census only (no POI, no isochrone) → archetype should still classify, spectrum axes dependent on missing data default to 50
  - POI only → limited but functional classification
  - All sources failed → `classifyArchetype` should return `null` (no data to classify)
  - Census with some null fields (e.g., missing rent data) → archetype handles gracefully

  **Verify:** All edge case tests pass. Classification is robust to partial data.

  ---

- [ ] **T6.4 — Prompt tuning based on eval results**

  **Files to modify:**
  - `src/lib/report/archetype.ts` — Tune the system prompt based on golden dataset and consistency test results.

  **Common tuning areas:**
  - Seed archetype descriptions may need sharpening if the model confuses similar archetypes
  - Temperature adjustment (0.3 → 0.2 if consistency is too low)
  - Explicit instructions for handling missing data in spectrum scores
  - Tagline quality — add negative examples of generic taglines to avoid

  **Verify:** Re-run eval after tuning. Quality improves on previously weak results.

---

## Dependency Graph

```
T1.1 ─→ T1.2 ─→ T1.3 ─→ T1.4
                   │
                   ↓
         T2.1 ─→ T2.2 ─→ T2.3
                            │
                   ┌────────┤
                   ↓        ↓
         T3.1 ─→ T3.2 ─→ T3.3
                   │
                   ↓
         T4.1 ─→ T4.2 ─→ T4.3 ─→ T4.4
                            │
                   ┌────────┤
                   ↓        ↓
                 T5.1    T5.2 ─→ T5.3
                            │
                            ↓
                          T5.4 (stretch)

T1.4 ──→ T6.1 ─→ T6.2
T1.4 ──→ T6.3
T6.1 + T6.2 ──→ T6.4
```

## Maximum Parallelism Windows

| Window | Tasks that can run concurrently |
|--------|-------------------------------|
| Start | T1.1 (quick type addition) |
| After T1.1 | T1.2 (prompt + AI call) |
| After T1.2 | T1.3, T1.4 (route + tests in parallel) |
| After T1.3 | T2.1, T3.1 (trigger component + pentagon SVG in parallel) |
| After T2.1 | T2.2 |
| After T2.2 + T3.1 | T2.3, T3.2 (page update + banner in parallel) |
| After T3.2 | T3.3 |
| After T1.2 | T4.1 (font bundling, independent of frontend work) |
| After T4.1 + T3.1 | T4.2, T4.3 (Satori setup + route in parallel) |
| After T4.3 | T4.4, T5.1, T5.2 (tests + OG update + download button in parallel) |
| After T5.2 | T5.3 |
| After T1.4 | T6.1, T6.3 (eval extension + edge case tests in parallel) |
| After T6.1 | T6.2 |
| After T6.2 | T6.4 |

**Critical path:** T1.1 → T1.2 → T1.3 → T2.1 → T2.2 → T2.3 → T3.3 (archetype visible on page)

**Second critical path (cards):** T4.1 → T4.3 → T5.1 (OG image live)

**Total tasks: 18** (17 core + 1 stretch)

---

## New Files Summary

| File | Type | Purpose |
|------|------|---------|
| `src/lib/report/archetype.ts` | Module | Classification prompt + `classifyArchetype()` |
| `src/components/VibeSpectrum.tsx` | Component | Pentagon radar chart (SVG) |
| `src/components/ArchetypeBanner.tsx` | Component | Archetype display section |
| `src/components/ArchetypeTrigger.tsx` | Component | Client trigger for classification |
| `src/components/GenerationOrchestrator.tsx` | Component | Sequences archetype → narrative |
| `src/app/api/report/[slug]/archetype/route.ts` | API Route | POST archetype classification |
| `src/app/api/report/[slug]/card/route.tsx` | API Route | GET social card image |
| `src/lib/report/card-components.tsx` | Module | Satori-compatible card JSX (if needed) |
| `src/lib/__tests__/archetype.test.ts` | Tests | Archetype classification tests |
| `src/lib/__tests__/card.test.ts` | Tests | Card generation tests |
| `tests/eval-archetype-consistency.ts` | Script | Consistency evaluation |
| `public/fonts/PlayfairDisplay-Bold.ttf` | Asset | Font for Satori |
| `public/fonts/Inter-Regular.ttf` | Asset | Font for Satori |
| `public/fonts/Inter-Medium.ttf` | Asset | Font for Satori |

## Modified Files Summary

| File | Changes |
|------|---------|
| `src/lib/report/generate.ts` | Add `ArchetypeResult` type, extend `ReportData` |
| `src/app/report/[slug]/page.tsx` | Use `GenerationOrchestrator`, update OG image logic |
| `src/components/ReportContent.tsx` | Add `ArchetypeBanner` section, pass `hasArchetype` to `ShareControls` |
| `src/components/ShareControls.tsx` | Add "Download Card" button + `hasArchetype` prop |
| `tests/eval-narratives.ts` | Extend with archetype classification output |
| `package.json` | Add `@vercel/og` dependency, add `test:eval:consistency` script |

## Decisions Made

| # | Decision | Rationale |
|---|----------|-----------|
| A1 | Use `generateText` (not `streamText`) for archetype | We need complete JSON, not a stream. Simpler parsing, no partial responses. |
| A2 | Archetype failure is non-fatal | Report renders without archetype (graceful degradation). Only narrative is required for `complete` status. |
| A3 | 5-second timeout before narrative fires | Archetype classification is fast (~1-2s). 5s is generous. If it hasn't finished, don't block the user. |
| A4 | Reuse `buildUserPrompt()` from narrative.ts | Same data, different system prompt. Avoids maintaining two data serialization functions. |
| A5 | No DB schema migration | Archetype lives inside existing JSONB `data` column. Null-safe by convention. |
| A6 | Aggressive card caching (`immutable`) | Card image is deterministic for a given report. CDN caches indefinitely. |
| A7 | Skip homepage featured card archetype badge | Low ROI for initial release. Featured cards work fine without it. |
| A8 | Inline styles in Satori components | Satori doesn't process Tailwind classes. Shared components must use JSX `style={}`. |

---

*This plan implements the feature spec in [`docs/FEATURE-ARCHETYPE.md`](./FEATURE-ARCHETYPE.md). Wireframes are in [`docs/wireframes/`](./wireframes/). Does not commit to timelines.*

# Phase 3 Code Review — Frontend Core Components

**Date:** 2026-03-10
**Reviewer:** Claude Opus 4.6
**Status:** Pending resolution
**Branch:** main (commits d0223f2..e75ae7a)

---

## Summary

Phase 3 implements the full frontend component library for Locale: five design system primitives, four interactive components, five data section components, one custom hook, and a updated homepage. The implementation is generally solid — it follows established conventions, uses the Tailwind v4 design token system correctly, handles null/missing data gracefully throughout, and has good accessibility foundations. TypeScript compiles clean, ESLint reports no errors, and all 10 tests pass.

The review identifies two critical issues (XSS via `.setHTML()` and a Map memory leak on prop changes), several warnings around missing ARIA labels, duplicated code, and dead code, and a set of suggestions for improved robustness.

---

## Files Reviewed

| File | Category |
|------|----------|
| `src/components/Container.tsx` | Design system |
| `src/components/SectionHeader.tsx` | Design system |
| `src/components/Badge.tsx` | Design system |
| `src/components/StatCard.tsx` | Design system |
| `src/components/Skeleton.tsx` | Design system |
| `src/components/AddressInput.tsx` | Interactive |
| `src/components/Map.tsx` | Interactive |
| `src/components/ComparisonBar.tsx` | Interactive |
| `src/components/VibeCheck.tsx` | Interactive |
| `src/components/sections/DemographicsSection.tsx` | Data section |
| `src/components/sections/HousingSection.tsx` | Data section |
| `src/components/sections/EconomicSection.tsx` | Data section |
| `src/components/sections/GettingAroundSection.tsx` | Data section |
| `src/components/sections/WhatsNearbySection.tsx` | Data section |
| `src/hooks/useReportStream.ts` | Hook |
| `src/app/page.tsx` | Page |
| `src/lib/__tests__/use-report-stream.test.ts` | Test |
| `CONVENTIONS.md` | Docs |
| `docs/IMPLEMENTATION-PLAN.md` | Docs |

---

## Critical (Must Fix)

### C1. XSS vulnerability in Map popup via `.setHTML()`

**File:** `src/components/Map.tsx` (lines 186-189)

The POI popup uses `.setHTML()` with an interpolated `poi.name`:

```typescript
new mapboxgl.Popup({ offset: 10, closeButton: false }).setHTML(
  `<div style="font-family: Inter, sans-serif; font-size: 13px;">
    <strong>${poi.name || "Unnamed"}</strong>
    <br/><span style="color: #78716C; font-size: 12px;">${poi.category} &middot; ${poi.walkingMinutes} min walk</span>
  </div>`,
)
```

`poi.name` comes from OpenStreetMap data, which is user-contributed. An OSM entry with `name: "<img src=x onerror=alert(1)>"` would execute arbitrary JavaScript. Either escape the HTML before interpolation, or use `Popup.setText()` combined with DOM construction to avoid raw HTML injection.

### C2. Map does not clean up on coordinate changes — stale instance and memory leak

**File:** `src/components/Map.tsx` (lines 59-97)

The map initialization `useEffect` depends on `[coordinates.latitude, coordinates.longitude]`. When coordinates change (e.g., user selects a new address), the cleanup function fires: it removes markers and calls `map.remove()`. However, the isochrone and POI effects (lines 100-196) can race with this teardown because they depend on `isLoaded` — which remains `true` from the old map instance until the new map fires its `load` event. Between cleanup and reinit, `mapRef.current` is `null`, but `isLoaded` is still `true`.

The fix: reset `setIsLoaded(false)` at the top of the initialization effect (before the new map is created), not only in the cleanup.

---

## Warnings (Should Fix)

### W1. Hardcoded hex colors in Map component bypass design tokens

**File:** `src/components/Map.tsx` (lines 29-45, 80)

`ISOCHRONE_STYLES` and `CATEGORY_COLORS` use hardcoded hex values (`"#2D5A3D"`, `"#3D7A52"`, etc.) rather than referencing the CSS custom properties from `globals.css`. The address marker also hardcodes `color: "#2D5A3D"`. While these happen to match the current token values, they will silently diverge if tokens are updated. The same issue exists in the inline `style` attributes for POI marker elements (lines 174-179).

This is partially unavoidable since Mapbox GL JS paint properties and DOM element styles cannot consume Tailwind classes. However, the values should be extracted into a shared constants file (or at minimum, the Map file's header comment should note the token correspondence) so they stay in sync during future design changes.

### W2. Duplicated `fadeUp` variant object across 7 files

**Files:** `VibeCheck.tsx`, `DemographicsSection.tsx`, `HousingSection.tsx`, `EconomicSection.tsx`, `GettingAroundSection.tsx`, `WhatsNearbySection.tsx`

The same `fadeUp` variant object is copy-pasted in each section component:

```typescript
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};
```

This should be extracted to a shared animation constants file (e.g., `src/lib/motion.ts` or `src/components/animations.ts`) and imported by each consumer. If the animation curve or distance needs to change, it would currently require editing 6+ files.

### W3. Duplicated `formatCurrency` function in HousingSection and EconomicSection

**Files:** `src/components/sections/HousingSection.tsx` (line 24), `src/components/sections/EconomicSection.tsx` (line 24)

Both define an identical `formatCurrency` helper. Extract to a shared utility (e.g., `src/lib/format.ts`).

### W4. `CATEGORY_META` in WhatsNearbySection contains unused `icon` field with SF Symbol names

**File:** `src/components/sections/WhatsNearbySection.tsx` (lines 23-35)

`CATEGORY_META` has an `icon` field with SF Symbol-style strings (`"fork.and.knife"`, `"cart"`, etc.) that are never used anywhere in the component. Separately, a `CATEGORY_ICONS` constant (lines 38-47) maps categories to simple text labels that are actually used in the density summary. The `CATEGORY_META.icon` field is dead code that should be removed or replaced with actual icons.

### W5. Missing `aria-label` on visual-only data visualizations

**Files:** Multiple section components

The stacked bar charts for race/ethnicity (`DemographicsSection.tsx` line 193), owner/renter split (`HousingSection.tsx` line 139), and year-built breakdown (`HousingSection.tsx` line 193) use `title` attributes on individual segments but lack an `aria-label` or `role="img"` on the parent container. Screen readers will not understand these are data visualizations. Each chart container should have `role="img"` and an `aria-label` summarizing the data.

Similarly, the `ComparisonBar` component (`ComparisonBar.tsx`) renders two horizontal bars with no ARIA semantics. Consider adding `role="meter"` with `aria-valuenow`, `aria-valuemin`, and `aria-valuemax` (or at minimum `role="img"` with `aria-label`).

### W6. `handleSelect` in `page.tsx` does not handle the returned Promise

**File:** `src/app/page.tsx` (lines 12-21)

`handleSelect` calls `generate(...)` which returns a `Promise<void>`, but the returned promise is not awaited or `.catch()`-ed. Since `generate` already handles its own errors internally and sets `error` state, this is not a runtime bug, but the fire-and-forget pattern means an unhandled rejection could appear if `generate` is ever modified to throw before reaching its internal try/catch. Adding `void` keyword prefix (i.e., `void generate({...})`) or `.catch(() => {})` would make this explicit.

### W7. `page.tsx` is marked `"use client"` — no server-side rendering for the homepage

**File:** `src/app/page.tsx` (line 1)

The entire homepage is a client component. The static marketing content (headline, description) could be server-rendered for better SEO and initial paint performance. Consider splitting into a server component wrapper that renders the static content, with the `AddressInput` and streaming preview as client component children. This is noted as a Phase 4 concern but worth flagging since the homepage is the primary landing page for SEO.

### W8. ComparisonBar renders a misleading secondary bar for national average

**File:** `src/components/ComparisonBar.tsx` (lines 53-63)

The national average is displayed as both text ("National avg: X") and a secondary smaller bar. However, the secondary bar is nested inside a `max-w-[200px]` container that is separate from the primary bar, meaning the two bars are not on the same scale. A user would visually compare the lengths of the two bars, but they represent different scales (the primary bar is full-width, the secondary is max 200px). This is misleading. Either render both bars at full width on the same scale, or remove the secondary bar and keep only the text/dot indicator.

---

## Suggestions (Consider)

### S1. The `variantClasses` Record in Container and Badge use `Record<string, string>` instead of a stricter type

**Files:** `src/components/Container.tsx` (line 13), `src/components/Badge.tsx` (line 14)

Both use `Record<string, string>` for the variant map, but the keys are known and finite. Using `Record<ContainerProps["variant"] & string, string>` or simply typing as `Record<"prose" | "content" | "wide", string>` would catch typos at compile time. Not urgent since the usage is always via the typed `variant` prop.

### S2. AddressInput does not limit the number of suggestions displayed

**File:** `src/components/AddressInput.tsx`

If the geocode API returns a large list, all items render. Consider capping at 5-7 visible suggestions for UX clarity. The Mapbox Geocoding API v6 typically returns at most 5 results, so this is low-risk but worth a defensive `.slice(0, 5)`.

### S3. Consider adding `loading="lazy"` to the map or using dynamic import

**File:** `src/components/Map.tsx`

The map imports `mapbox-gl` at the top level. In the report page (Phase 4), this will contribute to the initial JS bundle even if the map is below the fold. Consider wrapping `Map` with `next/dynamic` with `ssr: false` at the page level to code-split the Mapbox GL JS bundle. This is explicitly called out in the implementation plan as T6.3 work, so just flagging for tracking.

### S4. `GettingAroundSection` isochrone metrics display is low-value

**File:** `src/components/sections/GettingAroundSection.tsx` (lines 151-171)

The "Walking Reach" section shows three cards with just the numbers 5, 10, 15 and "min walk" — these are always the same values for every address (since the API always requests 5/10/15 minute isochrones). This section does not communicate anything unique about the location. Consider either removing it, or enriching it with area coverage (square meters/miles reachable within each time window) if that data is available from the isochrone response.

### S5. VibeCheck paragraph splitting assumes `\n\n` delimiters

**File:** `src/components/VibeCheck.tsx` (line 76)

The narrative text is split on `"\n\n"` to create paragraphs. This is dependent on Claude's output formatting. If the AI model returns single newlines or markdown-style paragraphs, the display will break. Consider a more robust paragraph splitting strategy that also handles single `\n` between paragraphs, or using a lightweight markdown renderer.

### S6. Test file location for hook test does not match convention

**File:** `src/lib/__tests__/use-report-stream.test.ts`

CONVENTIONS.md states test location is `src/lib/__tests__/<module>.test.ts`. However, `useReportStream` lives in `src/hooks/`, not `src/lib/`. The test is reasonable where it is since it tests the fetch contract rather than the React hook directly, but the naming (`use-report-stream.test.ts`) implies it tests the hook. Consider either renaming to `report-stream-fetch.test.ts` or creating a `src/hooks/__tests__/` directory as the convention expands.

### S7. No test coverage for any UI components

Phase 3 introduces 14 new components but only tests the `useReportStream` hook's fetch logic. There are no rendering tests for any component — even simple smoke tests (renders without crashing, returns null when data is null) would catch regressions. This is understandable for an MVP, but the data section components have enough conditional logic (null checks, percentage calculations, array filtering) that unit tests would add real value. Consider adding tests for at least the section components' null-data bail-out behavior and percentage calculation edge cases (e.g., division by zero).

### S8. `handleSelect` promise return value ignored

**File:** `src/app/page.tsx` (line 13)

The `handleSelect` function is passed as `onSelect` to `AddressInput`, which calls it in an `onClick` / keyboard handler context. Since `generate` is async and `handleSelect` does not await it, the promise floats. If React ever warns about unhandled async in event handlers, this will surface. Consider making `handleSelect` explicitly async with a try/catch, or documenting why fire-and-forget is intentional.

---

## Convention Compliance

| Convention | Status | Notes |
|-----------|--------|-------|
| `@/*` path alias for all src imports | PASS | All files use `@/` consistently |
| `"use client"` on interactive components | PASS | All stateful/effect components have directive; design system primitives correctly omit it |
| Types co-located with client code | PASS | Types imported from `@/lib/census`, `@/lib/poi`, `@/lib/mapbox/*` as established |
| Tailwind v4 design tokens (no hardcoded colors) | PARTIAL | All components except `Map.tsx` use Tailwind token classes. Map must use hex for Mapbox GL JS APIs (see W1) |
| No external HTTP mock libraries in tests | PASS | Tests use `vi.spyOn(globalThis, "fetch")` |
| Explicit vitest imports | PASS | `describe`, `it`, `expect`, `vi`, `afterEach` all imported from `"vitest"` |
| Graceful hiding on null data | PASS | All section components return `null` when data is missing |
| Framer Motion `fadeUp` + `whileInView` + `viewport={{ once: true }}` | PASS | Consistent across all section components and VibeCheck |
| Source attribution footer on data sections | PASS | Every section component includes a source attribution `<p>` |
| Console logging with `[module]` tag on failure | PASS | `[AddressInput]`, `[Map]`, `[useReportStream]` tags present |
| Section component structure (typed props, null check, SectionHeader, StatCard) | PASS | All five section components follow the pattern |

---

## Patterns to Document

The following patterns emerged in Phase 3 that should be considered for CONVENTIONS.md if not already present:

1. **Shared animation variants:** The `fadeUp` variant and Framer Motion scroll-reveal pattern is now used in 6+ components. This should be extracted and documented as the standard reveal animation pattern.

2. **Format utility duplication:** Currency formatting appears in two places. A `src/lib/format.ts` utility for common number/currency formatting would prevent further duplication.

3. **Mapbox GL JS color mirroring:** When using Mapbox GL JS APIs that require raw CSS values (hex colors, pixel sizes), the corresponding design token must be noted in a comment. This is a necessary deviation from the token-only convention and should be documented.

4. **Component test strategy:** The approach of testing the fetch/stream contract separately from React rendering (due to lack of JSDOM in the test environment) is a pragmatic compromise. Document this as the established pattern for hook tests and note that component rendering tests will require a DOM environment setup (adding `@testing-library/react` and vitest DOM environment).

---

*Review completed 2026-03-10. Resolution of Critical items C1 and C2 should be prioritized before Phase 4 integration work begins.*

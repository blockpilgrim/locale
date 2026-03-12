# Code Review: Archetype + Social Card Feature

**Date:** 2026-03-11
**Reviewer:** Claude Opus 4.6
**Commits reviewed:** 81cfa72..5dc367c (9 commits)
**Status:** APPROVED — all findings resolved

**Resolution:** C1 (atomic JSONB merge via `||`), C2 (config vs runtime error distinction), W1 (shared `pentagon.ts`), W2 (module-level font cache), W3 (rate limiting added), W4 (story format forces OG dimensions on fallback), W5 (`onComplete` removed from deps), S2 (string length limits), S3 (AbortSignal.timeout).

---

## Summary

This feature adds AI-classified neighborhood archetypes (a personality label + pentagon radar chart + defining traits) and server-side social card image generation to every report. The implementation spans 9 new files and 12 modified files across the classification module, API route, generation orchestrator, three UI components, image generation route, and 37 new tests.

Overall: a well-structured feature that follows established project conventions closely. The separation of archetype classification from narrative generation (D8) is the right call. The non-fatal failure model (D9) is correct and consistently applied. Test coverage is strong. A few issues merit attention below.

---

## Files Reviewed

### New Files
| File | Purpose |
|------|---------|
| `src/lib/report/archetype.ts` | Archetype classification: prompt, AI call, validation, DB merge |
| `src/app/api/report/[slug]/archetype/route.ts` | POST route to trigger archetype classification |
| `src/components/ArchetypeTrigger.tsx` | Client-side trigger component (fires on mount) |
| `src/components/GenerationOrchestrator.tsx` | Sequences archetype -> narrative with 5s timeout |
| `src/components/VibeSpectrum.tsx` | Pentagon/radar SVG chart (Satori-compatible) |
| `src/components/ArchetypeBanner.tsx` | Archetype display section on report page |
| `src/app/api/report/[slug]/card/route.tsx` | Social card image generation (OG + Story formats) |
| `src/lib/__tests__/archetype.test.ts` | 37 tests for classification logic |
| `public/fonts/` | TTF font files for Satori rendering |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/report/generate.ts` | Added `ArchetypeResult` type, `archetype: null` in `ReportData` |
| `src/app/report/[slug]/page.tsx` | `GenerationOrchestrator`, updated OG metadata |
| `src/components/ReportContent.tsx` | `ArchetypeBanner` integration |
| `src/components/ShareControls.tsx` | Download card button |
| `src/lib/__tests__/integration.test.ts` | `archetype: null` in fixtures |
| `src/lib/__tests__/report-narrative.test.ts` | `archetype: null` in fixtures |
| `src/lib/__tests__/report-route-generate.test.ts` | `archetype: null` in fixtures |
| `tests/eval-narratives.ts` | `archetype: null` in fixtures |
| `CONVENTIONS.md` | Documented archetype and social card patterns |
| `docs/DECISIONS.md` | D8, D9, D10 |

---

## Critical (Must Fix)

### C1. Race condition: archetype DB merge is not atomic

**File:** `/Users/personal/work-projects/locale/src/lib/report/archetype.ts`, lines 191-206

The `classifyArchetype` function reads the report's JSONB `data`, then writes a merged copy. Between the SELECT and UPDATE, the narrative route (or any other writer) could update the same `data` column, and the archetype merge would overwrite those changes with stale data.

Sequence:
1. Archetype reads `report.data` (status: generating, narrative: absent)
2. Narrative completes, writes narrative text and sets status to "complete"
3. Archetype writes `{...staleData, archetype}` back, potentially reverting any concurrent data change

In practice, the current flow (archetype runs first, narrative runs after) makes this unlikely because `GenerationOrchestrator` sequences them. However, the 5-second timeout means narrative can start while archetype is still in flight. If the archetype AI call takes longer than 5s, both writers are active simultaneously.

**Recommendation:** Use a SQL `jsonb_set` or `||` operator for the merge so the UPDATE is atomic:
```sql
UPDATE reports
SET data = data || '{"archetype": ...}'::jsonb
WHERE id = ?
```
This avoids reading then writing, making the merge safe under concurrency.

### C2. `getApiKey()` throws but `classifyArchetype` has a try/catch that returns null

**File:** `/Users/personal/work-projects/locale/src/lib/report/archetype.ts`, lines 150-155

The `getApiKey()` call on line 155 is placed *before* the try/catch block on line 157. This means a missing `ANTHROPIC_API_KEY` will throw an unhandled exception that propagates to the route handler. The route handler at `src/app/api/report/[slug]/archetype/route.ts` line 61 catches it and returns `{ status: "skipped" }`, which is fine for the HTTP response. However, the function's documented contract says "On failure, returns null" -- the throw for a missing env var violates this.

This is actually *intentional* per CONVENTIONS.md ("Only truly fatal errors (missing env vars) throw"), so the behavior is correct. But the route handler's catch block (line 61-64) swallows the error as "skipped" rather than surfacing it as a server configuration issue.

**Recommendation:** The route handler should distinguish configuration errors from runtime failures. Log the missing env var error at `error` level (which it does via `console.error`), but consider returning a 500 status instead of 200 for configuration problems. As-is, a deployment with a missing API key will silently skip archetype classification without any signal in HTTP responses.

---

## Warnings (Should Fix)

### W1. Duplicated pentagon geometry code between VibeSpectrum and card route

**Files:**
- `/Users/personal/work-projects/locale/src/components/VibeSpectrum.tsx`, lines 46-59
- `/Users/personal/work-projects/locale/src/app/api/report/[slug]/card/route.tsx`, lines 40-56

The `polarToCartesian`, `toPointsString`, and `AXES` definitions are copy-pasted between the two files. The card route file contains a comment acknowledging this: "Pentagon geometry (shared with VibeSpectrum.tsx)".

The Satori constraint (inline styles, no Tailwind) prevents sharing the React component itself. However, the pure geometry functions (`polarToCartesian`, `toPointsString`) and the `AXES` constant have no React/style dependency and could be extracted to a shared utility (e.g., `src/lib/pentagon.ts`).

**Risk:** If someone updates the angle calculation or axis order in one file, the other falls out of sync, producing mismatched pentagons between the page and the social card.

### W2. Font loading makes a self-referential HTTP request on every card generation

**File:** `/Users/personal/work-projects/locale/src/app/api/report/[slug]/card/route.tsx`, lines 570-588

`loadFonts()` calls `fetch(new URL("/fonts/PlayfairDisplay-Bold.ttf", getBaseUrl()))` which makes an HTTP request from the server to itself. In production on Vercel, this works but adds unnecessary network latency on every card generation. Under cold start conditions, this could even cause issues if the server hasn't fully started.

**Recommendation:** Cache the font ArrayBuffers in module-level variables so they are loaded once per server instance:

```typescript
let fontCache: Awaited<ReturnType<typeof loadFonts>> | null = null;
async function getFonts() {
  if (fontCache) return fontCache;
  fontCache = await loadFonts();
  return fontCache;
}
```

The `Cache-Control: immutable` on the response means repeat requests for the same card are cached at the CDN. But different slugs all trigger fresh font loads. Caching in memory eliminates 3 HTTP round-trips per unique card generation.

### W3. No rate limiting on the archetype route

**File:** `/Users/personal/work-projects/locale/src/app/api/report/[slug]/archetype/route.ts`

CONVENTIONS.md states: "Any route that forwards requests to a paid external API must apply rate limiting via `createRateLimiter()`." The archetype route calls the Anthropic API (a paid external API) but does not apply rate limiting. The narrative route (`/api/report/[slug]/narrative`) should be checked for consistency -- but the archetype route is new and should follow the convention.

**Recommendation:** Add rate limiting consistent with the narrative route pattern. The `ArchetypeTrigger` fires automatically, so abuse surface is limited, but the convention exists for a reason.

### W4. Story card fallback is missing

**File:** `/Users/personal/work-projects/locale/src/app/api/report/[slug]/card/route.tsx`, lines 643-665

When `format=story` is requested but `archetype` is null, the code falls through to `FallbackOgCard` (lines 660-663) which is a 1200x630 layout. This produces a 1200x630 image rendered into a 1080x1920 viewport (story dimensions), which will look wrong -- a landscape card stretched into a portrait canvas.

**Recommendation:** Either create a `FallbackStoryCard` component, or force the dimensions to OG format when archetype data is missing, or return a 404/redirect when story format is requested without archetype data.

### W5. `onComplete` in ArchetypeTrigger dependency array may cause re-fires

**File:** `/Users/personal/work-projects/locale/src/components/ArchetypeTrigger.tsx`, line 39

The `useEffect` depends on `[slug, onComplete]`. If the parent re-renders with a new `onComplete` function reference (which happens unless the parent memoizes it), the effect would re-run. The `firedRef` guard prevents the fetch from re-firing, so there is no functional bug. However, `onComplete` is unnecessary in the dependency array since the ref guard means the effect body only executes once.

In `GenerationOrchestrator.tsx` line 29, `handleArchetypeComplete` is wrapped in `useCallback` with an empty dependency array, so the reference is stable. This means the issue does not manifest in practice. But it is fragile -- if another consumer of `ArchetypeTrigger` does not memoize `onComplete`, the linter warning suppression path becomes needed.

---

## Suggestions (Consider)

### S1. Export pentagon geometry for testing

**File:** `/Users/personal/work-projects/locale/src/components/VibeSpectrum.tsx`

The test file (`archetype.test.ts` lines 427-532) replicates the `polarToCartesian` function to test geometry properties. If the function were exported (or extracted per W1), the tests could import it directly, eliminating the risk that the replicated version drifts from the real implementation.

### S2. Consider string length limits on AI-generated fields stored in JSONB

**File:** `/Users/personal/work-projects/locale/src/lib/report/archetype.ts`, lines 96-135

The `validateArchetypeResult` function validates types and structure but does not enforce length limits on strings. A misbehaving AI response could return a 10,000-character tagline that gets stored in JSONB and rendered on the page. The prompt says "one sentence" and "2-5 words" but validation does not enforce this.

**Recommendation:** Add reasonable length caps in validation: archetype name <= 100 chars, tagline <= 300 chars, each defining trait <= 200 chars, reasoning <= 500 chars.

### S3. Consider `AbortSignal.timeout` on the archetype AI call

**File:** `/Users/personal/work-projects/locale/src/lib/report/archetype.ts`, line 158

CONVENTIONS.md specifies fetch timeouts for all HTTP calls. The Vercel AI SDK's `generateText` call does not have an explicit timeout. The `GenerationOrchestrator` has a 5-second fallback to unblock narrative generation, but the archetype AI call itself could hang indefinitely, consuming the serverless function's execution time.

**Recommendation:** Pass `abortSignal: AbortSignal.timeout(10000)` to `generateText` to bound the AI call duration.

### S4. The `className` prop on VibeSpectrum is unused in Satori context

**File:** `/Users/personal/work-projects/locale/src/components/VibeSpectrum.tsx`, line 109

The `className` prop is applied to the SVG element, but Satori does not support CSS classes. In the card route, `VibeSpectrum` is not used (the route has its own `SatoriPentagon`), so this is not a bug. But if someone later tries to reuse `VibeSpectrum` directly in the card route, the `className` prop would be silently ignored.

### S5. Consider testing the card route handler

The card route (`/api/report/[slug]/card/route.tsx`) has no tests. Given that it involves DB queries, font loading, conditional layout selection, and image generation, at least a few smoke tests would catch regressions:
- 404 for unknown slug
- Correct content-type header (image/png)
- Correct Cache-Control header
- Fallback layout when archetype is null

---

## Convention Compliance

| Convention | Status | Notes |
|-----------|--------|-------|
| `getDb()` lazy init | PASS | Used in `archetype.ts` line 191 and `card/route.tsx` line 607 |
| API clients return null on failure | PASS | `classifyArchetype` returns null on all failure paths |
| `fadeUp` from `@/lib/motion` | PASS | Used in `ArchetypeBanner.tsx` line 15, 29 |
| Container owns padding | PASS | `ArchetypeBanner` is wrapped in `Container` in `ReportContent.tsx` |
| Error boundary wraps section | PASS | `SectionErrorBoundary` wraps `ArchetypeBanner` in `ReportContent.tsx` line 141 |
| Mapbox hex colors comment tokens | N/A | No Mapbox GL JS changes |
| JSONB null guard before `as` cast | PASS | `archetype.ts` line 198-199, `page.tsx` line 99-100, `card/route.tsx` line 625-626 |
| `force-dynamic` on report page | PASS | Already present, unchanged |
| Escape OSM data in popups | N/A | No Map changes |
| Console logging with bracketed tag | PASS | `[archetype]` tag used throughout |
| Hydration-safe browser detection | PASS | `ShareControls.tsx` uses `useState(false)` + `useEffect` pattern |
| Fetch timeouts | WARN | Missing on AI SDK `generateText` call (see S3) |
| Rate limiting on paid API routes | WARN | Missing on archetype route (see W3) |
| Types co-located with client | PASS | `ArchetypeResult` exported from `generate.ts` alongside `ReportData` |
| `"use client"` on interactive components | PASS | On `ArchetypeBanner`, `ArchetypeTrigger`, `GenerationOrchestrator` |
| `"use client"` omitted on non-interactive | PASS | `VibeSpectrum` has no directive (works in both contexts) |
| Inline styles for Satori | PASS | Card route and `VibeSpectrum` use inline styles |
| Hex color comments in SVG | PASS | All hardcoded colors in `VibeSpectrum.tsx` comment their token |

---

## Patterns to Document

The following patterns emerged from this feature and have already been documented in CONVENTIONS.md and DECISIONS.md (D8-D10):

1. **Non-fatal AI enrichment features** -- archetype classification returns null on failure, components null-guard and skip rendering. This should be the template for any future optional AI enrichment.

2. **Generation orchestration** -- `GenerationOrchestrator` sequences dependent async operations (archetype -> narrative) with a timeout fallback. This pattern (sequential triggers with timeout fallback) could apply to other multi-step generation flows.

3. **Satori-compatible components** -- Components shared between page rendering and social card generation must use inline styles and basic SVG only. The `VibeSpectrum` component demonstrates this constraint well.

4. **JSONB field extension** -- New fields added to `ReportData` use `| null` and don't require schema migrations. All consumers must null-guard. This pattern is well-established and correctly applied.

---

## Test Coverage Assessment

- **37 new tests** in `archetype.test.ts` covering validation, prompt content, AI call orchestration, DB update, error paths
- **Existing tests updated** with `archetype: null` in fixtures (integration, narrative, route tests)
- **All 190 tests pass** (13 test files)
- **Gaps:** No tests for card route handler, no tests for `GenerationOrchestrator` sequencing logic, no tests for `ArchetypeBanner`/`VibeSpectrum` rendering (expected -- project has no DOM test environment configured)

---

## Verdict

This is a solid, well-structured feature implementation. The separation of concerns is clean, the failure model is correct, and the conventions are followed with only minor gaps. The critical finding (C1, non-atomic JSONB merge) is mitigated by the current sequencing but should be addressed to prevent future issues. The missing rate limiting (W3) and story card fallback (W4) are the highest-priority warnings.

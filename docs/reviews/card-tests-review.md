# Code Review: Card Route Tests + Archetype Partial Data Edge Cases

**Date:** 2026-03-12
**Reviewer:** Claude Opus 4.6
**Commit reviewed:** 191cf7a
**Scope:** `src/lib/__tests__/card.test.ts` (new, 27 tests), `src/lib/__tests__/archetype.test.ts` (new, 44 tests -- 37 original + 7 partial data edge cases)
**Status:** APPROVED with warnings

---

## Summary

This commit adds two test files that close gaps identified in the previous review (`docs/reviews/archetype-social-card.md`, suggestion S5 and the test coverage assessment). The card route tests verify the HTTP handler's behavior (404, content-type, cache headers, format selection, fallback logic). The archetype partial data tests verify that `classifyArchetype` handles census-only, POI-only, all-failed, and partially-null census fields without crashing. Additionally, both files include thorough tests of the shared pentagon geometry (`polarToCartesian`, `toPointsString`, `PENTAGON_AXES`).

All 71 tests pass. The test quality is generally strong with good coverage of the happy path, edge cases, and failure modes. A few items below merit attention.

---

## Files Reviewed

| File | Tests | Purpose |
|------|-------|---------|
| `/Users/personal/work-projects/locale/src/lib/__tests__/card.test.ts` | 27 | Card route handler: 404, fallback, formats, caching, fonts, null data; pentagon geometry and SVG serialization |
| `/Users/personal/work-projects/locale/src/lib/__tests__/archetype.test.ts` | 44 | Validation, prompt content, AI call flow, DB merge, error paths, partial data scenarios, pentagon geometry |

---

## Critical (Must Fix)

No critical issues found.

---

## Warnings (Should Fix)

### W1. Card test font caching leaks state between tests

**File:** `/Users/personal/work-projects/locale/src/lib/__tests__/card.test.ts`, lines 80-94 and 338-357

The card route's `loadFonts()` function uses a module-level `fontCache` variable (card route line 549). The first test that calls `GET()` populates this cache. All subsequent tests in the same file reuse the cached fonts without calling `fetch` again. This means:

1. The "loads 3 fonts" test (line 338) only works if it runs before any other test that triggers `GET()` with archetype data -- or if it happens to be the first test that invokes `loadFonts()`. Since Vitest runs tests within a `describe` block in order by default, this currently works. But if test ordering were randomized or tests were run in isolation, the font fetch assertions could fail or pass unexpectedly.

2. The `setupFontFetchMock()` call in `beforeEach` re-spies on `fetch`, but the `fontCache` variable in the card route module persists across tests. After the first test populates `fontCache`, subsequent tests never hit `fetch` for fonts at all. The `vi.restoreAllMocks()` in `afterEach` restores `fetch` but does not clear `fontCache`.

**Risk:** Test isolation is compromised. If a future test needs to verify font loading failure behavior (e.g., font fetch returns 500), the cached fonts from an earlier test would mask the failure.

**Recommendation:** Either:
- Reset the module between tests using `vi.resetModules()` (requires re-importing `GET` in each test, which is more complex), or
- Add a comment documenting this limitation and ensure the font-loading test runs first (its current position is fine, but the dependency is implicit), or
- Export a `_resetFontCache()` test helper from the card route (guarded by `process.env.NODE_ENV === "test"`) to allow explicit cache clearing.

### W2. Card test `cityState` construction is not verified in the rendered element

**File:** `/Users/personal/work-projects/locale/src/lib/__tests__/card.test.ts`, lines 288-315

Tests "constructs cityState string from location data" (line 288) and "handles missing city gracefully in cityState" (line 302) only verify that `mockImageResponse` was called once. They do not inspect the element argument to confirm the `cityState` string was correctly constructed (e.g., "San Francisco, CA" vs just "NY" when city is null).

The mock captures the element as the first argument: `mockImageResponse.mock.calls[0][0]`. This JSX element could be inspected to verify the cityState was passed correctly.

**Recommendation:** Assert on the element content. For example:
```typescript
const [element] = mockImageResponse.mock.calls[0];
// element is a JSX tree -- verify the cityState prop was passed correctly
```
Without this, these tests only confirm the route does not crash, not that it produces the correct output. The tests are titled as if they verify construction logic, but they only verify non-failure.

### W3. Duplicated pentagon geometry tests between card.test.ts and archetype.test.ts

**File:** `/Users/personal/work-projects/locale/src/lib/__tests__/card.test.ts`, lines 366-515
**File:** `/Users/personal/work-projects/locale/src/lib/__tests__/archetype.test.ts`, lines 766-864

Both test files contain `describe("Pentagon geometry")` blocks that test `polarToCartesian`. The card test file has 8 tests and the archetype test file has 6 tests for the same function. While the card tests focus on specific coordinate calculations and the archetype tests focus on geometric properties (equidistance, regular pentagon, clockwise ordering), there is significant overlap:

- Both test index 0 pointing straight up
- Both test all vertices equidistant from center
- Both test radius 0 returning center

The `PENTAGON_AXES` and `toPointsString` tests in card.test.ts are not duplicated and are fine.

**Recommendation:** Consolidate pentagon geometry tests into a single dedicated test file (`src/lib/__tests__/pentagon.test.ts`). The geometry module is a standalone utility in `src/lib/pentagon.ts` and deserves its own test file per the convention of test files mirroring module structure. Both the coordinate-calculation tests and the geometric-property tests belong together.

---

## Suggestions (Consider)

### S1. The `makeDbRow` fixture uses spread in a way that can mask override intent

**File:** `/Users/personal/work-projects/locale/src/lib/__tests__/card.test.ts`, lines 124-141

The `makeDbRow` function spreads `overrides` at the end of the return object (line 139), which means passing `{ data: ... }` in overrides actually sets the `data` key twice. The inner `data` construction on lines 131-135 runs first, then line 139 overwrites it with the override's `data`. This works but is confusing -- the `data` field is built with defaults on lines 131-135, but if `overrides.data` is provided, that entire constructed object is thrown away.

This is visible on lines 185-187 where the override is `{ data: { archetype: null } as unknown as Record<string, unknown> }`. The cast to `unknown` then to `Record<string, unknown>` is needed because the override type is `Record<string, unknown> | null`, but the value being passed does not match the full `data` shape that the default construction produces.

**Recommendation:** Separate the `data` override path more explicitly:
```typescript
function makeDbRow(overrides: ...) {
  const data = overrides.data !== undefined
    ? overrides.data
    : { archetype: makeArchetypeData(), address: { full: "..." } };
  return { data, address: overrides.address ?? "...", ... };
}
```
This avoids constructing the default `data` object only to discard it.

### S2. The "all-null demographic fields" test could be more precise about what IS in the prompt

**File:** `/Users/personal/work-projects/locale/src/lib/__tests__/archetype.test.ts`, lines 723-762

This test nullifies every field in `demographics` and then verifies that certain strings are absent from the prompt. It also asserts that "DEMOGRAPHICS & CENSUS DATA" header IS present and that "HOUSING DATA" and "ECONOMIC DATA" are present. However, it does not verify any specific housing or economic data values are in the prompt (e.g., "Median home value: $185,000" or "Median household income: $55,000"). Adding one or two positive assertions for the non-nulled sections would strengthen the test's signal that the prompt is correctly constructed rather than empty.

### S3. Consider testing font loading failure in the card route

The card route has an explicit try/catch around `loadFonts()` that returns a 500 response with "Font loading failed" (card route lines 622-628). No test exercises this path. A test that makes the font fetch mock reject would verify this error handling works correctly.

This is a secondary concern since it is a simple error path, but it would complete the card route's coverage of failure modes.

### S4. Archetype partial data tests always assert archetype is "The Brownstone Belt"

**File:** `/Users/personal/work-projects/locale/src/lib/__tests__/archetype.test.ts`, lines 582-762

All seven partial data tests use `makeValidArchetypeJson()` as the mocked AI response, which always returns "The Brownstone Belt". This is fine for testing that the function accepts a valid response regardless of input data quality. But the test names suggest they are about how partial data affects classification, when in fact they are really testing that `buildUserPrompt` handles partial data without crashing and that the validation pipeline still works.

The tests are correctly testing prompt construction (via assertions on `callArgs.prompt`), which is the valuable part. The archetype value assertion is redundant with the existing `classifyArchetype` happy-path test. Consider removing the archetype value assertion from these tests to make the intent clearer: these tests are about prompt construction with partial data, not about classification output.

### S5. The `originalFetch` fallback in `setupFontFetchMock` could leak real network calls

**File:** `/Users/personal/work-projects/locale/src/lib/__tests__/card.test.ts`, lines 80-94

Line 93 falls back to `originalFetch(input)` for non-font URLs. In theory, no test should trigger a non-font fetch, but if the card route code changes to make additional fetch calls (e.g., loading an image or calling an external API), this mock would silently make real network calls in the test environment.

**Recommendation:** Replace the fallback with `return new Response("unexpected fetch", { status: 500 })` and add a `console.warn` to catch unexpected fetch calls during development.

---

## Convention Compliance

| Convention | Status | Notes |
|-----------|--------|-------|
| Test location: `src/lib/__tests__/` | PASS | Both files follow the pattern |
| Explicit vitest imports | PASS | `describe, it, expect, vi, beforeEach, afterEach` imported from "vitest" |
| HTTP mocking: `vi.spyOn(globalThis, "fetch")` | PASS | Used in card.test.ts line 83 |
| Env var mocking: `vi.stubEnv` / `vi.unstubAllEnvs` | PASS | Used in archetype.test.ts `beforeEach`/`afterEach` |
| Fixture builders: `make*()` factory pattern | PASS | `makeArchetypeData`, `makeDbRow`, `makeRequest`, `makeParams`, `makeMinimalReportData`, `makeReportDataWithCensusOnly`, etc. |
| Mocks before imports | PASS | `vi.mock()` calls precede `import` statements in both files |
| Path alias `@/` for imports | PASS | Used throughout |
| Bracketed console tags | N/A | Tests do not log (source code does) |
| `vi.clearAllMocks()` in `beforeEach` | PASS | Both files clear mocks properly |
| `vi.restoreAllMocks()` in `afterEach` | PASS | Card tests restore mocks; archetype tests use `unstubAllEnvs` |
| No external HTTP mock libraries | PASS | Uses vitest spying only |

---

## Patterns to Document

1. **Mocking `@vercel/og` ImageResponse:** The card test demonstrates a clean pattern for mocking Satori's `ImageResponse` class in a node test environment. The mock returns a Response-like object with mutable headers, allowing tests to verify both the constructor arguments (element, options) and the response properties (status, headers). This pattern should be referenced if future routes use `@vercel/og`.

2. **DB chain mocking for Drizzle queries:** The card test's `mockSelect -> mockFrom -> mockInnerJoin -> mockWhere -> mockLimit` chain pattern mirrors the Drizzle query builder's fluent API. This is a viable approach for route-handler tests. However, it is tightly coupled to the exact chain order -- if the route adds a `.columns()` call, the mock chain breaks. This fragility is acceptable for now but worth noting.

---

## Test Coverage Assessment

### card.test.ts (27 tests)
- **Card route handler:** 12 tests covering 404, fallback without archetype, PNG content-type, OG dimensions (default), story dimensions, story-without-archetype fallback, cache headers, unknown format, city+state construction, null city, null report data, font loading verification
- **Pentagon geometry:** 8 tests covering individual vertex coordinates, center translation, radius 0, card-sized and story-sized pentagons
- **toPointsString:** 4 tests covering normal, empty, single point, decimal precision
- **PENTAGON_AXES:** 3 tests covering count, key order, label presence

### archetype.test.ts (44 tests)
- **validateArchetypeResult:** 17 tests covering valid input, null, non-object, missing fields, empty strings, NaN, clamping, rounding, array length, non-array
- **buildArchetypeSystemPrompt:** 4 tests covering seed labels, JSON format, trait count, range specification
- **classifyArchetype:** 9 tests covering missing API key, valid response, markdown fencing, malformed JSON, validation failure, network error, atomic DB merge, temperature/tokens, prompt content
- **Partial data scenarios:** 7 tests covering census-only, POI-only, all-failed (invalid AI response), all-failed (valid AI response), null rent/home value, null income/employment, all-null demographics
- **Pentagon geometry:** 7 tests covering index 0, equidistance, zero scores, uniform scores, individual axis isolation, clockwise ordering

### Gaps
- No test for font loading failure (500 response from card route)
- No test that inspects the actual JSX element passed to `ImageResponse` (e.g., verifying archetype name appears in the rendered card)
- No test for `getBaseUrl()` logic (env var fallback chain)
- No test for the card route when `format` param is empty string (as opposed to missing)
- Pentagon geometry tests are split across two files (see W3)

---

## Verdict

These tests are a meaningful addition that addresses the primary gap identified in the previous review (S5: card route had no tests). The partial data edge case tests for archetype classification are thorough and well-structured, exercising the real `buildUserPrompt` function with realistic data shapes that mirror Census sentinel value filtering.

The main concerns are: test isolation around the font cache (W1), weak assertions on cityState construction (W2), and duplicated pentagon geometry tests across files (W3). None of these are blocking, but W1 and W2 should be addressed before the test suite grows further. W3 is a housekeeping item that becomes more important if the pentagon module gains additional functions.

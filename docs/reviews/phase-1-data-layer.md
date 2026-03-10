# Code Review: Phase 1 — Data Layer
**Date:** 2026-03-10
**Reviewer:** Claude Opus 4.6 (automated)
**Status:** Pending Resolution

## Summary

Phase 1 implements 5 API client modules, 1 API route, and 6 test suites covering the data layer for Locale's neighborhood intelligence reports. The implementation is well-structured, follows the project's established conventions, and demonstrates thoughtful error handling throughout. All 41 tests pass. The code is production-ready with a few notable issues to address -- one data correctness bug in the Census client, a missing rate limiter on the geocode route, and an educational attainment calculation that produces misleading values.

## Files Reviewed

| File | Purpose |
|------|---------|
| `src/lib/mapbox/geocoding.ts` | Mapbox Geocoding v6 forward geocode client |
| `src/lib/mapbox/isochrone.ts` | Mapbox walking isochrone polygon client |
| `src/lib/census/index.ts` | Census ACS 5-year data client (demographics, housing, economic) |
| `src/lib/poi/index.ts` | OpenStreetMap Overpass API POI/amenities client |
| `src/lib/rate-limit.ts` | In-memory token-bucket rate limiter |
| `src/app/api/geocode/route.ts` | Geocode proxy API route |
| `src/lib/__tests__/geocoding.test.ts` | Geocoding client tests (6 tests) |
| `src/lib/__tests__/isochrone.test.ts` | Isochrone client tests (6 tests) |
| `src/lib/__tests__/census.test.ts` | Census client tests (8 tests) |
| `src/lib/__tests__/poi.test.ts` | POI client tests (9 tests) |
| `src/lib/__tests__/rate-limit.test.ts` | Rate limiter tests (8 tests) |
| `src/lib/__tests__/geocode-route.test.ts` | Geocode route tests (4 tests) |
| `vitest.config.ts` | Vitest configuration |
| `CONVENTIONS.md` | Updated with API client, route, and rate limiting conventions |

---

## Findings

### Critical (Must Fix)

#### C1. Census variable `B25034_011E` does not exist; year-built aggregation is wrong

**File:** `/Users/personal/work-projects/locale/src/lib/census/index.ts`, lines 162-167 and 398

The Census ACS table B25034 ("Year Structure Built") has the following variable mapping:
- `B25034_002E` = 2010 or later
- `B25034_003E` = 2000 to 2009
- `B25034_004E` = 1990 to 1999
- `B25034_005E` = 1980 to 1989
- `B25034_006E` = 1970 to 1979
- `B25034_007E` = 1960 to 1969
- `B25034_008E` = 1950 to 1959
- `B25034_009E` = 1940 to 1949
- `B25034_010E` = 1939 or earlier

The code currently:
1. Lists `B25034_010E` with comment "built 1940-1949" (wrong -- it is "1939 or earlier")
2. Lists `B25034_011E` with comment "built 1939 or earlier" (this variable does not exist in the B25034 table)
3. Lists `B25034_009E` as a "duplicate, intentional" (wrong -- it is the real 1940-1949 variable)
4. Computes `builtBefore1950 = sumNullable([v("B25034_010E"), v("B25034_011E")])` -- the second value will always be null/missing since the variable does not exist

The fix is:
- `builtBefore1950` should sum `B25034_009E` (1940-1949) + `B25034_010E` (1939 or earlier)
- Remove `B25034_011E` from the `CENSUS_VARIABLES` array (it does not exist and the Census API may silently ignore it or return errors)
- Remove the `B25034_009E` "duplicate" comment; it is the legitimate 1940-1949 variable
- Fix the comment on `B25034_010E` to read "1939 or earlier"

This is a data correctness issue. The `before1950` housing stock count will always undercount because it is missing the 1940-1949 cohort.

#### C2. Geocode API route is missing rate limiting

**File:** `/Users/personal/work-projects/locale/src/app/api/geocode/route.ts`

The geocode route proxies requests to Mapbox using the secret `MAPBOX_ACCESS_TOKEN`. The BUILD-STRATEGY (Section 4, "Rate Limiting") says the report generation endpoint should be rate-limited, and the CONVENTIONS.md documents rate limiting as a project pattern. However, the geocode route has no rate limiting at all.

While the geocode route is less expensive than full report generation, it still costs Mapbox API calls on every request and is trivially abusable (autocomplete fires on every keystroke). An attacker could exhaust the Mapbox geocoding quota by scripting requests to `/api/geocode`.

The `rateLimit` singleton is already exported from `src/lib/rate-limit.ts`. Add it to this route with a more generous limit (e.g., 60 requests/hour) than the 10/hour report generation limit, or use `createRateLimiter` with a custom config.

---

### Warnings (Should Fix)

#### W1. Educational attainment "highSchoolOrHigher" calculation is inaccurate

**File:** `/Users/personal/work-projects/locale/src/lib/census/index.ts`, lines 347-354

The current calculation is:
```typescript
const hsOrHigher =
  totalPop25Plus !== null && hsGrad !== null && bachelorOrHigher !== null
    ? hsGrad + bachelorOrHigher
    : null;
```

This computes "HS diploma holders" + "bachelor's or higher" but misses everyone who has some college or an associate's degree without a bachelor's. The actual "HS or higher" population includes: HS diploma + GED + some college + associate's degree + bachelor's + master's + professional + doctorate. By summing only HS diplomas and bachelor's+, this significantly undercounts.

Two options:
1. **Fetch the missing variables** (`B15003_018E` through `B15003_021E` for GED, some college 1yr, some college no degree, associate's) and sum them all.
2. **Remove the `highSchoolOrHigher` field** and document that only `bachelorsOrHigher` and `graduateOrProfessional` are reported. This is honest and avoids presenting a misleading number.

The inline comments acknowledge the complexity ("HS or higher is complex. Simplify...") but the resulting value will confuse downstream consumers (the AI narrative) by appearing to show a very low educational attainment rate.

#### W2. Census `in` parameter uses `+` which may break with some Census API configurations

**File:** `/Users/personal/work-projects/locale/src/lib/census/index.ts`, line 304

```typescript
url.searchParams.set("in", `state:${fips.state}+county:${fips.county}`);
```

When passed through `URLSearchParams.set()`, the `+` becomes `%2B` in the URL. While most HTTP servers decode `%2B` back to `+` correctly, the Census API documentation shows the `in` parameter using a space as the separator in some examples and `+` in others. I verified that `%2B` decodes correctly in a standard HTTP context, so this likely works, but it is worth adding a test that explicitly verifies the Census API URL construction matches the expected format. Consider using a space instead of `+` for robustness:

```typescript
url.searchParams.set("in", `state:${fips.state} county:${fips.county}`);
```

#### W3. POI client has no timeout protection

**File:** `/Users/personal/work-projects/locale/src/lib/poi/index.ts`, line 254

The Overpass API query has a 15-second server-side timeout (in the Overpass QL: `[timeout:15]`), but the `fetch()` call itself has no `AbortController` / `signal` timeout. If the Overpass server is slow to respond or the connection hangs, the fetch could block indefinitely (or until the default Node/serverless timeout kills it).

The same applies to the Mapbox clients and the Census FCC geocoder call. For the Overpass API specifically, this is more concerning because it is a community-run service with variable availability.

Consider adding `AbortSignal.timeout(20_000)` (or similar) as a fetch option:
```typescript
const response = await fetch(url, {
  method: "POST",
  headers: { ... },
  body: `data=${encodeURIComponent(query)}`,
  signal: AbortSignal.timeout(20_000),
});
```

#### W4. `B08135_001E` aggregate travel time variable may not exist in the ACS 5-year dataset

**File:** `/Users/personal/work-projects/locale/src/lib/census/index.ts`, lines 188 and 443-447

The code fetches `B08135_001E` and divides by total commuters to approximate mean commute time. However, B08135 ("Aggregate Travel Time to Work") is from table B08135 and is the aggregate for the entire population, not the tract-level value that B08303 covers. The more standard variable for aggregate travel time to work by tract is `B08013_001E`. The lengthy inline comments (lines 191-198) suggest confusion about which variable to use. Verify that `B08135_001E` actually returns data at the tract level; if it returns null for most tracts, the `medianCommuteMinutes` field will always be null.

---

### Suggestions (Consider)

#### S1. Overpass query could hit rate limits on the public endpoint

**File:** `/Users/personal/work-projects/locale/src/lib/poi/index.ts`, line 254

The Overpass API at `overpass-api.de` is a public, community-run service. Heavy use can result in temporary bans (HTTP 429). For production, consider:
- Adding a retry with exponential backoff for 429 responses
- Using a mirror endpoint (e.g., `overpass.kumi.systems`) as a fallback
- Caching POI results aggressively (POI data changes slowly)

This is fine for MVP but worth noting for the transition to production.

#### S2. Stale module-level comments in Census client

**File:** `/Users/personal/work-projects/locale/src/lib/census/index.ts`, lines 191-198

The block comment starting with "We need median commute time..." reads like thinking-out-loud notes rather than a permanent code comment. It references multiple approaches and ends inconclusively. Clean this up to reflect the actual decision made (using `B08135_001E / B08301_001E` as mean commute time), or remove it and add a brief inline comment at the calculation site.

#### S3. Consider query length upper bound in geocode route

**File:** `/Users/personal/work-projects/locale/src/app/api/geocode/route.ts`

The route validates `query.length < 3` but has no upper bound. While Mapbox will handle extremely long queries gracefully, adding a reasonable upper limit (e.g., 200 characters) is a defensive measure against malformed or intentionally large payloads being forwarded to the Mapbox API.

#### S4. POI client: Overpass regex query includes `^` and `$` anchors unnecessarily

**File:** `/Users/personal/work-projects/locale/src/lib/poi/index.ts`, line 157

The Overpass query uses `~"^(restaurant|cafe|fast_food|...)$"` with anchors. Since Overpass regex matching already defaults to full-value matching for tag values, the anchors are harmless but unnecessary. Minor -- not worth changing unless refactoring the query builder.

#### S5. Rate limiter cleanup interval is never cleared on module unload

**File:** `/Users/personal/work-projects/locale/src/lib/rate-limit.ts`

The `cleanupTimer` uses `unref()` correctly (line 75-77) to avoid preventing Node process exit, which is the right approach. However, the `rateLimit` singleton at module scope (line 169) means the cleanup interval starts as soon as the first request hits and persists for the lifetime of the serverless function invocation. For Vercel serverless functions this is fine (they are short-lived), but it is worth documenting this behavior in the module comment for future maintainers.

#### S6. Test files import from `vitest` despite `globals: true` in config

**File:** `vitest.config.ts` line 6, all test files

The config sets `globals: true`, which makes `describe`, `it`, `expect`, `vi`, etc. available globally without imports. Yet every test file explicitly imports them from `vitest`. This is fine and arguably more explicit, but it is inconsistent with the config's intent. Either remove `globals: true` from the config (since it is unused) or keep the imports (which is the safer choice for TypeScript type inference). Recommend removing `globals: true` from the config to match actual usage.

---

## Test Coverage Assessment

### Strengths

- **All 6 test suites pass** (41 tests total, runtime ~150ms). Fast, no flakiness.
- **Error path coverage is thorough.** Every client tests: API errors (non-200), network failures, missing env vars.
- **Edge cases are well-covered.** Missing context fields in geocoding, missing Census values (`-`, empty string, `NaN`), elements without tags in POI, way elements using `center` coordinates.
- **Census test suite is particularly strong.** Tests FIPS parsing, empty Census responses, and individual field-level math (education, race, commute).
- **Rate limiter tests are comprehensive.** Window reset with fake timers, multi-IP tracking, `x-forwarded-for` parsing, 429 response format.
- **Geocode route tests cover all validation branches** (short query, missing query, whitespace-only).

### Gaps

1. **No test for Census `in` parameter URL construction.** The Census test verifies `for` and `in` params (line 310-312) but does not assert the exact encoding. Given the `+` vs space concern (W2), an explicit test would prevent regressions.

2. **No test for the POI `buildOverpassQuery` function.** The Overpass query construction is complex (regex building from the tag map, coordinate interpolation). A unit test that asserts the generated Overpass QL string would catch regressions if the tag map changes.

3. **No test for `forwardGeocode` when Mapbox returns malformed JSON.** The test covers non-200 and network errors, but not a 200 response with invalid JSON. The generic catch block would handle it, but an explicit test documents the behavior.

4. **Geocode route test does not test error propagation from `forwardGeocode`.** If `forwardGeocode` throws (e.g., missing env var), the route handler does not catch it, resulting in an unhandled 500. There is no test for this path.

5. **Rate limiter test suite does not test the cleanup mechanism.** The periodic cleanup of expired entries (every 5 minutes) is untested. A test could advance fake timers past the cleanup interval and verify expired entries are removed from the store.

---

## Convention Compliance

| Convention | Status | Notes |
|---|---|---|
| One directory per external service | Pass | `lib/mapbox/`, `lib/census/`, `lib/poi/` |
| Error handling: return null, don't throw | Pass | All clients follow this pattern |
| Console logging with bracketed module tag | Pass | `[geocoding]`, `[isochrone]`, `[census]`, `[poi]` |
| Env var validation throws eagerly | Pass | `getAccessToken()` / `getApiKey()` in each module |
| Types co-located with client | Pass | All interfaces exported from same file |
| No external HTTP libraries | Pass | All calls use native `fetch` |
| Proxy pattern for secrets | Pass | Geocode route keeps token server-side |
| Input validation at route level | Pass | Query length check in geocode route |
| `NextResponse.json()` for responses | Pass | Used in geocode route |
| `@/` path alias for imports | Pass | All test files and route use `@/` |
| CONVENTIONS.md updated | Pass | API Clients, API Routes, and Rate Limiting sections added |

---

## Patterns to Document

These patterns emerged from this phase and could be added to CONVENTIONS.md if they are not already covered:

1. **Test file location:** Tests live in `src/lib/__tests__/` with filenames matching the module they test. This pattern should be documented in CONVENTIONS.md under a "Testing" section.

2. **Mock fetch pattern:** Tests use `vi.spyOn(globalThis, "fetch")` for mocking HTTP calls. This avoids coupling to any specific HTTP library and works with the native `fetch` convention.

3. **Sequential fetch mocking for multi-API clients:** The Census test uses a URL-matching `mockImplementation` to handle the FCC-then-Census two-step fetch. This is a clean pattern for testing clients that call multiple APIs.

---

## Overall Assessment

**Rating: Good -- approve with required fixes**

The Phase 1 data layer is well-architected, well-tested, and follows the project's conventions closely. The code demonstrates consistent patterns across all five API clients: clean type definitions, graceful error handling, and thoughtful null propagation. The test suite is strong at 41 tests with fast execution.

The two critical issues (Census variable mapping error C1, missing rate limiter C2) must be addressed before building Phase 2, since the report orchestrator will consume this data layer directly. The Census year-built bug will produce incorrect housing data for every report. The missing rate limiter on the geocode route is a budget and abuse risk.

The warnings (W1-W4) should be addressed soon but do not block forward progress. The suggestions (S1-S6) are improvements for maintainability and robustness.

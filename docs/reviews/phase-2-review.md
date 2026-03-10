# Code Review: Phase 2 — Report Generation Engine
**Date:** 2026-03-10
**Reviewer:** Claude Opus 4.6 (automated)
**Status:** Resolved

## Summary

Phase 2 implements the report generation engine: an orchestrator that fires parallel API calls, an AI narrative module with streaming via the Vercel AI SDK, and two API routes (POST generate, GET by slug). The implementation includes 39 new tests across 4 test suites, all passing (82 total tests across the project). The code is well-structured, follows established conventions, and demonstrates thoughtful handling of partial failures. The narrative prompt is well-crafted and aligns with the product voice described in PRODUCT.md.

There are no critical bugs. The most significant issues are a potential race condition in slug generation, an address-based cache lookup that can miss reports due to string matching fragility, and the `getApiKey()` function in the narrative module being called but not actually passed to the AI SDK provider (which will use `ANTHROPIC_API_KEY` from the environment on its own). These are all fixable without architectural changes.

## Files Reviewed

| File | Purpose |
|------|---------|
| `src/lib/report/generate.ts` | Report orchestrator + slug generation |
| `src/lib/report/narrative.ts` | AI narrative prompt construction + streaming |
| `src/app/api/report/generate/route.ts` | POST endpoint for report generation |
| `src/app/api/report/[slug]/route.ts` | GET endpoint for fetching reports by slug |
| `src/lib/__tests__/report-generate.test.ts` | Orchestrator tests (10 tests) |
| `src/lib/__tests__/report-narrative.test.ts` | Prompt construction tests (13 tests) |
| `src/lib/__tests__/report-route-generate.test.ts` | POST route tests (11 tests) |
| `src/lib/__tests__/report-route-slug.test.ts` | GET route tests (5 tests) |

---

## Findings

### Critical (Must Fix)

No critical issues found.

---

### Warnings (Should Fix)

#### W1. Race condition in slug generation: check-then-insert without uniqueness lock

**File:** `/Users/personal/work-projects/locale/src/lib/report/generate.ts`, lines 100-118

The `generateUniqueSlug` function checks whether a slug exists in the database, then inserts a report with that slug in a separate operation. Under concurrent requests for the same or similar addresses, two requests can both read "slug is available" and then both attempt to insert, causing a unique constraint violation on `reports.slug`.

```typescript
// Line 105-113: gap between SELECT and INSERT allows concurrent collision
const existing = await db
  .select({ id: reports.id })
  .from(reports)
  .where(eq(reports.slug, base))
  .limit(1);

if (existing.length === 0) {
  return base;  // Both concurrent requests reach here
}
```

The insert on line 156-163 will fail for the second request with a Postgres unique constraint error, which is unhandled -- it will propagate as a 500 to the caller.

**Recommendation:** Either (a) wrap the slug check + report insert in a transaction, or (b) catch the unique constraint error in `generateReport` and retry with a suffixed slug. Option (b) is simpler and more resilient:

```typescript
try {
  const [report] = await db.insert(reports).values({ ... }).returning();
} catch (err) {
  if (isUniqueViolation(err)) {
    // Retry with random suffix
  }
  throw err;
}
```

For MVP traffic this is unlikely to trigger, but the fix is straightforward and avoids a 500 error in production.

#### W2. Address-based cache lookup is fragile due to exact string matching

**File:** `/Users/personal/work-projects/locale/src/app/api/report/generate/route.ts`, lines 100-127

The cache check matches on `eq(locations.address, address)` using an exact string comparison. This means:
- "123 Main St, Springfield, IL" and "123 main st, springfield, il" are treated as different addresses
- "123 Main St, Springfield, IL 62701" vs "123 Main St, Springfield, IL" are different
- Trailing/leading whitespace differences after trim could still vary depending on client behavior

This is acknowledged in CONVENTIONS.md as the intended design ("checks for an existing report by matching the address string"), but in practice, the same physical location will generate duplicate reports if the client sends the address in slightly different formats.

**Recommendation:** Consider normalizing the address before comparison (e.g., lowercase + collapse whitespace), or matching on coordinates within a small epsilon, or storing a normalized version of the address for lookup. This would reduce unnecessary duplicate report generation and API costs.

#### W3. The `getApiKey()` call in `generateNarrative` validates but does not use the returned value

**File:** `/Users/personal/work-projects/locale/src/lib/report/narrative.ts`, lines 299-300

```typescript
// Line 299-300
getApiKey();

const result = streamText({
  model: anthropic("claude-sonnet-4-6"),
  // ...
});
```

The `getApiKey()` function is called to validate that `ANTHROPIC_API_KEY` exists, but the returned key is discarded. The `anthropic()` provider from `@ai-sdk/anthropic` reads `ANTHROPIC_API_KEY` from the environment internally. This is not a bug -- the validation is useful as a fail-fast check -- but it is misleading. A reader might assume the key is supposed to be passed somewhere.

**Recommendation:** Add a comment explaining the intent:

```typescript
// Fail fast if ANTHROPIC_API_KEY is missing (the provider reads it from env internally).
getApiKey();
```

#### W4. Location row is always inserted even if report generation fails completely

**File:** `/Users/personal/work-projects/locale/src/lib/report/generate.ts`, lines 139-151

The orchestrator inserts a `locations` row (Step 1) before any data fetching occurs. If all three API calls fail and the report is marked as "failed", the location row remains in the database with no useful report attached. Over time, this creates orphaned location rows.

Additionally, the location row is inserted on every call, even for a new request that matches a previously failed report's address. The route-level cache check only looks for existing locations with reports, so a failed report for "123 Main St" will still result in finding the location and returning the failed report's slug.

**Recommendation:** Consider inserting the location row in a transaction with the report row, or deferring location insertion until at least one data source succeeds. Alternatively, add a cleanup mechanism for failed reports (a scheduled job or TTL-based deletion).

#### W5. Background narrative persistence has no way to signal failure to the caller

**File:** `/Users/personal/work-projects/locale/src/lib/report/narrative.ts`, lines 312-314

```typescript
collectAndPersistNarrative(reportId, result).catch((err) => {
  console.error("[narrative] Failed to persist narrative:", err);
});
```

If the stream completes but the DB update fails (e.g., database is down), the report will be stuck in "generating" status permanently. The caller (the API route) has already returned a streaming response, so it cannot be notified of the failure. There is a secondary catch that tries to mark the report as "failed" (lines 344-352), which is good, but if both the narrative persistence and the failure-marking fail, the report is orphaned in "generating" status.

**Recommendation:** This is acceptable for MVP given the error handling in the inner catch. Consider adding a background job or periodic sweep that transitions stale "generating" reports (e.g., older than 5 minutes) to "failed" status. Document this as a known limitation.

---

### Suggestions (Consider)

#### S1. Slug generation uses `Math.random()` which is not cryptographically secure

**File:** `/Users/personal/work-projects/locale/src/lib/report/generate.ts`, line 116

```typescript
const suffix = Math.random().toString(36).substring(2, 7);
```

For URL slugs this is fine -- there is no security requirement for unpredictability. However, `Math.random()` can produce collisions. The 5-character base-36 suffix gives ~60 million possible values, which is more than sufficient for this use case. No action needed, but worth noting if slug collision rates become a concern.

#### S2. The `toTextStreamResponse` on line 164 may not pass custom headers to the response

**File:** `/Users/personal/work-projects/locale/src/app/api/report/generate/route.ts`, lines 164-169

```typescript
return streamResult.toTextStreamResponse({
  headers: {
    ...rateLimit.headers(rl),
    "X-Report-Slug": result.slug,
    "X-Report-Id": String(result.reportId),
  },
});
```

The Vercel AI SDK's `toTextStreamResponse()` method accepts a `headers` option, which should work correctly. However, CONVENTIONS.md notes the preference for `toTextStreamResponse()` over `toDataStreamResponse()`, and the code follows this. Verify that the custom headers (`X-Report-Slug`, `X-Report-Id`) are actually received by the client, as some streaming implementations may not forward custom headers until the stream begins.

#### S3. The `buildUserPrompt` could include isochrone area estimates for richer narrative context

**File:** `/Users/personal/work-projects/locale/src/lib/report/narrative.ts`, lines 211-218

Currently, the isochrone section only reports that polygon data is "available":

```typescript
parts.push(`${minutes}-minute walking isochrone polygon available`);
```

The AI model cannot derive walkability insights from this. Consider computing a rough area from the polygon coordinates (e.g., using the Shoelace formula) and reporting "5-minute walking area: approximately X square kilometers." This would give the narrative model much more to work with when describing walkability.

#### S4. The `unnamed` count in POI prompt section is slightly off

**File:** `/Users/personal/work-projects/locale/src/lib/report/narrative.ts`, lines 236-239

```typescript
const named = cat.items.filter((i) => i.name).slice(0, 8);
// ...
const unnamed = cat.count - named.length;
```

The variable name `unnamed` is misleading. It represents "items not shown" rather than "items without names." The count includes both unnamed items and named items beyond the top 8. Consider renaming to `remaining` for clarity:

```typescript
const remaining = cat.count - named.length;
if (remaining > 0) {
  parts.push(`  + ${remaining} more`);
}
```

#### S5. The slug route does not include rate limiting

**File:** `/Users/personal/work-projects/locale/src/app/api/report/[slug]/route.ts`

The GET `/api/report/[slug]` route has no rate limiting. While this route only queries the database (no external API costs), it could still be abused to enumerate report slugs or stress the database. CONVENTIONS.md states "Rate limit all proxy routes" which applies primarily to routes forwarding to paid APIs, so this is technically compliant. However, a generous rate limit (e.g., 120/hour) would add a layer of protection.

#### S6. Cache hit response returns status "generating" for in-progress reports without checking age

**File:** `/Users/personal/work-projects/locale/src/app/api/report/generate/route.ts`, lines 117-126

When a cached report is found with `status: "generating"`, the route returns this status to the client. If the original generation request failed silently (narrative persistence failed, server crashed), the report could be stuck in "generating" forever. The client would keep receiving `cached: true, status: "generating"` with no way to trigger re-generation.

**Recommendation:** Consider adding a staleness check: if a report has been in "generating" status for more than N minutes (e.g., 5), treat it as failed and allow re-generation.

#### S7. Test mocks for DB are tightly coupled to the query builder chain shape

**Files:** All test files

The DB mocks replicate the exact Drizzle query builder chain:

```typescript
getDb: () => ({
  insert: () => ({
    values: () => ({
      returning: mockInsertReturning,
    }),
  }),
  // ...
})
```

This works but is brittle -- if Drizzle changes its chain API or the code adds a `.orderBy()` or `.columns()` call, the mock breaks. This is a common trade-off with chain-style query builders. For MVP this is fine. If the test suite grows, consider extracting database operations into a thin repository layer that is easier to mock.

---

## Convention Compliance

| Convention | Status | Notes |
|---|---|---|
| One directory per service (`lib/report/`) | Pass | `generate.ts` and `narrative.ts` co-located |
| Error handling: return null / don't throw (API clients) | Pass | Orchestrator catches via `.catch()` wrappers |
| Console logging with bracketed module tag | Pass | `[report]`, `[narrative]`, `[report/generate]`, `[report/slug]` |
| Env var validation throws eagerly | Pass | `getApiKey()` in narrative module |
| Types co-located with client | Pass | `ReportData`, `GenerateReportInput`, etc. in `generate.ts` |
| No external HTTP libraries | Pass | AI SDK is for LLM streaming, not general HTTP |
| Proxy pattern for secrets | Pass | `ANTHROPIC_API_KEY` stays server-side |
| Input validation at route level | Pass | Body validation in generate route, slug validation in slug route |
| Rate limit proxy routes | Pass | Generate route uses default `rateLimit` singleton (10/hr) |
| `NextResponse.json()` for responses | Pass | Used in both routes |
| `@/` path alias for imports | Pass | All imports use `@/` |
| Fetch timeouts on external calls | N/A | No direct fetch calls -- delegates to Phase 1 clients + AI SDK |
| `Promise.all` for parallel fetching | Pass | Census, isochrone, POI fetched in parallel |
| Test location in `src/lib/__tests__/` | Pass | All 4 test files follow convention |
| Explicit vitest imports | Pass | All test files import from `vitest` |
| HTTP mocking via `vi.spyOn(globalThis, "fetch")` | N/A | Phase 2 tests mock at module level, not fetch level (appropriate) |
| CONVENTIONS.md updated | Pass | Report Generation section added |

---

## Test Coverage Assessment

### Strengths

- **All 39 Phase 2 tests pass** (82 total across the project). Fast execution (~180ms for tests).
- **Slug generation is well-tested** with 5 cases covering special characters, truncation, hyphen collapsing, and leading/trailing cleanup.
- **Partial failure handling is verified.** Tests cover all-succeed, one-succeed, and all-fail scenarios for the data sources.
- **API client exception handling is tested.** The orchestrator test verifies that thrown errors from Census/POI are caught and converted to null.
- **Route validation is thorough.** 7 validation tests cover missing fields, out-of-range coordinates, empty strings, and invalid JSON.
- **Cache hit path is tested.** The generate route test verifies that cached reports bypass `generateReport`.
- **Narrative fallback is tested.** When `generateNarrative` throws, the route returns a JSON response with `narrativeError: true`.
- **Prompt construction tests are comprehensive.** 13 tests verify that each data section appears/disappears correctly, missing data notes are included/excluded, and national averages are surfaced.

### Gaps

1. **No test for slug collision handling.** The `generateUniqueSlug` function's suffix-appending path (when the base slug already exists in the DB) is not directly tested. The mock always returns `[]` (no existing slug). A test should mock the first `mockSelectWhere` to return an existing record and verify that the returned slug has a random suffix appended.

2. **No test for the `generateNarrative` function itself.** The narrative module's `generateNarrative` function is only tested indirectly (mocked in route tests). There are no tests that verify it calls `streamText` with the correct parameters, starts the background persistence task, or handles stream failures. The `buildSystemPrompt` and `buildUserPrompt` functions are well-tested, but the orchestrating function is not.

3. **No test for concurrent report generation.** Given the race condition identified in W1, a test that simulates concurrent slug generation would document the expected behavior.

4. **No test for the `collectAndPersistNarrative` error recovery path.** The function marks a report as "failed" when stream collection fails (lines 341-352), but this path is untested.

5. **No test for address normalization in cache lookup.** The route test for cache hit uses an exact address match. A test with a slightly different address format (extra whitespace, different casing) would document that these are treated as cache misses.

6. **The `buildUserPrompt` test does not verify the "unnamed POI" count logic.** The fixture data has all named POIs, so the `+ N more` path is never exercised.

---

## AI Prompt Quality Assessment

### System Prompt (lines 37-63 of `narrative.ts`)

**Strengths:**
- The banned words list is specific and targets real AI writing failure modes ("bustling", "vibrant", "tapestry", "nestled", "boasts", "plethora")
- The voice guidelines directly reflect PRODUCT.md's "knowledgeable local friend" persona
- The structure guidance (3-5 paragraphs, specific ordering) gives the model clear constraints
- The missing data handling instruction ("do not call attention to its absence") prevents awkward gaps in the narrative

**Potential improvements:**
- Consider adding "vibrant community" and "rich cultural" to the banned phrases list -- these are common AI fillers
- The prompt does not instruct the model about data attribution. PRODUCT.md says "Data provenance should be visible and attributable throughout." Consider adding a guideline like "When citing specific numbers, note the data source (e.g., Census data, walking distance estimates)"
- The prompt does not mention the "Honest Over Flattering" design principle by name, though it does implement it with "Be honest about tradeoffs"

### User Prompt (lines 69-281 of `narrative.ts`)

**Strengths:**
- Clean section headers (=== ALL CAPS ===) make it easy for the model to parse
- National averages are included inline for comparison context -- this is well done
- Named POIs are listed with walking times, giving the model specific details to reference
- The missing data note is clear and actionable

**Potential improvements:**
- The isochrone section provides minimal information ("polygon available"). Computing rough walkable area would give the model more to work with (see S3)
- Education data is presented as raw counts rather than percentages of total population 25+. The model would benefit from pre-computed percentages
- Commute mode data is also raw counts. Pre-computing percentages would make the data more immediately interpretable for the model

---

## Patterns to Document

These patterns emerged from Phase 2 and should be considered for addition to CONVENTIONS.md if not already present:

1. **Background task pattern for stream persistence:** The `collectAndPersistNarrative` function runs concurrently with the stream response, using a `.catch()` fire-and-forget pattern. This pattern should be documented with its trade-offs (caller cannot be notified of persistence failure).

2. **Module-level mock pattern for Drizzle:** Test files mock the entire `@/lib/db` module with a chain-matching object. This pattern is consistent across all 4 new test files and should be documented as the standard approach for DB-dependent tests.

3. **Graceful narrative degradation:** When AI narrative generation fails, the route returns a JSON response with the report slug and a `narrativeError: true` flag, rather than failing the entire request. This is a good pattern for features where the primary operation (data fetching) succeeded but a secondary operation (narrative) failed.

---

## Overall Assessment

**Rating: Good -- approve with recommended fixes**

The Phase 2 implementation is solid. The orchestrator correctly implements the parallel-fetch-with-graceful-degradation pattern specified in BUILD-STRATEGY Decision 4. The AI prompt is well-crafted and avoids common AI writing pitfalls. The streaming narrative with background persistence is a clean architecture that matches the Vercel AI SDK's intended usage pattern. Error handling is thorough at every layer.

The warnings (W1-W5) represent real issues but none are blocking for MVP. The slug race condition (W1) is the most important to address before any meaningful traffic, as it will produce 500 errors. The address cache fragility (W2) will cause unnecessary duplicate report generation and API cost. The remaining warnings are about edge cases in error recovery.

The test suite is strong for the scope of the implementation (39 tests, all passing), with good coverage of the happy path and key error scenarios. The identified gaps are primarily around concurrency edge cases and the narrative generation function itself, which are reasonable to address incrementally.

Convention compliance is excellent across all files. The code follows established patterns for error handling, logging, validation, and module organization.

# Phase 7 Code Review: Testing (T7.1, T7.2)

**Date:** 2026-03-11
**Reviewer:** Claude Opus 4.6
**Commits reviewed:** fe5cb40, 97bb4fe, 68f31b9 + unstaged changes to report-route-generate.test.ts
**Status:** Review Complete

---

## Summary

Phase 7 adds two major testing deliverables: a golden dataset prompt evaluation system (T7.1) and 50 mocked integration tests for the report generation flow (T7.2). There are also 3 new tests added to the existing API route test file (unstaged). The overall quality is high -- the integration test coverage is thorough with a complete partial failure matrix, realistic fixture builders, and good edge case coverage. The golden dataset is well-designed with 20 diverse neighborhood archetypes. However, there are a few issues that need attention, most notably an incorrect coordinate for Ann Arbor and a broken npm script.

**Files Reviewed:**
- `tests/golden-addresses.ts` (363 lines) -- 20 diverse US addresses
- `tests/eval-narratives.ts` (769 lines) -- Evaluation script with mock data builders
- `src/lib/__tests__/integration.test.ts` (1199 lines) -- 50 integration tests
- `src/lib/__tests__/report-route-generate.test.ts` (unstaged changes) -- 3 new route tests
- `package.json` -- test:eval script addition
- `.gitignore` -- tests/output/ exclusion
- `CONVENTIONS.md` -- testing convention additions
- `docs/IMPLEMENTATION-PLAN.md` -- T7.1/T7.2 marked complete

**Test counts:** 153 tests passing across 12 test files (up from ~100 across 11 files before Phase 7).

---

## Critical (Must Fix)

### C1. Ann Arbor coordinates are wrong by ~150 miles

**File:** `/Users/personal/work-projects/locale/tests/golden-addresses.ts`, line 96-97

The golden address for Ann Arbor lists `lat: 40.1092, lng: -83.7137`. These coordinates place the point in central Ohio (near Marysville, OH), not Ann Arbor, MI. The actual coordinates for 530 S State St, Ann Arbor are approximately `lat: 42.275, lng: -83.741`.

This matters because the eval script builds mock data keyed to the label, so the prompt text will still say "Ann Arbor" -- but if the `--live` flag is ever extended to use real geocoding or if coordinates are included in prompts, the data will be wrong. More importantly, the golden dataset is meant to be a reference artifact. Incorrect data undermines trust in the dataset.

```typescript
// Current (wrong -- this is in Ohio):
lat: 40.1092,
lng: -83.7137,

// Should be:
lat: 42.2808,
lng: -83.7430,
```

### C2. `npm run test:eval` fails -- `tsx` is not installed as a dependency

**File:** `/Users/personal/work-projects/locale/package.json`, line 12

The script `"test:eval": "tsx tests/eval-narratives.ts"` references `tsx` as a bare command, but `tsx` is not listed in either `dependencies` or `devDependencies` in `package.json`. Running `npm run test:eval` produces `sh: tsx: command not found`.

The script works with `npx tsx tests/eval-narratives.ts` because `npx` downloads it on the fly, but the registered npm script is broken for anyone who clones the repo.

Fix: Add `tsx` to devDependencies, or change the script to `npx tsx tests/eval-narratives.ts`.

---

## Warnings (Should Fix)

### W1. `generateSlug` produces trailing hyphens after truncation

**File:** `/Users/personal/work-projects/locale/src/lib/__tests__/integration.test.ts`, lines 1024-1033

The test for long address slug generation correctly notes in a comment (line 1032-1033) that truncation at 60 characters may leave a trailing hyphen, and says "This is acceptable for URL slugs." However, this is actually a bug in `generateSlug` in `/Users/personal/work-projects/locale/src/lib/report/generate.ts` -- the `.replace(/^-|-$/g, "")` runs before `.slice(0, 60)`, so the trim never catches hyphens introduced by truncation.

Example: `"12345 North Very Long Boulevard Apartment 42B Suite 100, San Francisco..."` produces `"12345-north-very-long-boulevard-apartment-42b-suite-100-san-"` (trailing hyphen).

This is not a test bug per se, but the test should not accept broken behavior as correct. The slug should have a final `.replace(/-$/, "")` after the slice, and the test should assert `expect(slug).not.toMatch(/-$/)`.

### W2. DB mock structure is fragile -- ignores table arguments

**File:** `/Users/personal/work-projects/locale/src/lib/__tests__/integration.test.ts`, lines 15-28

The DB mock returns the same `mockInsertReturning` function regardless of whether `insert(locations)` or `insert(reports)` is called. This works because tests carefully sequence their `mockResolvedValueOnce` / `mockRejectedValueOnce` calls, but it means:

1. If the order of DB operations in `generateReport` ever changes, tests will silently break with confusing errors.
2. Tests cannot verify that the correct table is being inserted into.

Consider splitting into `mockLocationInsert` and `mockReportInsert` that check the table argument, or at minimum add a comment documenting this coupling.

### W3. Eval script `buildMockCensus` uses `number` types where source types allow `number | null`

**File:** `/Users/personal/work-projects/locale/tests/eval-narratives.ts`, lines 49-462

The `buildMockCensus` function assigns all fields as plain `number` values, then returns a `CensusResult`. But the actual `CensusResult` type (from `census/index.ts`) defines most fields as `number | null`. While TypeScript allows assigning `number` where `number | null` is expected, the mock data never exercises the null-field paths in prompt construction. The integration tests in `integration.test.ts` do cover this (the all-null Census test at line 927), but the eval script's mock data never produces null Census fields. This means golden dataset prompts never test how the AI handles partial Census data.

Consider adding one or two golden addresses with deliberately null Census fields to test the AI narrative with incomplete data.

---

## Suggestions (Consider)

### S1. Add a prompt construction test that verifies the address header

The prompt construction tests verify section content (demographics, housing, walkability, amenities) but none verify the opening line: `"Write a neighborhood profile for: <address>"`. Adding a simple assertion like `expect(prompt).toContain("Write a neighborhood profile for: 456 DeKalb Ave")` would close this gap.

### S2. Eval script has no rate limiting for `--live` mode

**File:** `/Users/personal/work-projects/locale/tests/eval-narratives.ts`, lines 669-710

The `--live` mode fires 20 sequential API calls to the Anthropic API with no delay between them. While sequential execution provides implicit rate limiting (each waits for the prior response), this could hit rate limits on accounts with low quotas. Consider adding a brief delay (e.g., 1 second) between calls, or at minimum documenting the expected API cost (~20 calls at ~1500 tokens each).

### S3. ~~`Math.random()` in eval script POI builder produces non-deterministic prompts~~ (RESOLVED)

POI coordinates now use deterministic offsets based on `nextId` — no `Math.random()` calls remain.

### S4. Integration tests could verify that `console.error` is called on API failure

The partial failure matrix tests verify that the report result is correct when APIs fail, but they don't verify that the failures are logged. Since the convention (`CONVENTIONS.md`) specifies `console.error("[module] message", error)` for failures, consider adding `vi.spyOn(console, "error")` assertions in at least one failure test to verify observability.

### S5. Consider testing `buildSystemPrompt` content in the integration tests

The integration tests thoroughly test `buildUserPrompt` but never call or verify `buildSystemPrompt`. Since the system prompt contains critical voice guidelines and banned words, a basic assertion (e.g., `expect(buildSystemPrompt()).toContain("knowledgeable local friend")`) would guard against accidental changes.

---

## Convention Compliance

The Phase 7 changes comply with established conventions:

- **Test location:** Integration tests in `src/lib/__tests__/integration.test.ts` -- correct per convention.
- **Vitest imports:** All test files explicitly import `describe`, `it`, `expect`, `vi` from "vitest" -- correct.
- **HTTP mocking:** Uses `vi.mock` and `vi.mocked()` -- correct pattern.
- **Fixture builders:** Named `makeRealistic<Type>()` and documented in CONVENTIONS.md -- good.
- **Env var mocking:** Not needed in integration tests (DB and API clients are fully mocked).
- **CONVENTIONS.md update:** Three new entries for fixture builders, integration tests, and golden dataset. Accurate and concise.
- **Git commits:** Atomic, focused, clear messages with Co-Authored-By.

One minor style note: the eval script at `tests/` is outside the `src/` directory, which is appropriate since it's a standalone script, not part of the app bundle.

---

## Patterns to Document

No new patterns need documenting beyond what was already added to `CONVENTIONS.md`. The three new convention entries (fixture builders, integration tests, golden dataset) accurately capture the patterns established in this phase.

---

## Test Quality Assessment

### Strengths
- **Complete partial failure matrix:** All 7 combinations of 3 API sources (each success/fail) are tested, plus the null-return variant. This is exhaustive.
- **Realistic fixture builders:** `makeRealisticCensusResult`, `makeRealisticIsochroneResult`, `makeRealisticPoiResult` produce data that matches actual API response shapes with plausible values (Brooklyn addresses, real POI names, proper GeoJSON polygon rings).
- **Prompt construction coverage:** 14 tests verify that `buildUserPrompt` includes/excludes correct sections based on data availability, with specific value assertions for national averages, percentages, and calculated rates.
- **Slug edge cases:** 10 tests covering long addresses, special characters, Unicode, empty strings, numeric-only, consistency, and uniqueness.
- **Golden dataset diversity:** 20 addresses spanning dense urban, suburban, rural, college town, gentrifying, retirement, coastal, mountain, military, immigrant, arts, tech hub, industrial, and working-class archetypes. Good geographic spread (NY, CA, TX, IL, OH, MI, FL, PA, SC, CO, OR, WA).

### Gaps
- No test for concurrent `generateReport` calls (race condition on slug generation).
- No test for the `fetchedAt` timestamp format across different timezones.
- No test verifying the `eq()` import from drizzle-orm works correctly with the mock (the mock ignores `.where()` arguments entirely).
- The unstaged changes to `report-route-generate.test.ts` add good coverage (429, 500, address length validation) but are not yet committed.

---

## Files Referenced

- `/Users/personal/work-projects/locale/tests/golden-addresses.ts` -- Golden dataset (C1: wrong Ann Arbor coordinates)
- `/Users/personal/work-projects/locale/tests/eval-narratives.ts` -- Eval script (C2: tsx not installed, S2: no rate limiting, S3: non-deterministic)
- `/Users/personal/work-projects/locale/src/lib/__tests__/integration.test.ts` -- Integration tests (W1: trailing hyphen, W2: fragile DB mock)
- `/Users/personal/work-projects/locale/src/lib/__tests__/report-route-generate.test.ts` -- Route tests (unstaged, 3 new tests)
- `/Users/personal/work-projects/locale/package.json` -- Broken test:eval script (C2)
- `/Users/personal/work-projects/locale/src/lib/report/generate.ts` -- Source under test (W1: slug trailing hyphen bug)
- `/Users/personal/work-projects/locale/src/lib/report/narrative.ts` -- Prompt construction source
- `/Users/personal/work-projects/locale/CONVENTIONS.md` -- 3 new testing convention entries
- `/Users/personal/work-projects/locale/docs/IMPLEMENTATION-PLAN.md` -- T7.1/T7.2 marked complete

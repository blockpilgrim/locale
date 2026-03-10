# Phase 4 Code Review — Pages + Integration

**Date:** 2026-03-10
**Reviewer:** Claude Opus 4.6 (automated)
**Commit:** ee7d4c9 (implement phase 4: pages + integration — T4.1, T4.2, T4.3)
**Status:** Awaiting resolution

---

## Summary

Phase 4 wires up the homepage and report page, completing the core user flow: enter address, generate report, view report. The implementation follows the SSR/client-island architecture described in CONVENTIONS.md, with server components for SEO-critical content and client components for interactivity (Mapbox, Framer Motion, router navigation). Overall structure is solid and conventions are well-followed. The findings below identify a security concern, several robustness gaps in edge case handling, a performance opportunity, and a few correctness items.

---

## Files Reviewed

| File | Role |
|------|------|
| `src/app/report/[slug]/page.tsx` | Report page server component (new) |
| `src/components/ReportContent.tsx` | Client component for report rendering (new) |
| `src/components/HomepageClient.tsx` | Client component for homepage interactivity (new) |
| `src/components/AutoRefresh.tsx` | Auto-refresh polling component (new) |
| `src/app/page.tsx` | Homepage — reworked to server component (modified) |
| `CONVENTIONS.md` | Updated with Page Architecture section (modified) |

---

## Critical (Must Fix)

### C1. Unsafe `as` cast on unvalidated JSONB data — potential runtime crash

**File:** `src/app/report/[slug]/page.tsx`, line 172

```typescript
const reportData = row.data as ReportData;
```

The `reports.data` column is typed as `jsonb` (nullable in the schema — line 42 of `schema.ts`: `data: jsonb("data")`). When the report status is `"complete"`, `data` could still be `null` if the DB row was created but the data update failed silently, or if the row was manually modified. The `as` cast bypasses TypeScript's null check entirely.

If `data` is `null`, `ReportContent` will receive `null` as `data`, and child components will crash when accessing `data.coordinates`, `data.census`, etc.

**Fix:** Add a null guard before the cast:

```typescript
if (!row.data) {
  // Treat as a failed/incomplete report rather than crashing
  notFound(); // or render a "report data unavailable" state
}
const reportData = row.data as ReportData;
```

At minimum, this prevents a server-side crash that would result in a 500 error with no user-facing context.

---

### C2. Slug passed to `router.push()` without sanitization — open redirect risk

**File:** `src/components/HomepageClient.tsx`, lines 56 and 68

```typescript
router.push(`/report/${data.slug}`);
// and
router.push(`/report/${slug}`);
```

The `slug` value comes from the server response (JSON body or HTTP header). If the API is ever compromised, or if a man-in-the-middle modifies the response, the slug value could contain path traversal characters (e.g., `../../admin`) or, more concerning, the `X-Report-Slug` header value from a streaming response is used without validation.

While `router.push()` within Next.js is limited to same-origin navigation, a malicious slug like `../../../some-path` would navigate to unintended routes.

**Fix:** Validate the slug format before using it in navigation:

```typescript
const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

// Before router.push:
if (!slug || !SLUG_PATTERN.test(slug)) {
  throw new Error("Invalid slug returned from server.");
}
```

This mirrors the slug validation already applied server-side in `fetchReport()` (line 33 of the report page).

---

## Warnings (Should Fix)

### W1. AutoRefresh has no stop condition — polls indefinitely if report is stuck

**File:** `src/components/AutoRefresh.tsx`

The `AutoRefresh` component calls `router.refresh()` every 3 seconds with no maximum retry count, no timeout, and no backoff. If the report generation process hangs (e.g., the background narrative persistence fails silently and never updates the status from `"generating"` to `"complete"` or `"failed"`), this component will poll the database forever, burning server resources and the user's bandwidth.

**Fix:** Add a maximum lifetime or retry count. For example:

```typescript
export function AutoRefresh({ intervalMs = 3000, maxAttempts = 60 }: AutoRefreshProps) {
  const router = useRouter();
  const attempts = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      attempts.current += 1;
      if (attempts.current >= maxAttempts) {
        clearInterval(timer);
        // Optionally trigger a state change to show a "taking too long" message
        return;
      }
      router.refresh();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [router, intervalMs, maxAttempts]);

  return null;
}
```

With the default 3-second interval and 60 max attempts, this gives 3 minutes before giving up -- more than enough for any reasonable generation time.

### W2. Map component receives `null` coordinates when report data has none

**File:** `src/components/ReportContent.tsx`, line 78

```tsx
<Map
  coordinates={data.coordinates}
  isochrone={data.isochrone}
  pois={data.poi}
/>
```

While `ReportData.coordinates` is typed as non-nullable, the `data` comes from a JSONB column that could contain malformed data (see C1). If `coordinates` is somehow missing or malformed, the Map component will attempt to initialize Mapbox with `undefined` center coordinates, which produces an opaque Mapbox GL JS error.

The Map component itself has no defensive check on the `coordinates` prop. Consider adding a guard in `Map.tsx`:

```typescript
if (!coordinates || !Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) {
  return <div className="...">Map unavailable</div>;
}
```

### W3. No `loading.tsx` or `not-found.tsx` for the report route segment

**File:** `src/app/report/[slug]/` (directory)

The report page uses `notFound()` from `next/navigation`, but there is no `not-found.tsx` in the route segment to customize the 404 experience. The user will see Next.js's default 404 page, which does not match the editorial design language and does not include a CTA to return to the homepage.

Similarly, there is no `loading.tsx` to show a skeleton/spinner during the server component's data fetch. For slow database connections, the user sees nothing until the full page renders.

**Fix:** Add `src/app/report/[slug]/not-found.tsx` and optionally `loading.tsx` with the project's design system components.

### W4. Featured report slugs are hardcoded but may not exist in the database

**File:** `src/app/page.tsx`, lines 13-46

The `FEATURED_REPORTS` array contains hardcoded slugs (e.g., `"350-5th-ave-new-york-ny"`). Clicking these links navigates to `/report/{slug}`, which will return a 404 if no report with that slug exists in the database. This is noted in CONVENTIONS.md as "hardcoded illustrative data," but the user experience of clicking a featured card and landing on a 404 is poor.

**Options:**
1. Pre-seed the database with these reports as part of the migration/seed script.
2. Change the featured cards to trigger report generation instead of linking directly (i.e., POST to `/api/report/generate` on click, same as the address input flow).
3. Add a note in the UI that these are example reports that need to be generated first.

### W5. HomepageClient does not cancel in-flight requests on unmount

**File:** `src/components/HomepageClient.tsx`

The `handleSelect` callback fires a `fetch()` call but does not use an `AbortController`. If the user navigates away (e.g., browser back button) while the POST is in-flight, the request continues in the background and the `.then()` chain may attempt to call `router.push()` on an unmounted component.

The existing `useReportStream` hook in the codebase already handles this pattern with `AbortController`. Consider applying the same pattern here:

```typescript
const abortRef = useRef<AbortController | null>(null);

const handleSelect = useCallback(async (suggestion: GeocodeSuggestion) => {
  abortRef.current?.abort();
  abortRef.current = new AbortController();

  const response = await fetch("/api/report/generate", {
    method: "POST",
    signal: abortRef.current.signal,
    // ...
  });
  // ...
}, [router]);

// In a cleanup effect:
useEffect(() => () => abortRef.current?.abort(), []);
```

---

## Suggestions (Consider)

### S1. Dynamic import for ReportContent to reduce initial bundle

**File:** `src/app/report/[slug]/page.tsx`, line 15

`ReportContent` imports Mapbox GL JS, Framer Motion, and all 5 data section components. While it is a client component (so it is already code-split from the server bundle), it is imported statically. For the `"generating"` and `"failed"` status branches, the full ReportContent bundle is downloaded but never rendered.

Consider using `next/dynamic` to lazy-load `ReportContent` only when status is `"complete"`:

```typescript
import dynamic from "next/dynamic";
const ReportContent = dynamic(() =>
  import("@/components/ReportContent").then(m => ({ default: m.ReportContent })),
  { loading: () => <ReportLoadingSkeleton /> }
);
```

This is noted as Phase 6 work (T6.3 Performance optimization), so this is informational rather than blocking.

### S2. Consider adding `aria-live` region for the generating/error states

**Files:** `src/app/report/[slug]/page.tsx` (generating state), `src/components/HomepageClient.tsx` (error state)

The generating spinner and error messages are dynamically rendered but are not announced to screen readers. Adding `aria-live="polite"` to the generating state container and `aria-live="assertive"` to error containers would improve accessibility:

```tsx
{/* Generating state */}
<div aria-live="polite" role="status" className="...">
  <p>Generating your report...</p>
</div>

{/* Error state */}
<div aria-live="assertive" role="alert" className="...">
  <p>{error}</p>
</div>
```

### S3. `generateMetadata` returns a "Report Not Found" title for DB errors

**File:** `src/app/report/[slug]/page.tsx`, lines 71-82

The `fetchReport()` function returns `null` for both "slug not found" and "database error" cases. The `generateMetadata` function treats both as "Report Not Found." For a transient DB error, this results in misleading metadata being cached. Consider differentiating between "not found" and "error" by returning a more nuanced type from `fetchReport()`, or at minimum using a generic title like "Locale" for the error case rather than "Report Not Found."

### S4. Consider `fetchReport` result type for better exhaustiveness

**File:** `src/app/report/[slug]/page.tsx`

The `fetchReport` function returns `null | row` and the page component checks `row.status` with `if` chains. A discriminated union return type (e.g., `{ kind: "not-found" } | { kind: "error" } | { kind: "ok", data: Row }`) would let TypeScript enforce exhaustive status handling and prevent the DB error vs. not-found conflation noted in S3.

### S5. The report page has no `export const dynamic = "force-dynamic"` or revalidation config

**File:** `src/app/report/[slug]/page.tsx`

Next.js may attempt to statically generate or cache this page. Since the report status can change (from `"generating"` to `"complete"`), the page must always fetch fresh data. Next.js should detect the dynamic `params` and `getDb()` call as dynamic, but explicitly marking it would be more robust:

```typescript
export const dynamic = "force-dynamic";
```

This prevents any accidental caching during the `"generating"` -> `"complete"` transition, which would cause the AutoRefresh to poll forever against a stale cached response.

---

## Convention Compliance

| Convention | Compliant? | Notes |
|-----------|-----------|-------|
| `"use client"` only on interactive components | Yes | Server components for page.tsx, client for ReportContent, HomepageClient, AutoRefresh |
| `@/*` path alias for imports | Yes | All imports use the alias |
| `getDb()` lazy connection | Yes | Used correctly in fetchReport() |
| `fadeUp` from `@/lib/motion` | Yes | ReportContent imports from shared module, no redefinition |
| Design system components (Container, SectionHeader) | Yes | Used consistently |
| Graceful hiding for null data | Yes | Data sections guard on null props, sections return null |
| Error logging with `[module]` prefix | Yes | `[report/page]`, `[HomepageClient]` |
| `notFound()` for missing slugs | Yes | Called when fetchReport returns null |
| SSR/client split pattern | Yes | Matches the documented convention exactly |
| CONVENTIONS.md updated | Yes | Page Architecture section added with all new patterns |
| XSS prevention | N/A | No new `.setHTML()` or `dangerouslySetInnerHTML` usage in Phase 4 files |

---

## Patterns to Document

The following patterns emerged in Phase 4 that may be worth adding to CONVENTIONS.md if not already covered:

1. **AutoRefresh maximum lifetime:** If W1 is addressed by adding a max attempts parameter, document the pattern and default values so future polling components follow the same approach.

2. **Client-side slug validation:** If C2 is addressed, document the slug format regex (`/^[a-z0-9-]{1,80}$/`) as a shared constant, potentially in a `src/lib/slugs.ts` utility, since the same validation appears in both `fetchReport()` (server) and would appear in `HomepageClient` (client).

3. **JSONB null safety pattern:** The approach to handling nullable JSONB columns that are cast to typed interfaces should be documented. The pattern "guard for null before casting" prevents a class of runtime crashes from database edge cases.

---

## File Paths Referenced

- `/Users/personal/work-projects/locale/src/app/report/[slug]/page.tsx`
- `/Users/personal/work-projects/locale/src/components/ReportContent.tsx`
- `/Users/personal/work-projects/locale/src/components/HomepageClient.tsx`
- `/Users/personal/work-projects/locale/src/components/AutoRefresh.tsx`
- `/Users/personal/work-projects/locale/src/app/page.tsx`
- `/Users/personal/work-projects/locale/CONVENTIONS.md`
- `/Users/personal/work-projects/locale/src/lib/db/schema.ts`
- `/Users/personal/work-projects/locale/src/app/api/report/[slug]/route.ts`
- `/Users/personal/work-projects/locale/src/components/Map.tsx`

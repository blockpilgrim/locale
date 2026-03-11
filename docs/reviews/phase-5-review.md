# Phase 5 Code Review — Shareability + SEO

**Date:** 2026-03-10
**Reviewer:** Claude Opus 4.6 (automated)
**Commit:** a3f7e66 (implement phase 5: shareability + SEO — T5.1, T5.2)
**Status:** Open

---

## Summary

Phase 5 adds Open Graph metadata with a Mapbox Static Images-based OG image (T5.1) and a ShareControls component with copy-to-clipboard, native share, Twitter/Facebook sharing, and a "Generate your own report" CTA (T5.2). The implementation is clean, follows established project conventions, and integrates well with the existing report page architecture. The OG image approach (Mapbox Static Images URL in meta tags, no `@vercel/og` needed) is a pragmatic choice that avoids extra infrastructure.

The review identifies one security concern around URL construction, a hydration risk, a minor correctness issue with the deprecated clipboard fallback, and several suggestions for robustness.

---

## Files Reviewed

| File | Role |
|------|------|
| `src/app/report/[slug]/page.tsx` | Added OG image via Mapbox Static Images API to `generateMetadata` (modified) |
| `src/components/ReportContent.tsx` | Integrated ShareControls, added `slug` prop (modified) |
| `src/components/ShareControls.tsx` | Share buttons component (new) |

---

## Critical (Must Fix)

### C1. Hydration mismatch from `navigator.share` check at module render scope

**File:** `src/components/ShareControls.tsx`, lines 180-181

```typescript
const supportsNativeShare =
  typeof navigator !== "undefined" && typeof navigator.share === "function";
```

This expression is evaluated during render. During SSR (server-side rendering), `navigator` is `undefined`, so `supportsNativeShare` will be `false`. On the client, if the browser supports `navigator.share` (most mobile browsers), it will be `true`. This means the server-rendered HTML will not include the "Share" button, but the client hydration will try to add it, causing a React hydration mismatch warning and a flash of content.

**Fix:** Move this check into a `useState` + `useEffect` pattern:

```typescript
const [supportsNativeShare, setSupportsNativeShare] = useState(false);

useEffect(() => {
  setSupportsNativeShare(
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}, []);
```

This ensures the initial render matches on both server and client (`false`), then updates on the client after hydration completes. The Share button will appear smoothly after mount rather than causing a mismatch.

---

## Warnings (Should Fix)

### W1. OG image URL does not validate or clamp longitude/latitude values

**File:** `src/app/report/[slug]/page.tsx`, line 101

```typescript
const ogImage = mapboxToken
  ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+2D5A3D(${row.longitude},${row.latitude})/${row.longitude},${row.latitude},13,0/1200x630@2x?access_token=${mapboxToken}`
  : undefined;
```

The `row.longitude` and `row.latitude` values are `doublePrecision` from the DB. While they should be valid coordinates from the Mapbox geocoder, there is no validation that they fall within valid ranges (longitude: -180 to 180, latitude: -90 to 90). A malformed or corrupted DB row could produce an invalid Mapbox URL that returns a 404 or error image, which would be served as the OG image for social previews.

Additionally, JavaScript floating-point numbers can produce very long decimal representations (e.g., `40.712776000000004`). While Mapbox handles this, it creates unnecessarily long URLs. Consider rounding to 6 decimal places (~11cm precision, more than sufficient for a zoom-13 map).

**Fix:** Add bounds validation and precision rounding:

```typescript
const lng = Math.round(row.longitude * 1e6) / 1e6;
const lat = Math.round(row.latitude * 1e6) / 1e6;
const validCoords = lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;

const ogImage = mapboxToken && validCoords
  ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+2D5A3D(${lng},${lat})/${lng},${lat},13,0/1200x630@2x?access_token=${mapboxToken}`
  : undefined;
```

### W2. Deprecated `document.execCommand("copy")` in clipboard fallback

**File:** `src/components/ShareControls.tsx`, lines 143-151

```typescript
const input = document.createElement("input");
input.value = getReportUrl();
document.body.appendChild(input);
input.select();
document.execCommand("copy");
document.body.removeChild(input);
```

`document.execCommand("copy")` is deprecated and has been removed from modern browser standards. While it still works in most browsers today, it could stop working without warning. More importantly, this fallback path has no error handling -- if `execCommand` returns `false` (indicating the copy failed), the user still sees "Copied!" feedback, which is misleading.

**Fix:** Check the return value and only show the "Copied!" feedback on success. Consider using a `<textarea>` instead of `<input>` to handle URLs with special characters more reliably:

```typescript
try {
  const textarea = document.createElement("textarea");
  textarea.value = getReportUrl();
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const success = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (success) {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
} catch {
  // Both methods failed -- silently do nothing
}
```

### W3. OG image dimensions mismatch between actual and declared

**File:** `src/app/report/[slug]/page.tsx`, lines 101 and 116-117

The Mapbox Static Images URL requests `1200x630@2x`, which produces a 2400x1260 pixel image. The `width` and `height` in the metadata are correctly set to `2400` and `1260` to reflect the actual pixel dimensions. However, the standard practice for OG image metadata is to declare the logical dimensions (1200x630) rather than the device pixel dimensions. Social media platforms (Facebook, Twitter, LinkedIn) interpret `og:image:width` and `og:image:height` as CSS pixels, not device pixels. Declaring 2400x1260 may cause some platforms to display the image at unexpected sizes or trigger reprocessing.

**Fix:** Declare the logical dimensions:

```typescript
images: [
  {
    url: ogImage,
    width: 1200,
    height: 630,
    alt: `Map of ${row.address}`,
  },
],
```

### W4. No `aria-label` on share buttons for screen reader accessibility

**File:** `src/components/ShareControls.tsx`, lines 200-244

The share buttons use icon + visible text, which is generally sufficient for accessibility. However, the "Copy link" button swaps its content between "Copy link" and "Copied!" without announcing the state change to screen readers. Additionally, the social share buttons open new windows without indicating this behavior.

**Fix:** Add `aria-label` and live region announcements:

```typescript
<button
  onClick={handleCopyLink}
  aria-label={copied ? "Link copied to clipboard" : "Copy report link to clipboard"}
  // ...
>
```

For social buttons, indicate they open new windows:

```typescript
<button
  onClick={handleTwitterShare}
  aria-label="Share on Twitter (opens in new window)"
  // ...
>
```

---

## Suggestions (Consider)

### S1. Mapbox Static Images URL: consider using the `logo=false` parameter

The default Mapbox Static Images response includes a Mapbox logo watermark in the bottom-left corner. For OG images, this can be visually distracting and is not required under Mapbox's terms of service for static image API usage (attribution is only required in interactive maps). Appending `&logo=false` to the URL would produce a cleaner preview.

### S2. Timer cleanup in `handleCopyLink`

**File:** `src/components/ShareControls.tsx`, lines 141 and 150

The `setTimeout` calls that reset `copied` to `false` after 2000ms are not cleaned up if the component unmounts before the timer fires. This is unlikely to cause a visible bug (React will ignore the `setCopied` call on an unmounted component), but it will produce a React warning in development. Consider storing the timeout ID in a ref and clearing it on unmount:

```typescript
const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();

// In handleCopyLink:
clearTimeout(copyTimerRef.current);
setCopied(true);
copyTimerRef.current = setTimeout(() => setCopied(false), 2000);

// In a useEffect cleanup:
useEffect(() => () => clearTimeout(copyTimerRef.current), []);
```

### S3. Mapbox Static Images API URL format correctness

The URL format is correct for the Mapbox Static Images API v1:
- Style: `mapbox/streets-v12` (valid)
- Overlay: `pin-l+2D5A3D(lng,lat)` (valid -- large pin, hex color without `#`, comma-separated coords)
- Center: `lng,lat,zoom,bearing` (valid -- zoom 13, bearing 0)
- Size: `1200x630@2x` (valid -- within the 1280x1280 limit for non-enterprise accounts, `@2x` for retina)

One consideration: the `@2x` suffix doubles the actual pixel output. At 1200x630, the `@2x` image is 2400x1260 pixels, which is 3.02 megapixels. This is within Mapbox's limits but produces a fairly large image file (typically 500KB-1MB). Social platforms will reprocess it anyway, so using `@1x` (1200x630) would reduce the bandwidth cost of crawlers fetching the image without meaningful quality loss in social previews.

### S4. No tests for ShareControls

There are no tests for the new `ShareControls` component. While the project notes that component rendering tests require a DOM environment (not yet configured), it is worth noting the gap. The share URL construction logic, `getReportUrl`, and the `encodeURIComponent` usage in `handleTwitterShare` / `handleFacebookShare` are testable as pure functions if extracted.

### S5. Consider `x.com` instead of `twitter.com` for Twitter/X share links

**File:** `src/components/ShareControls.tsx`, line 170

The share URL uses `https://twitter.com/intent/tweet`. Twitter has been rebranded to X and while `twitter.com` still redirects, `https://x.com/intent/tweet` is the canonical domain. Both work today, but using the current canonical domain future-proofs the link.

---

## Convention Compliance

| Convention | Status | Notes |
|------------|--------|-------|
| `"use client"` on interactive components | Pass | `ShareControls.tsx` correctly has directive |
| Import `fadeUp` from `@/lib/motion` | Pass | Not redefined locally |
| No external icon libraries | Pass | All SVG icons are inline |
| `@/` path aliases for all `src/` imports | Pass | All imports use `@/` prefix |
| SectionHeader for section headings | Pass | Uses `SectionHeader` component |
| Framer Motion `whileInView` with `viewport={{ once: true }}` | Pass | Matches section pattern exactly |
| Graceful degradation (null guard) | Pass | OG image omitted when token unavailable |
| Server component for page, client islands for interactivity | Pass | `generateMetadata` in server component, `ShareControls` is client island |
| NEXT_PUBLIC_MAPBOX_TOKEN for public-facing URLs | Pass | Correctly uses public token for OG meta tags |
| Section component pattern (section header, typed props, fadeUp) | Pass | Follows established pattern from `DemographicsSection` etc. |
| `generateMetadata` shares `fetchReport()` helper | Pass | Avoids duplicate DB calls via Next.js deduplication |

---

## Patterns to Document

The following new patterns were established in Phase 5 and have already been captured in `CONVENTIONS.md` under the "Page Architecture" and "Client components" sections:

1. **OG image via Mapbox Static Images API** -- uses `NEXT_PUBLIC_MAPBOX_TOKEN` since the URL is publicly visible in meta tags. Gracefully omits the image if the token is unavailable. No `@vercel/og` dependency needed.

2. **Share controls pattern** -- `navigator.share()` when available (mobile), clipboard copy fallback, social share links via `window.open()` with sized popup, inline SVG icons, clipboard feedback via `useState` + `setTimeout`.

These patterns are already documented. No additional convention updates are needed.

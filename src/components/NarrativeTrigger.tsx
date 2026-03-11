"use client";

// ---------------------------------------------------------------------------
// NarrativeTrigger — Fires a request to generate the AI narrative
// ---------------------------------------------------------------------------
// Rendered on the report page when status is "generating". Fires a single
// POST to /api/report/[slug]/narrative on mount. The endpoint runs narrative
// generation synchronously; the connection stays alive because the client
// remains on the page. AutoRefresh handles detecting completion.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";

interface NarrativeTriggerProps {
  slug: string;
}

export function NarrativeTrigger({ slug }: NarrativeTriggerProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    // Guard against React strict mode double-invocation.
    if (firedRef.current) return;
    firedRef.current = true;

    fetch(`/api/report/${encodeURIComponent(slug)}/narrative`, {
      method: "POST",
    }).catch(() => {
      // Errors are handled server-side; AutoRefresh will detect the
      // "failed" status on its next poll.
    });
  }, [slug]);

  return null;
}

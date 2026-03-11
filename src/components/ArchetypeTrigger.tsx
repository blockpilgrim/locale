"use client";

// ---------------------------------------------------------------------------
// ArchetypeTrigger — Fires a request to classify the neighborhood archetype
// ---------------------------------------------------------------------------
// Same pattern as NarrativeTrigger. Rendered on the report page when status
// is "generating". Fires a single POST to /api/report/[slug]/archetype on
// mount. Calls onComplete when the POST resolves (success or failure) so the
// parent can then trigger narrative generation.
//
// Archetype classification is non-fatal — .catch() swallows errors.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";

interface ArchetypeTriggerProps {
  slug: string;
  onComplete?: () => void;
}

export function ArchetypeTrigger({ slug, onComplete }: ArchetypeTriggerProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    // Guard against React strict mode double-invocation.
    if (firedRef.current) return;
    firedRef.current = true;

    fetch(`/api/report/${encodeURIComponent(slug)}/archetype`, {
      method: "POST",
    })
      .then(() => {
        onComplete?.();
      })
      .catch(() => {
        // Archetype is non-fatal; notify parent to proceed regardless.
        onComplete?.();
      });
  }, [slug, onComplete]);

  return null;
}

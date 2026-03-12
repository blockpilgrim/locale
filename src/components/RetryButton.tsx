"use client";

// ---------------------------------------------------------------------------
// RetryButton — Resets a failed report and refreshes the page
// ---------------------------------------------------------------------------
// POSTs to /api/report/[slug]/retry to reset status to "generating", then
// refreshes the page via router.refresh() so the server re-renders with the
// GenerationOrchestrator.
// ---------------------------------------------------------------------------

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface RetryButtonProps {
  slug: string;
}

export function RetryButton({ slug }: RetryButtonProps) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/report/${slug}/retry`, { method: "POST" });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // If retry request itself fails, just reset the button.
      setRetrying(false);
    }
  }, [slug, router]);

  return (
    <button
      onClick={handleRetry}
      disabled={retrying}
      className="inline-block rounded-xl border border-accent/20 bg-white px-8 py-3.5 text-sm font-semibold text-accent shadow-sm transition-all duration-200 hover:bg-accent-subtle/50 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {retrying ? "Retrying..." : "Retry this address"}
    </button>
  );
}

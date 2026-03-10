"use client";

// ---------------------------------------------------------------------------
// AutoRefresh — Refreshes the page on an interval (for "generating" state)
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface AutoRefreshProps {
  /** Interval in milliseconds between refreshes. */
  intervalMs?: number;
}

export function AutoRefresh({ intervalMs = 3000 }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}

"use client";

// ---------------------------------------------------------------------------
// AutoRefresh — Refreshes the page on an interval (for "generating" state)
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface AutoRefreshProps {
  /** Interval in milliseconds between refreshes. */
  intervalMs?: number;
  /** Maximum number of refresh attempts before giving up. Default 60 (~3 min at 3s). */
  maxAttempts?: number;
}

export function AutoRefresh({
  intervalMs = 3000,
  maxAttempts = 60,
}: AutoRefreshProps) {
  const router = useRouter();
  const attemptsRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      attemptsRef.current += 1;
      if (attemptsRef.current >= maxAttempts) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [router, intervalMs, maxAttempts]);

  return null;
}

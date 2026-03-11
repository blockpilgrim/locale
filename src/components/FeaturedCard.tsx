"use client";

// ---------------------------------------------------------------------------
// FeaturedCard — Clickable card that triggers report generation on first visit
// ---------------------------------------------------------------------------
// Instead of linking directly to a slug (which may not exist in the DB yet),
// this component POSTs to /api/report/generate and redirects to the report
// page once a slug is returned. Subsequent clicks are instant cache hits.
// ---------------------------------------------------------------------------

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface FeaturedReport {
  address: string;
  fullAddress: string;
  city: string;
  state: string;
  teaser: string;
  latitude: number;
  longitude: number;
  mapImageUrl?: string;
}

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

export function FeaturedCard({ report }: { report: FeaturedReport }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleClick = useCallback(async () => {
    if (loading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/report/generate", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: report.fullAddress,
          latitude: report.latitude,
          longitude: report.longitude,
          city: report.city,
          state: report.state,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error ?? `Report generation failed (${response.status})`,
        );
      }

      const data = await response.json();
      if (typeof data.slug === "string" && SLUG_PATTERN.test(data.slug)) {
        router.push(`/report/${data.slug}`);
        return;
      }

      throw new Error("Invalid slug returned from server.");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("[FeaturedCard] Generation error:", err);
      setLoading(false);
      setError(
        err instanceof Error ? err.message : "Failed to generate report.",
      );
    }
  }, [loading, report, router]);

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border-light bg-surface p-0 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 text-left w-full disabled:opacity-70 disabled:cursor-wait"
    >
      {/* Top accent gradient — overlays map on hover */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent/0 via-accent/50 to-accent/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-10" />

      {/* Map thumbnail */}
      {report.mapImageUrl && (
        <div className="relative h-32 bg-warm-100 overflow-hidden">
          <img
            src={report.mapImageUrl}
            alt=""
            loading="lazy"
            className="block h-full w-full object-cover saturate-[0.3] transition-[filter] duration-500 group-hover:saturate-[0.7]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-warm-100/20 to-warm-100/50 mix-blend-multiply" />
        </div>
      )}

      <div className="p-6">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-accent">
          {report.city}, {report.state}
        </p>
        <h3 className="mt-2 font-serif text-lg leading-snug text-ink transition-colors group-hover:text-accent">
          {report.address}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          {report.teaser}
        </p>

        {error ? (
          <p className="mt-5 text-sm text-data-4">{error}</p>
        ) : loading ? (
          <p className="mt-5 text-sm font-medium text-accent flex items-center gap-2">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
            </span>
            Generating...
          </p>
        ) : (
          <p className="mt-5 text-sm font-medium text-accent flex items-center gap-1.5 transition-all group-hover:gap-2.5">
            Explore
            <span className="transition-transform duration-300 group-hover:translate-x-0.5">
              &rarr;
            </span>
          </p>
        )}
      </div>
    </button>
  );
}

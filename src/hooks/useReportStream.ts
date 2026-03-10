"use client";

// ---------------------------------------------------------------------------
// useReportStream — Custom hook for report generation with streaming
// ---------------------------------------------------------------------------
// POSTs to /api/report/generate and handles both cached reports and
// streaming responses. Accumulates streamed text for progressive display.
// ---------------------------------------------------------------------------

import { useState, useCallback, useRef } from "react";

interface UseReportStreamInput {
  address: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

interface UseReportStreamResult {
  /** The report slug (available once generation starts or if cached). */
  slug: string | null;
  /** The accumulated narrative text. */
  narrative: string;
  /** Whether a stream is currently in progress. */
  isStreaming: boolean;
  /** Whether the report was served from cache. */
  isCached: boolean;
  /** Error message, if any. */
  error: string | null;
  /** Trigger report generation. */
  generate: (input: UseReportStreamInput) => Promise<void>;
}

export function useReportStream(): UseReportStreamResult {
  const [slug, setSlug] = useState<string | null>(null);
  const [narrative, setNarrative] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (input: UseReportStreamInput) => {
    // Cancel any in-progress request.
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setSlug(null);
    setNarrative("");
    setIsStreaming(true);
    setIsCached(false);
    setError(null);

    try {
      const response = await fetch("/api/report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
          city: input.city ?? undefined,
          state: input.state ?? undefined,
          zip: input.zip ?? undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error ?? `Report generation failed (${response.status})`,
        );
      }

      // Check content type to determine if this is a cached JSON response
      // or a streaming text response.
      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        // Cached report — JSON response with slug.
        const data = await response.json();
        setSlug(data.slug);
        setIsCached(true);
        setIsStreaming(false);
        return;
      }

      // Streaming response — read the slug from headers.
      const reportSlug = response.headers.get("X-Report-Slug");
      if (reportSlug) {
        setSlug(reportSlug);
      }

      // Read the stream.
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body to read.");
      }

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setNarrative(accumulated);
      }

      setIsStreaming(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // Request was cancelled — don't set error state.
        return;
      }
      console.error("[useReportStream] Error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to generate report. Please try again.",
      );
      setIsStreaming(false);
    }
  }, []);

  return {
    slug,
    narrative,
    isStreaming,
    isCached,
    error,
    generate,
  };
}

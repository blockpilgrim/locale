"use client";

// ---------------------------------------------------------------------------
// HomepageClient — Interactive homepage component (AddressInput + generation)
// ---------------------------------------------------------------------------
// Handles address selection, POSTs to /api/report/generate, and redirects to
// the report page on success. This is a client island within the server-
// rendered homepage.
// ---------------------------------------------------------------------------

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AddressInput } from "@/components/AddressInput";
import type { GeocodeSuggestion } from "@/lib/mapbox/geocoding";

type GenerationState = "idle" | "generating" | "error";

/** Validate slug format before using in navigation to prevent path traversal. */
const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

function isValidSlug(slug: unknown): slug is string {
  return typeof slug === "string" && SLUG_PATTERN.test(slug);
}

export function HomepageClient() {
  const router = useRouter();
  const [state, setState] = useState<GenerationState>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Clean up in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleSelect = useCallback(
    async (suggestion: GeocodeSuggestion) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState("generating");
      setError(null);

      try {
        const response = await fetch("/api/report/generate", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: suggestion.fullAddress,
            latitude: suggestion.latitude,
            longitude: suggestion.longitude,
            city: suggestion.city ?? undefined,
            state: suggestion.state ?? undefined,
            zip: suggestion.zip ?? undefined,
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(
            body?.error ?? `Report generation failed (${response.status})`,
          );
        }

        // Both cached (JSON) and streaming responses may return the slug.
        const contentType = response.headers.get("content-type") ?? "";

        if (contentType.includes("application/json")) {
          // Cached or error-with-slug response.
          const data = await response.json();
          if (isValidSlug(data.slug)) {
            router.push(`/report/${data.slug}`);
            return;
          }
          throw new Error("Invalid or missing slug returned from server.");
        }

        // Streaming response -- read slug from header and redirect immediately.
        // The narrative is being generated in the background; the report page
        // will handle the "generating" state.
        const slug = response.headers.get("X-Report-Slug");
        if (isValidSlug(slug)) {
          router.push(`/report/${slug}`);
          return;
        }

        throw new Error("Invalid or missing slug returned from server.");
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("[HomepageClient] Generation error:", err);
        setState("error");
        setError(
          err instanceof Error
            ? err.message
            : "Failed to generate report. Please try again.",
        );
      }
    },
    [router],
  );

  return (
    <div>
      <div className="mt-10 sm:mt-12">
        <AddressInput
          onSelect={handleSelect}
          disabled={state === "generating"}
          placeholder="Try: 350 5th Ave, New York, NY"
        />
      </div>

      {/* Generating state */}
      {state === "generating" && (
        <div
          role="status"
          aria-live="polite"
          className="mt-8 rounded-2xl border border-accent/15 bg-accent-subtle/50 p-6 sm:mt-10 sm:p-8"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              <div className="h-2 w-2 animate-pulse rounded-full bg-accent [animation-delay:150ms]" />
              <div className="h-2 w-2 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
            </div>
            <p className="font-serif text-ink-light">
              Generating your neighborhood report...
            </p>
            <p className="text-xs text-ink-muted">
              Gathering data from Census, OpenStreetMap, and Mapbox
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {state === "error" && error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-8 rounded-2xl border border-data-4/20 bg-data-4/5 p-6 sm:mt-10"
        >
          <p className="text-sm text-data-4">{error}</p>
          <button
            onClick={() => {
              setState("idle");
              setError(null);
            }}
            className="mt-4 text-sm font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent transition-colors"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

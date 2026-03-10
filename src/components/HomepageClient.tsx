"use client";

// ---------------------------------------------------------------------------
// HomepageClient — Interactive homepage component (AddressInput + generation)
// ---------------------------------------------------------------------------
// Handles address selection, POSTs to /api/report/generate, and redirects to
// the report page on success. This is a client island within the server-
// rendered homepage.
// ---------------------------------------------------------------------------

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AddressInput } from "@/components/AddressInput";
import type { GeocodeSuggestion } from "@/lib/mapbox/geocoding";

type GenerationState = "idle" | "generating" | "error";

export function HomepageClient() {
  const router = useRouter();
  const [state, setState] = useState<GenerationState>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSelect = useCallback(
    async (suggestion: GeocodeSuggestion) => {
      setState("generating");
      setError(null);

      try {
        const response = await fetch("/api/report/generate", {
          method: "POST",
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
          if (data.slug) {
            router.push(`/report/${data.slug}`);
            return;
          }
          throw new Error("No slug returned from cached report.");
        }

        // Streaming response -- read slug from header and redirect immediately.
        // The narrative is being generated in the background; the report page
        // will handle the "generating" state.
        const slug = response.headers.get("X-Report-Slug");
        if (slug) {
          router.push(`/report/${slug}`);
          return;
        }

        throw new Error("No slug returned from report generation.");
      } catch (err: unknown) {
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
      <div className="mt-12">
        <AddressInput
          onSelect={handleSelect}
          disabled={state === "generating"}
          placeholder="Try: 350 5th Ave, New York, NY"
        />
      </div>

      {/* Generating state */}
      {state === "generating" && (
        <div className="mt-10 rounded-xl border border-border bg-surface p-8 shadow-sm">
          <div className="flex items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-warm-300 border-t-accent" />
            <p className="font-serif text-ink-light italic">
              Generating your report...
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {state === "error" && error && (
        <div className="mt-10 rounded-xl border border-data-4/30 bg-data-4/5 p-8">
          <p className="text-sm text-data-4">{error}</p>
          <button
            onClick={() => {
              setState("idle");
              setError(null);
            }}
            className="mt-4 text-sm font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

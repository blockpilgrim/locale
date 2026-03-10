"use client";

import { AddressInput } from "@/components/AddressInput";
import { VibeCheck } from "@/components/VibeCheck";
import { useReportStream } from "@/hooks/useReportStream";
import type { GeocodeSuggestion } from "@/lib/mapbox/geocoding";

export default function Home() {
  const { slug, narrative, isStreaming, isCached, error, generate } =
    useReportStream();

  const handleSelect = (suggestion: GeocodeSuggestion) => {
    void generate({
      address: suggestion.fullAddress,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      city: suggestion.city,
      state: suggestion.state,
      zip: suggestion.zip,
    });
  };

  const isGenerating = isStreaming && !narrative;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <main className="w-full max-w-(--container-prose) text-center">
        <p className="mb-4 text-sm font-medium tracking-widest uppercase text-accent">
          Neighborhood Intelligence
        </p>
        <h1 className="mb-6">
          Know the neighborhood
          <br />
          before you move in.
        </h1>
        <p className="text-lg text-ink-muted">
          Enter any US address and get an AI-powered, data-driven portrait of
          what it&apos;s actually like to live there.
        </p>

        <div className="mt-12">
          <AddressInput
            onSelect={handleSelect}
            disabled={isStreaming}
            placeholder="Try: 350 5th Ave, New York, NY"
          />
        </div>

        {/* Generating state */}
        {isGenerating && (
          <div className="mt-10 rounded-xl border border-border bg-surface p-8 shadow-sm">
            <div className="flex items-center justify-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-warm-300 border-t-accent" />
              <p className="font-serif text-ink-light italic">
                Generating your report...
              </p>
            </div>
          </div>
        )}

        {/* Cached report redirect hint */}
        {isCached && slug && (
          <div className="mt-10 rounded-xl border border-accent-subtle bg-accent-subtle/30 p-8 shadow-sm">
            <p className="font-serif text-ink-light">
              Report ready!{" "}
              <a
                href={`/report/${slug}`}
                className="font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
              >
                View the full report
              </a>
            </p>
          </div>
        )}

        {/* Streaming narrative preview */}
        {isStreaming && narrative && (
          <div className="mt-10 text-left">
            <VibeCheck
              narrative=""
              isStreaming={true}
              streamingText={narrative}
            />
            {slug && (
              <p className="mt-4 text-center text-sm text-ink-muted">
                Full report will be available at{" "}
                <a
                  href={`/report/${slug}`}
                  className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
                >
                  /report/{slug}
                </a>
              </p>
            )}
          </div>
        )}

        {/* Completed narrative (non-cached stream finished) */}
        {!isStreaming && narrative && !isCached && (
          <div className="mt-10 text-left">
            <VibeCheck narrative={narrative} isStreaming={false} />
            {slug && (
              <p className="mt-4 text-center text-sm text-ink-muted">
                <a
                  href={`/report/${slug}`}
                  className="font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
                >
                  View the full report
                </a>
              </p>
            )}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="mt-10 rounded-xl border border-data-4/30 bg-data-4/5 p-8">
            <p className="text-sm text-data-4">{error}</p>
          </div>
        )}
      </main>
    </div>
  );
}

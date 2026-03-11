"use client";

import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// VibeCheck — AI narrative display with streaming text
// ---------------------------------------------------------------------------
// The editorial centerpiece of every report. Renders the AI narrative
// with large serif typography, drop cap, and generous whitespace.
// Supports both completed narratives and in-progress streaming text.
// ---------------------------------------------------------------------------

import { motion } from "framer-motion";
import { SectionHeader } from "@/components/SectionHeader";
import { Skeleton } from "@/components/Skeleton";
import { fadeUp } from "@/lib/motion";

/**
 * Render text with **bold** markup as <strong> elements.
 * Only supports double-asterisk bold — no other markdown.
 */
function renderWithBold(text: string): ReactNode {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*(.*)\*\*$/);
    if (bold) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {bold[1]}
        </strong>
      );
    }
    return part;
  });
}

interface VibeCheckProps {
  /** The full narrative text (for completed reports). */
  narrative: string;
  /** Whether a stream is currently in progress. */
  isStreaming: boolean;
  /** The progressively accumulated streaming text. */
  streamingText?: string;
  /** Additional CSS classes. */
  className?: string;
}

export function VibeCheck({
  narrative,
  isStreaming,
  streamingText = "",
  className = "",
}: VibeCheckProps) {
  const displayText = isStreaming ? streamingText : narrative;
  const showSkeleton = isStreaming && !streamingText;

  const paragraphs = displayText
    .split("\n\n")
    .filter((p) => p.trim());

  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6 }}
      className={className}
    >
      <SectionHeader
        label="The Vibe Check"
        title="What It's Like to Live Here"
      />

      {showSkeleton ? (
        <div className="space-y-6">
          <div className="space-y-3">
            <Skeleton width="w-full" height="h-5" />
            <Skeleton width="w-full" height="h-5" />
            <Skeleton width="w-11/12" height="h-5" />
            <Skeleton width="w-3/4" height="h-5" />
          </div>
          <div className="space-y-3">
            <Skeleton width="w-full" height="h-5" />
            <Skeleton width="w-full" height="h-5" />
            <Skeleton width="w-5/6" height="h-5" />
          </div>
          <div className="space-y-3">
            <Skeleton width="w-full" height="h-5" />
            <Skeleton width="w-2/3" height="h-5" />
          </div>
        </div>
      ) : (
        <div className="max-w-(--container-prose)">
          {paragraphs.map((paragraph, i) => (
              <p
                key={i}
                className={`mb-6 font-serif text-lg leading-[1.8] text-ink-light sm:text-xl sm:leading-[1.8] ${
                  i === 0 ? "drop-cap" : ""
                }`}
              >
                {renderWithBold(paragraph.trim())}
              </p>
            ))}

          {/* Streaming cursor */}
          {isStreaming && (
            <span className="inline-block h-5 w-0.5 animate-pulse bg-accent" />
          )}
        </div>
      )}

      {/* Source attribution */}
      {!showSkeleton && displayText && (
        <p className="mt-10 border-t border-border-light pt-4 text-xs text-ink-muted">
          AI-generated narrative based on Census, isochrone, and POI data.
          Powered by Claude.
        </p>
      )}
    </motion.section>
  );
}

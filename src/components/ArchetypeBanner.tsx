"use client";

// ---------------------------------------------------------------------------
// ArchetypeBanner — Displays the neighborhood archetype classification
// ---------------------------------------------------------------------------
// Appears below the report header, above the map. Shows the archetype label,
// tagline, defining traits, and the VibeSpectrum pentagon chart.
//
// Desktop: two-column (left: label+tagline+traits, right: pentagon)
// Mobile: single-column stack
// ---------------------------------------------------------------------------

import { motion } from "framer-motion";
import { VibeSpectrum } from "@/components/VibeSpectrum";
import { fadeUp } from "@/lib/motion";
import type { ArchetypeResult } from "@/lib/report/generate";

interface ArchetypeBannerProps {
  archetype: ArchetypeResult;
  className?: string;
}

export function ArchetypeBanner({
  archetype,
  className = "",
}: ArchetypeBannerProps) {
  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5 }}
      className={`rounded-2xl border border-accent/10 bg-accent-subtle/30 p-6 sm:p-8 ${className}`}
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
        {/* Left: Archetype info */}
        <div className="flex-1 min-w-0">
          {/* Archetype label */}
          <h2 className="font-serif text-2xl sm:text-3xl text-ink leading-tight tracking-tight">
            {archetype.archetype}
          </h2>

          {/* Tagline */}
          <p className="mt-2 text-base italic text-ink-muted leading-relaxed">
            {archetype.tagline}
          </p>

          {/* Defining traits */}
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {archetype.definingTraits.map((trait, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && (
                  <span
                    className="text-ink-muted/40 select-none"
                    aria-hidden="true"
                  >
                    &middot;
                  </span>
                )}
                <span className="text-sm font-medium text-ink-light">
                  {trait}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Right: Pentagon chart — px/py padding gives SVG labels room to render
           outside the viewBox (overflow: visible) without clipping */}
        <div className="flex-shrink-0 self-center sm:self-auto px-8 py-2">
          <VibeSpectrum
            scores={archetype.vibeSpectrum}
            size={200}
            showLabels={true}
            showScores={true}
          />
        </div>
      </div>
    </motion.section>
  );
}

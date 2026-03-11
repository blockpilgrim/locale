"use client";

// ---------------------------------------------------------------------------
// GettingAroundSection — Walkability (isochrone-based), commute patterns,
// transit references
// ---------------------------------------------------------------------------

import { motion } from "framer-motion";
import type { IsochroneResult } from "@/lib/mapbox/isochrone";
import type { EconomicData } from "@/lib/census";
import type { PoiResult } from "@/lib/poi";
import { SectionHeader } from "@/components/SectionHeader";
import { StatCard } from "@/components/StatCard";
import { fadeUp } from "@/lib/motion";

interface GettingAroundSectionProps {
  isochrone: IsochroneResult | null;
  economic: EconomicData | null;
  poi: PoiResult | null;
  className?: string;
}

/**
 * Estimate walkability based on isochrone area coverage and nearby POI count.
 * Returns a qualitative label and score.
 */
function estimateWalkability(
  isochrone: IsochroneResult | null,
  poi: PoiResult | null,
): { label: string; score: string; description: string } | null {
  if (!isochrone && !poi) return null;

  const poiCount = poi?.totalCount ?? 0;

  // Use number of POI categories with items as a density signal.
  const categoriesWithPoi =
    poi?.byCategory.filter((c) => c.count > 0).length ?? 0;

  if (poiCount >= 40 && categoriesWithPoi >= 6) {
    return {
      label: "Very Walkable",
      score: "A",
      description:
        "Most daily errands can be accomplished on foot. Strong variety of nearby amenities.",
    };
  } else if (poiCount >= 20 && categoriesWithPoi >= 4) {
    return {
      label: "Walkable",
      score: "B",
      description:
        "Many amenities within walking distance, though some errands may require a car.",
    };
  } else if (poiCount >= 8 && categoriesWithPoi >= 2) {
    return {
      label: "Somewhat Walkable",
      score: "C",
      description:
        "Some amenities are within walking distance, but a car is helpful for most errands.",
    };
  } else {
    return {
      label: "Car-Dependent",
      score: "D",
      description:
        "Most errands require a car. Few amenities within walking distance.",
    };
  }
}

export function GettingAroundSection({
  isochrone,
  economic,
  poi,
  className = "",
}: GettingAroundSectionProps) {
  // Need at least some data to render.
  if (!isochrone && !economic?.commuteMeans && !poi) return null;

  const walkability = estimateWalkability(isochrone, poi);

  // Commute stats.
  const commute = economic?.commuteMeans;
  const totalCommuters = commute
    ? (commute.droveAlone ?? 0) +
      (commute.publicTransit ?? 0) +
      (commute.walked ?? 0) +
      (commute.carpooled ?? 0) +
      (commute.workedFromHome ?? 0) +
      (commute.other ?? 0)
    : 0;

  const walkedPct =
    commute?.walked !== null && totalCommuters > 0
      ? Math.round(((commute?.walked ?? 0) / totalCommuters) * 100)
      : null;
  const transitPct =
    commute?.publicTransit !== null && totalCommuters > 0
      ? Math.round(((commute?.publicTransit ?? 0) / totalCommuters) * 100)
      : null;
  const wfhPct =
    commute?.workedFromHome !== null && totalCommuters > 0
      ? Math.round(((commute?.workedFromHome ?? 0) / totalCommuters) * 100)
      : null;

  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className={className}
    >
      <SectionHeader
        label="Mobility"
        title="Getting Around"
        subtitle="Walkability, transit, and commute patterns"
      />

      {/* Walkability assessment */}
      {walkability && (
        <div className="mb-8 flex items-start gap-4 rounded-lg border border-border-light bg-surface p-4 sm:gap-5 sm:p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-subtle sm:h-14 sm:w-14">
            <span className="text-2xl font-serif font-bold text-accent">
              {walkability.score}
            </span>
          </div>
          <div>
            <p className="font-serif text-lg font-bold text-ink">
              {walkability.label}
            </p>
            <p className="mt-1 text-sm text-ink-muted leading-relaxed">
              {walkability.description}
            </p>
          </div>
        </div>
      )}

      {/* Isochrone reference (map shows the visual; section references it) */}
      {isochrone && (
        <p className="mb-8 text-sm text-ink-muted">
          The map above shows 5, 10, and 15-minute walking coverage areas from this address.
        </p>
      )}

      {/* Commute pattern highlights */}
      {(walkedPct !== null || transitPct !== null || wfhPct !== null) && (
        <div>
          <h4 className="mb-4 font-serif text-lg">Commute Highlights</h4>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {walkedPct !== null && (
              <StatCard label="Walk to work" value={`${walkedPct}%`} />
            )}
            {transitPct !== null && (
              <StatCard label="Public transit" value={`${transitPct}%`} />
            )}
            {wfhPct !== null && (
              <StatCard label="Work from home" value={`${wfhPct}%`} />
            )}
          </div>
        </div>
      )}

      {economic?.medianCommuteMinutes !== null && economic?.medianCommuteMinutes !== undefined && (
        <div className="mt-6">
          <p className="text-sm text-ink-light">
            Average commute time:{" "}
            <span className="font-medium text-ink">
              {economic.medianCommuteMinutes} minutes
            </span>
          </p>
        </div>
      )}

      <p className="mt-8 text-xs text-ink-muted">
        Source: Mapbox Isochrone API, U.S. Census Bureau ACS 5-Year Estimates
      </p>
    </motion.section>
  );
}

"use client";

// ---------------------------------------------------------------------------
// EconomicSection — Median income, employment, commute modes and time
// ---------------------------------------------------------------------------

import { motion } from "framer-motion";
import type { EconomicData, NationalAverages } from "@/lib/census";
import { SectionHeader } from "@/components/SectionHeader";
import { StatCard } from "@/components/StatCard";
import { ComparisonBar } from "@/components/ComparisonBar";
import { fadeUp } from "@/lib/motion";
import { formatCurrency } from "@/lib/format";

interface EconomicSectionProps {
  economic: EconomicData | null;
  nationalAverages: NationalAverages | null;
  className?: string;
}

export function EconomicSection({
  economic,
  nationalAverages,
  className = "",
}: EconomicSectionProps) {
  if (!economic) return null;

  const {
    medianHouseholdIncome,
    employmentStatus,
    commuteMeans,
    medianCommuteMinutes,
  } = economic;

  // Check for meaningful data.
  if (
    medianHouseholdIncome === null &&
    employmentStatus.employed === null &&
    medianCommuteMinutes === null
  ) {
    return null;
  }

  const natAvg = nationalAverages;

  // Unemployment rate.
  const laborForce =
    employmentStatus.employed !== null && employmentStatus.unemployed !== null
      ? employmentStatus.employed + employmentStatus.unemployed
      : null;
  const unemploymentRate =
    laborForce !== null && laborForce > 0 && employmentStatus.unemployed !== null
      ? Number(((employmentStatus.unemployed / laborForce) * 100).toFixed(1))
      : null;

  // Commute mode entries.
  const totalCommuters =
    (commuteMeans.droveAlone ?? 0) +
    (commuteMeans.carpooled ?? 0) +
    (commuteMeans.publicTransit ?? 0) +
    (commuteMeans.walked ?? 0) +
    (commuteMeans.workedFromHome ?? 0) +
    (commuteMeans.other ?? 0);

  const commuteEntries = [
    { label: "Drove alone", value: commuteMeans.droveAlone, color: "bg-data-3" },
    { label: "Public transit", value: commuteMeans.publicTransit, color: "bg-data-2" },
    { label: "Work from home", value: commuteMeans.workedFromHome, color: "bg-data-1" },
    { label: "Walked", value: commuteMeans.walked, color: "bg-data-6" },
    { label: "Carpooled", value: commuteMeans.carpooled, color: "bg-data-5" },
    { label: "Other", value: commuteMeans.other, color: "bg-warm-400" },
  ].filter((e) => e.value !== null && e.value > 0);

  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className={className}
    >
      <SectionHeader
        label="Economy"
        title="Economic Profile"
        subtitle="Income, employment, and how people get around"
      />

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {medianHouseholdIncome !== null && (
          <StatCard
            label="Median Household Income"
            value={formatCurrency(medianHouseholdIncome)}
            comparison={
              natAvg
                ? `vs. ${formatCurrency(natAvg.economic.medianHouseholdIncome)} nationally`
                : undefined
            }
            trend={
              natAvg
                ? medianHouseholdIncome >
                  natAvg.economic.medianHouseholdIncome
                  ? "higher"
                  : "lower"
                : undefined
            }
          />
        )}
        {unemploymentRate !== null && (
          <StatCard
            label="Unemployment Rate"
            value={`${unemploymentRate}%`}
            comparison={
              natAvg
                ? `vs. ${natAvg.economic.unemploymentRate}% nationally`
                : undefined
            }
            trend={
              natAvg
                ? unemploymentRate < natAvg.economic.unemploymentRate
                  ? "higher" // lower unemployment is better, show green
                  : "lower"
                : undefined
            }
          />
        )}
        {medianCommuteMinutes !== null && (
          <StatCard
            label="Avg. Commute"
            value={`${medianCommuteMinutes} min`}
          />
        )}
      </div>

      {/* Income comparison bar */}
      {medianHouseholdIncome !== null && natAvg && (
        <div className="mt-8">
          <ComparisonBar
            label="Median Household Income"
            localValue={medianHouseholdIncome}
            nationalValue={natAvg.economic.medianHouseholdIncome}
            format={formatCurrency}
          />
        </div>
      )}

      {/* Commute modes */}
      {commuteEntries.length > 0 && totalCommuters > 0 && (
        <div className="mt-8">
          <h4 className="mb-4 font-serif text-lg">How People Commute</h4>
          <div className="space-y-2">
            {commuteEntries.map((entry) => {
              const pct = Math.round(
                ((entry.value ?? 0) / totalCommuters) * 100,
              );
              return (
                <div key={entry.label} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-sm text-ink-light">
                    {entry.label}
                  </span>
                  <div className="h-2 flex-1 rounded-full bg-warm-100">
                    <div
                      className={`h-full rounded-full ${entry.color} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm font-medium text-ink">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-8 text-xs text-ink-muted">
        Source: U.S. Census Bureau, ACS 5-Year Estimates
      </p>
    </motion.section>
  );
}

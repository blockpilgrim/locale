"use client";

// ---------------------------------------------------------------------------
// HousingSection — Median home value, rent, owner/renter ratio, housing age
// ---------------------------------------------------------------------------

import { motion } from "framer-motion";
import type { HousingData, NationalAverages } from "@/lib/census";
import { SectionHeader } from "@/components/SectionHeader";
import { StatCard } from "@/components/StatCard";
import { ComparisonBar } from "@/components/ComparisonBar";

interface HousingSectionProps {
  housing: HousingData | null;
  nationalAverages: NationalAverages | null;
  className?: string;
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

function formatCurrency(value: number): string {
  return `$${value.toLocaleString()}`;
}

export function HousingSection({
  housing,
  nationalAverages,
  className = "",
}: HousingSectionProps) {
  if (!housing) return null;

  const {
    medianHomeValue,
    medianRent,
    ownerOccupied,
    renterOccupied,
    totalHousingUnits,
    yearBuilt,
  } = housing;

  // Check if we have any meaningful data.
  if (medianHomeValue === null && medianRent === null && totalHousingUnits === null) {
    return null;
  }

  const natAvg = nationalAverages;
  const totalOccupied =
    ownerOccupied !== null && renterOccupied !== null
      ? ownerOccupied + renterOccupied
      : null;
  const ownerPct =
    ownerOccupied !== null && totalOccupied !== null && totalOccupied > 0
      ? Math.round((ownerOccupied / totalOccupied) * 100)
      : null;
  const renterPct = ownerPct !== null ? 100 - ownerPct : null;

  // Year built breakdown.
  const yearBuiltEntries = [
    { label: "Pre-1950", value: yearBuilt.before1950, color: "bg-data-3" },
    { label: "1950-1979", value: yearBuilt.from1950to1979, color: "bg-data-2" },
    { label: "1980-1999", value: yearBuilt.from1980to1999, color: "bg-data-6" },
    { label: "2000-2009", value: yearBuilt.from2000to2009, color: "bg-data-1" },
    { label: "2010+", value: yearBuilt.from2010orLater, color: "bg-accent" },
  ].filter((e) => e.value !== null && e.value > 0);

  const totalYearBuilt = yearBuiltEntries.reduce(
    (sum, e) => sum + (e.value ?? 0),
    0,
  );

  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className={className}
    >
      <SectionHeader
        label="Housing"
        title="Housing Profile"
        subtitle="What the housing market looks like in this area"
      />

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {medianHomeValue !== null && (
          <StatCard
            label="Median Home Value"
            value={formatCurrency(medianHomeValue)}
            comparison={
              natAvg
                ? `vs. ${formatCurrency(natAvg.housing.medianHomeValue)} nationally`
                : undefined
            }
            trend={
              natAvg
                ? medianHomeValue > natAvg.housing.medianHomeValue
                  ? "higher"
                  : "lower"
                : undefined
            }
          />
        )}
        {medianRent !== null && (
          <StatCard
            label="Median Rent"
            value={`${formatCurrency(medianRent)}/mo`}
            comparison={
              natAvg
                ? `vs. ${formatCurrency(natAvg.housing.medianRent)}/mo nationally`
                : undefined
            }
            trend={
              natAvg
                ? medianRent > natAvg.housing.medianRent
                  ? "higher"
                  : "lower"
                : undefined
            }
          />
        )}
        {totalHousingUnits !== null && (
          <StatCard
            label="Housing Units"
            value={totalHousingUnits.toLocaleString()}
          />
        )}
      </div>

      {/* Owner vs Renter */}
      {ownerPct !== null && renterPct !== null && (
        <div className="mt-8">
          <h4 className="mb-4 font-serif text-lg">Owner vs. Renter</h4>
          <div className="flex h-5 w-full overflow-hidden rounded-full">
            <div
              className="bg-accent transition-all duration-500"
              style={{ width: `${ownerPct}%` }}
              title={`Owner: ${ownerPct}%`}
            />
            <div
              className="bg-data-2 transition-all duration-500"
              style={{ width: `${renterPct}%` }}
              title={`Renter: ${renterPct}%`}
            />
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="flex items-center gap-1.5 text-ink-light">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
              Owner {ownerPct}%
            </span>
            <span className="flex items-center gap-1.5 text-ink-light">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-data-2" />
              Renter {renterPct}%
            </span>
          </div>
          {natAvg && (
            <p className="mt-1 text-xs text-ink-muted">
              National avg owner-occupied: {natAvg.housing.ownerOccupiedPct}%
            </p>
          )}
        </div>
      )}

      {/* Comparison bars */}
      <div className="mt-8 space-y-6">
        {medianHomeValue !== null && natAvg && (
          <ComparisonBar
            label="Median Home Value"
            localValue={medianHomeValue}
            nationalValue={natAvg.housing.medianHomeValue}
            format={formatCurrency}
          />
        )}
        {medianRent !== null && natAvg && (
          <ComparisonBar
            label="Median Rent"
            localValue={medianRent}
            nationalValue={natAvg.housing.medianRent}
            format={formatCurrency}
          />
        )}
      </div>

      {/* Housing age */}
      {yearBuiltEntries.length > 0 && totalYearBuilt > 0 && (
        <div className="mt-8">
          <h4 className="mb-4 font-serif text-lg">Housing Stock Age</h4>
          <div className="space-y-2">
            {yearBuiltEntries.map((entry) => {
              const pct = Math.round(((entry.value ?? 0) / totalYearBuilt) * 100);
              return (
                <div key={entry.label} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm text-ink-light">
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

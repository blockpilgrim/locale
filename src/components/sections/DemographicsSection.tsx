"use client";

// ---------------------------------------------------------------------------
// DemographicsSection — Population, median age, household composition,
// education, race/ethnicity with national average comparisons
// ---------------------------------------------------------------------------

import { motion } from "framer-motion";
import type { DemographicsData, NationalAverages } from "@/lib/census";
import { SectionHeader } from "@/components/SectionHeader";
import { StatCard } from "@/components/StatCard";
import { ComparisonBar } from "@/components/ComparisonBar";
import { fadeUp } from "@/lib/motion";

interface DemographicsSectionProps {
  demographics: DemographicsData | null;
  nationalAverages: NationalAverages | null;
  className?: string;
}

/** Format a count as a percentage of a total. Returns null if data is missing. */
function pctOf(value: number | null, total: number | null): string | null {
  if (value === null || total === null || total === 0) return null;
  return `${Math.round((value / total) * 100)}%`;
}

export function DemographicsSection({
  demographics,
  nationalAverages,
  className = "",
}: DemographicsSectionProps) {
  if (!demographics) return null;

  const { totalPopulation, medianAge, householdTypes, educationalAttainment, raceEthnicity } =
    demographics;

  // Check if we have any meaningful data to show.
  if (totalPopulation === null && medianAge === null) return null;

  const natAvg = nationalAverages;

  // Build race/ethnicity entries for display.
  const totalForRace =
    (raceEthnicity.white ?? 0) +
    (raceEthnicity.blackOrAfricanAmerican ?? 0) +
    (raceEthnicity.asian ?? 0) +
    (raceEthnicity.hispanicOrLatino ?? 0) +
    (raceEthnicity.twoOrMore ?? 0) +
    (raceEthnicity.other ?? 0);

  const raceEntries = [
    { label: "White", value: raceEthnicity.white, color: "bg-data-1" },
    { label: "Black / African American", value: raceEthnicity.blackOrAfricanAmerican, color: "bg-data-2" },
    { label: "Hispanic / Latino", value: raceEthnicity.hispanicOrLatino, color: "bg-data-3" },
    { label: "Asian", value: raceEthnicity.asian, color: "bg-data-5" },
    { label: "Two or more", value: raceEthnicity.twoOrMore, color: "bg-data-6" },
    { label: "Other", value: raceEthnicity.other, color: "bg-warm-400" },
  ].filter((e) => e.value !== null && e.value > 0);

  return (
    <motion.section
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5 }}
      className={`${className}`}
    >
      <SectionHeader
        label="People"
        title="Demographics"
        subtitle="Who lives here and what the community looks like"
      />

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {totalPopulation !== null && (
          <StatCard
            label="Population"
            value={totalPopulation.toLocaleString()}
            comparison="Census tract"
          />
        )}
        {medianAge !== null && (
          <StatCard
            label="Median Age"
            value={String(medianAge)}
            comparison={
              natAvg
                ? `vs. ${natAvg.demographics.medianAge} nationally`
                : undefined
            }
            trend={
              natAvg
                ? medianAge > natAvg.demographics.medianAge
                  ? "higher"
                  : medianAge < natAvg.demographics.medianAge
                    ? "lower"
                    : "neutral"
                : undefined
            }
          />
        )}
        {householdTypes.totalHouseholds !== null && (
          <StatCard
            label="Households"
            value={householdTypes.totalHouseholds.toLocaleString()}
          />
        )}
      </div>

      {/* Household composition */}
      {householdTypes.totalHouseholds !== null &&
        householdTypes.totalHouseholds > 0 && (
          <div className="mt-8">
            <h4 className="mb-4 font-serif text-lg">Household Composition</h4>
            <div className="space-y-3">
              {[
                { label: "Married couples", value: householdTypes.marriedCouple },
                { label: "Single-parent (female)", value: householdTypes.singleFemale },
                { label: "Single-parent (male)", value: householdTypes.singleMale },
                { label: "Non-family", value: householdTypes.nonFamily },
              ]
                .filter((e) => e.value !== null)
                .map((entry) => {
                  const pct = pctOf(entry.value, householdTypes.totalHouseholds);
                  return (
                    <div key={entry.label} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-sm text-ink-light sm:w-40">
                        {entry.label}
                      </span>
                      <div className="h-2 flex-1 rounded-full bg-warm-100">
                        <div
                          className="h-full rounded-full bg-accent-muted transition-all duration-500"
                          style={{
                            width: pct ?? "0%",
                          }}
                        />
                      </div>
                      <span className="w-10 text-right text-sm font-medium text-ink">
                        {pct ?? "--"}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

      {/* Education */}
      {(educationalAttainment.bachelorsOrHigher !== null ||
        educationalAttainment.highSchoolOrHigher !== null) && (
        <div className="mt-8">
          <h4 className="mb-4 font-serif text-lg">Educational Attainment</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {educationalAttainment.highSchoolOrHigher !== null && (
              <div className="rounded-lg border border-border-light bg-surface p-3 sm:p-4">
                <p className="text-xl font-serif text-ink sm:text-2xl">
                  {educationalAttainment.highSchoolOrHigher.toLocaleString()}
                </p>
                <p className="text-xs text-ink-muted mt-1">High school or higher</p>
              </div>
            )}
            {educationalAttainment.bachelorsOrHigher !== null && (
              <div className="rounded-lg border border-border-light bg-surface p-3 sm:p-4">
                <p className="text-xl font-serif text-ink sm:text-2xl">
                  {educationalAttainment.bachelorsOrHigher.toLocaleString()}
                </p>
                <p className="text-xs text-ink-muted mt-1">Bachelor&apos;s or higher</p>
              </div>
            )}
            {educationalAttainment.graduateOrProfessional !== null && (
              <div className="rounded-lg border border-border-light bg-surface p-3 sm:p-4">
                <p className="text-xl font-serif text-ink sm:text-2xl">
                  {educationalAttainment.graduateOrProfessional.toLocaleString()}
                </p>
                <p className="text-xs text-ink-muted mt-1">Graduate / professional</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Race / ethnicity */}
      {raceEntries.length > 0 && totalForRace > 0 && (
        <div className="mt-8">
          <h4 className="mb-4 font-serif text-lg">Race & Ethnicity</h4>
          {/* Stacked bar */}
          <div
            className="flex h-4 w-full overflow-hidden rounded-full"
            role="img"
            aria-label={`Race and ethnicity breakdown: ${raceEntries.map((e) => `${e.label} ${Math.round((e.value! / totalForRace) * 100)}%`).join(", ")}`}
          >
            {raceEntries.map((entry) => (
              <div
                key={entry.label}
                className={`${entry.color} transition-all duration-500`}
                style={{
                  width: `${((entry.value! / totalForRace) * 100).toFixed(1)}%`,
                }}
                title={`${entry.label}: ${Math.round((entry.value! / totalForRace) * 100)}%`}
              />
            ))}
          </div>
          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {raceEntries.map((entry) => (
              <div key={entry.label} className="flex items-center gap-1.5 text-xs text-ink-muted">
                <div className={`h-2.5 w-2.5 rounded-full ${entry.color}`} />
                <span>
                  {entry.label} {Math.round((entry.value! / totalForRace) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Median age comparison bar */}
      {medianAge !== null && natAvg && (
        <div className="mt-8">
          <ComparisonBar
            label="Median Age"
            localValue={medianAge}
            nationalValue={natAvg.demographics.medianAge}
            maxValue={80}
          />
        </div>
      )}

      {/* Source attribution */}
      <p className="mt-8 text-xs text-ink-muted">
        Source: U.S. Census Bureau, ACS 5-Year Estimates
      </p>
    </motion.section>
  );
}

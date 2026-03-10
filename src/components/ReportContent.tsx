"use client";

// ---------------------------------------------------------------------------
// ReportContent — Client component for rendering a full report
// ---------------------------------------------------------------------------
// Composes the Map, all 5 data sections, VibeCheck narrative, and a CTA.
// Receives pre-fetched data from the server component and renders everything
// on the client (required for Mapbox GL JS + Framer Motion).
// ---------------------------------------------------------------------------

import Link from "next/link";
import { motion } from "framer-motion";
import { Map } from "@/components/Map";
import { VibeCheck } from "@/components/VibeCheck";
import { ShareControls } from "@/components/ShareControls";
import { DemographicsSection } from "@/components/sections/DemographicsSection";
import { HousingSection } from "@/components/sections/HousingSection";
import { EconomicSection } from "@/components/sections/EconomicSection";
import { GettingAroundSection } from "@/components/sections/GettingAroundSection";
import { WhatsNearbySection } from "@/components/sections/WhatsNearbySection";
import { Container } from "@/components/Container";
import { fadeUp } from "@/lib/motion";
import type { ReportData } from "@/lib/report/generate";

interface ReportContentProps {
  /** The structured report data (JSONB from DB). */
  data: ReportData;
  /** The AI narrative text. */
  narrative: string | null;
  /** The report's URL slug. */
  slug: string;
  /** The resolved location info. */
  location: {
    address: string;
    city: string | null;
    state: string | null;
  };
}

export function ReportContent({
  data,
  narrative,
  slug,
  location,
}: ReportContentProps) {
  const cityState = [location.city, location.state]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-screen pb-20">
      {/* Report header */}
      <header className="border-b border-border-light bg-surface px-6 pb-10 pt-12 sm:pt-16">
        <Container variant="content">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.5 }}
          >
            <Link
              href="/"
              className="mb-8 inline-block text-sm font-medium text-accent hover:underline decoration-accent/30 underline-offset-2"
            >
              &larr; Back to Locale
            </Link>
            <p className="mb-2 text-sm font-medium tracking-widest uppercase text-accent">
              Neighborhood Report
            </p>
            <h1>{location.address}</h1>
            {cityState && (
              <p className="mt-2 text-lg text-ink-muted">{cityState}</p>
            )}
          </motion.div>
        </Container>
      </header>

      {/* Map */}
      <section className="px-6 pt-12">
        <Container variant="content">
          <Map
            coordinates={data.coordinates}
            isochrone={data.isochrone}
            pois={data.poi}
            className="shadow-sm"
          />
        </Container>
      </section>

      {/* Vibe Check (AI Narrative) */}
      {narrative && (
        <section className="px-6 pt-(--spacing-section)">
          <Container variant="prose">
            <VibeCheck narrative={narrative} isStreaming={false} />
          </Container>
        </section>
      )}

      {/* Data sections */}
      <div className="px-6">
        <Container variant="content">
          <div className="divide-y divide-border-light">
            {/* Demographics */}
            {data.census && (
              <div className="py-(--spacing-section)">
                <DemographicsSection
                  demographics={data.census.demographics}
                  nationalAverages={data.census.nationalAverages}
                />
              </div>
            )}

            {/* Housing */}
            {data.census && (
              <div className="py-(--spacing-section)">
                <HousingSection
                  housing={data.census.housing}
                  nationalAverages={data.census.nationalAverages}
                />
              </div>
            )}

            {/* Economic */}
            {data.census && (
              <div className="py-(--spacing-section)">
                <EconomicSection
                  economic={data.census.economic}
                  nationalAverages={data.census.nationalAverages}
                />
              </div>
            )}

            {/* Getting Around */}
            {(data.isochrone || data.census || data.poi) && (
              <div className="py-(--spacing-section)">
                <GettingAroundSection
                  isochrone={data.isochrone}
                  economic={data.census?.economic ?? null}
                  poi={data.poi}
                />
              </div>
            )}

            {/* What's Nearby */}
            {data.poi && (
              <div className="py-(--spacing-section)">
                <WhatsNearbySection poi={data.poi} />
              </div>
            )}
          </div>
        </Container>
      </div>

      {/* Share controls + Generate your own CTA */}
      <section className="px-6 py-(--spacing-section)">
        <Container variant="prose">
          <ShareControls address={location.address} slug={slug} />
        </Container>
      </section>
    </div>
  );
}

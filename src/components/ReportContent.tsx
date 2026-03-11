"use client";

// ---------------------------------------------------------------------------
// ReportContent — Client component for rendering a full report
// ---------------------------------------------------------------------------
// Composes the Map, all 5 data sections, VibeCheck narrative, and a CTA.
// Receives pre-fetched data from the server component and renders everything
// on the client (required for Mapbox GL JS + Framer Motion).
//
// Each section is wrapped in a SectionErrorBoundary so that one failure
// does not crash the entire page (T6.1). The Map component is lazy-loaded
// via next/dynamic to keep Mapbox GL JS out of the initial bundle (T6.3).
// ---------------------------------------------------------------------------

import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { VibeCheck } from "@/components/VibeCheck";
import { ShareControls } from "@/components/ShareControls";
import { DemographicsSection } from "@/components/sections/DemographicsSection";
import { HousingSection } from "@/components/sections/HousingSection";
import { EconomicSection } from "@/components/sections/EconomicSection";
import { GettingAroundSection } from "@/components/sections/GettingAroundSection";
import { WhatsNearbySection } from "@/components/sections/WhatsNearbySection";
import { Container } from "@/components/Container";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { Skeleton } from "@/components/Skeleton";
import { fadeUp } from "@/lib/motion";
import type { ReportData } from "@/lib/report/generate";

// Lazy-load Map component — Mapbox GL JS requires `window` and is a large
// dependency (~200KB gzipped). Using ssr: false prevents it from being
// included in the server bundle. The loading fallback matches the Map
// component's skeleton pattern.
const Map = dynamic(
  () => import("@/components/Map").then((mod) => mod.Map),
  {
    ssr: false,
    loading: () => (
      <div className="relative overflow-hidden rounded-xl">
        <Skeleton width="w-full" height="h-[300px] sm:h-[400px] md:h-[500px]" className="rounded-xl" />
      </div>
    ),
  },
);

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
      <header className="border-b border-border-light bg-surface pb-10 pt-12 sm:pt-16">
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
      <section className="pt-8 sm:pt-12">
        <Container variant="content">
          <SectionErrorBoundary sectionName="Map">
            <Map
              coordinates={data.coordinates}
              isochrone={data.isochrone}
              pois={data.poi}
              className="shadow-sm"
            />
          </SectionErrorBoundary>
        </Container>
      </section>

      {/* Vibe Check (AI Narrative) */}
      {narrative && (
        <section className="pt-(--spacing-section)">
          <Container variant="prose">
            <SectionErrorBoundary sectionName="Vibe Check">
              <VibeCheck narrative={narrative} isStreaming={false} />
            </SectionErrorBoundary>
          </Container>
        </section>
      )}

      {/* Data sections */}
      <div>
        <Container variant="content">
          <div className="divide-y divide-border-light">
            {/* Demographics */}
            {data.census && (
              <div className="py-(--spacing-section)">
                <SectionErrorBoundary sectionName="Demographics">
                  <DemographicsSection
                    demographics={data.census.demographics}
                    nationalAverages={data.census.nationalAverages}
                  />
                </SectionErrorBoundary>
              </div>
            )}

            {/* Housing */}
            {data.census && (
              <div className="py-(--spacing-section)">
                <SectionErrorBoundary sectionName="Housing">
                  <HousingSection
                    housing={data.census.housing}
                    nationalAverages={data.census.nationalAverages}
                  />
                </SectionErrorBoundary>
              </div>
            )}

            {/* Economic */}
            {data.census && (
              <div className="py-(--spacing-section)">
                <SectionErrorBoundary sectionName="Economic Profile">
                  <EconomicSection
                    economic={data.census.economic}
                    nationalAverages={data.census.nationalAverages}
                  />
                </SectionErrorBoundary>
              </div>
            )}

            {/* Getting Around */}
            {(data.isochrone || data.census || data.poi) && (
              <div className="py-(--spacing-section)">
                <SectionErrorBoundary sectionName="Getting Around">
                  <GettingAroundSection
                    isochrone={data.isochrone}
                    economic={data.census?.economic ?? null}
                    poi={data.poi}
                  />
                </SectionErrorBoundary>
              </div>
            )}

            {/* What's Nearby */}
            {data.poi && (
              <div className="py-(--spacing-section)">
                <SectionErrorBoundary sectionName="What's Nearby">
                  <WhatsNearbySection poi={data.poi} />
                </SectionErrorBoundary>
              </div>
            )}
          </div>
        </Container>
      </div>

      {/* Share controls + Generate your own CTA */}
      <section className="py-(--spacing-section)">
        <Container variant="prose">
          <SectionErrorBoundary sectionName="Share Controls">
            <ShareControls address={location.address} slug={slug} />
          </SectionErrorBoundary>
        </Container>
      </section>
    </div>
  );
}

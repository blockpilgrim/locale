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
import { ArchetypeBanner } from "@/components/ArchetypeBanner";
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
      <div className="relative overflow-hidden rounded-2xl">
        <Skeleton width="w-full" height="h-[300px] sm:h-[400px] md:h-[500px]" className="rounded-2xl" />
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
      {/* Report header — editorial masthead with gradient background */}
      <header className="relative overflow-hidden pb-12 pt-12 sm:pb-16 sm:pt-16">
        {/* Subtle gradient backdrop */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, #F5F0E8 0%, #FAF7F2 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 30% 60%, rgba(45,90,61,0.04) 0%, transparent 70%)",
          }}
        />

        <Container variant="content" className="relative z-10">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.5 }}
          >
            <Link
              href="/"
              className="mb-10 inline-flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-accent transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Try another address
            </Link>

            <div className="flex items-center gap-3 mb-3">
              <div className="h-px w-8 bg-accent/40" />
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-accent">
                Neighborhood Report
              </p>
            </div>
            <h1 className="max-w-2xl">{location.address}</h1>
            {cityState && (
              <p className="mt-3 text-lg text-ink-muted font-light">{cityState}</p>
            )}
          </motion.div>
        </Container>

        {/* Bottom border with accent gradient */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </header>

      {/* Archetype banner — below header, above map */}
      {data.archetype && (
        <section className="pt-10 sm:pt-14">
          <Container variant="content">
            <SectionErrorBoundary sectionName="Archetype">
              <ArchetypeBanner archetype={data.archetype} />
            </SectionErrorBoundary>
          </Container>
        </section>
      )}

      {/* Map */}
      <section className="pt-10 sm:pt-14">
        <Container variant="content">
          <SectionErrorBoundary sectionName="Map">
            <Map
              coordinates={data.coordinates}
              isochrone={data.isochrone}
              pois={data.poi}
              className="shadow-md rounded-2xl"
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

      {/* Data sections — separated by generous spacing instead of dividers */}
      <Container variant="content">
        {/* Demographics */}
        {data.census && (
          <div className="pt-(--spacing-section)">
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
          <div className="pt-(--spacing-section)">
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
          <div className="pt-(--spacing-section)">
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
          <div className="pt-(--spacing-section)">
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
          <div className="pt-(--spacing-section)">
            <SectionErrorBoundary sectionName="What's Nearby">
              <WhatsNearbySection poi={data.poi} />
            </SectionErrorBoundary>
          </div>
        )}
      </Container>

      {/* Share controls + Generate your own CTA */}
      <section className="pt-(--spacing-section)">
        <Container variant="prose">
          <SectionErrorBoundary sectionName="Share Controls">
            <ShareControls address={location.address} slug={slug} hasArchetype={!!data.archetype} />
          </SectionErrorBoundary>
        </Container>
      </section>
    </div>
  );
}

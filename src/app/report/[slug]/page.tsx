// ---------------------------------------------------------------------------
// Report Page — Server component with dynamic metadata and DB query
// ---------------------------------------------------------------------------
// Fetches the report directly from DB (not through the API route). Handles
// three report statuses: "complete", "generating", and "failed". Returns
// notFound() for unknown slugs.
// ---------------------------------------------------------------------------

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { locations, reports } from "@/lib/db/schema";
import { ReportContent } from "@/components/ReportContent";
import { GenerationOrchestrator } from "@/components/GenerationOrchestrator";
import { GeneratingReport } from "@/components/GeneratingReport";
import { Container } from "@/components/Container";
import type { ReportData } from "@/lib/report/generate";

// Prevent Next.js from caching this page — report status changes dynamically.
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportPageProps {
  params: Promise<{ slug: string }>;
}

// ---------------------------------------------------------------------------
// Data fetching (shared by generateMetadata and the page component)
// ---------------------------------------------------------------------------

async function fetchReport(slug: string) {
  if (!slug || slug.length > 80) return null;

  try {
    const db = getDb();

    const results = await db
      .select({
        reportId: reports.id,
        slug: reports.slug,
        status: reports.status,
        data: reports.data,
        narrative: reports.narrative,
        locationId: locations.id,
        address: locations.address,
        latitude: locations.latitude,
        longitude: locations.longitude,
        city: locations.city,
        state: locations.state,
        zip: locations.zip,
      })
      .from(reports)
      .innerJoin(locations, eq(reports.locationId, locations.id))
      .where(eq(reports.slug, slug))
      .limit(1);

    if (results.length === 0) return null;

    return results[0];
  } catch (error) {
    console.error("[report/page] Failed to fetch report:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Dynamic metadata for SEO / Open Graph
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: ReportPageProps): Promise<Metadata> {
  const { slug } = await params;
  const row = await fetchReport(slug);

  if (!row) {
    return {
      title: "Report Not Found | Locale",
    };
  }

  const cityState = [row.city, row.state].filter(Boolean).join(", ");
  const title = cityState
    ? `${row.address} - ${cityState} | Locale`
    : `${row.address} | Locale`;

  // Use first ~150 chars of narrative for the description.
  const description = row.narrative
    ? row.narrative.slice(0, 155).replace(/\n/g, " ").trim() +
      (row.narrative.length > 155 ? "..." : "")
    : `Neighborhood intelligence report for ${row.address}. Demographics, housing, walkability, and what it's actually like to live here.`;

  // OG image: prefer archetype card route when available, fall back to
  // Mapbox Static Images for reports without archetype data.
  const reportData = row.data as ReportData | null;
  const hasArchetype = reportData?.archetype != null;

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  let ogImage: string | undefined;
  let ogAlt: string;

  if (hasArchetype && baseUrl) {
    // Archetype card — absolute URL for external crawlers
    ogImage = `${baseUrl}/api/report/${slug}/card?format=og`;
    ogAlt = `${reportData!.archetype!.archetype} — neighborhood archetype for ${row.address}`;
  } else {
    // Fallback: Mapbox Static Images
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const lng = Math.round(row.longitude * 1e6) / 1e6;
    const lat = Math.round(row.latitude * 1e6) / 1e6;
    const validCoords = lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
    ogImage =
      mapboxToken && validCoords
        ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+2D5A3D(${lng},${lat})/${lng},${lat},13,0/1200x630@2x?access_token=${mapboxToken}`
        : undefined;
    ogAlt = `Map of ${row.address}`;
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      siteName: "Locale",
      ...(ogImage && {
        images: [
          {
            url: ogImage,
            width: 1200,
            height: 630,
            alt: ogAlt,
          },
        ],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage && {
        images: [ogImage],
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function ReportPage({ params }: ReportPageProps) {
  const { slug } = await params;
  const row = await fetchReport(slug);

  if (!row) {
    notFound();
  }

  // --- Status: "generating" — report is still being built -----------------
  if (row.status === "generating") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <GeneratingReport />
        {/* Orchestrate archetype → narrative generation sequence. */}
        <GenerationOrchestrator slug={row.slug} />
      </div>
    );
  }

  // --- Status: "failed" — report generation failed ------------------------
  if (row.status === "failed") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <Container variant="prose">
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-data-4/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-data-4">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h1 className="mb-4">Report generation failed</h1>
            <p className="text-base text-ink-muted sm:text-lg leading-relaxed">
              We weren&apos;t able to generate a report for this address. This
              can happen when our data sources are temporarily unavailable.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <Link
                href="/"
                className="inline-block rounded-xl bg-accent px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-accent-light hover:shadow-md"
              >
                Try another address
              </Link>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  // --- Status: "complete" — render the full report ------------------------
  if (!row.data) {
    notFound();
  }
  const reportData = row.data as ReportData;

  return (
    <ReportContent
      data={reportData}
      narrative={row.narrative}
      slug={row.slug}
      location={{
        address: row.address,
        city: row.city,
        state: row.state,
      }}
    />
  );
}

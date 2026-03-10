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
import { AutoRefresh } from "@/components/AutoRefresh";
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

  // Build a Mapbox Static Images URL for the OG image.
  // Uses the public token since OG image URLs are visible in HTML meta tags.
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const ogImage = mapboxToken
    ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+2D5A3D(${row.longitude},${row.latitude})/${row.longitude},${row.latitude},13,0/1200x630@2x?access_token=${mapboxToken}`
    : undefined;

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
            width: 2400,
            height: 1260,
            alt: `Map of ${row.address}`,
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
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <Container variant="prose">
          <div className="text-center">
            <div className="mx-auto mb-6 h-8 w-8 animate-spin rounded-full border-2 border-warm-300 border-t-accent" />
            <h1 className="mb-4">Generating your report</h1>
            <p className="text-lg text-ink-muted">
              We&apos;re gathering data and writing your neighborhood
              intelligence report. This usually takes a few seconds.
            </p>
            <p className="mt-8 text-sm text-ink-muted">
              This page will refresh automatically.
            </p>
          </div>
        </Container>
        {/* Client component that polls for completion via router.refresh(). */}
        <AutoRefresh intervalMs={3000} />
      </div>
    );
  }

  // --- Status: "failed" — report generation failed ------------------------
  if (row.status === "failed") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <Container variant="prose">
          <div className="text-center">
            <h1 className="mb-4">Report generation failed</h1>
            <p className="text-lg text-ink-muted">
              We weren&apos;t able to generate a report for this address. This
              can happen when our data sources are temporarily unavailable.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <Link
                href="/"
                className="inline-block rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-light"
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

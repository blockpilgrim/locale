// ---------------------------------------------------------------------------
// GET /api/report/[slug]
// ---------------------------------------------------------------------------
// Fetches a saved report by slug from the database. Returns the full report
// data including location info, structured data, narrative, and status.
// Returns 404 if the slug is not found.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { locations, reports } from "@/lib/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;

  // --- Input validation ---
  if (!slug || slug.length > 80) {
    return NextResponse.json(
      { error: "Invalid slug." },
      { status: 400 },
    );
  }

  try {
    const db = getDb();

    // Join reports with locations to get full data in one query.
    const results = await db
      .select({
        reportId: reports.id,
        slug: reports.slug,
        status: reports.status,
        data: reports.data,
        narrative: reports.narrative,
        reportCreatedAt: reports.createdAt,
        reportUpdatedAt: reports.updatedAt,
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

    if (results.length === 0) {
      return NextResponse.json(
        { error: "Report not found." },
        { status: 404 },
      );
    }

    const row = results[0];

    // Completed reports are immutable — cache aggressively at the edge.
    // "generating" and "failed" reports get no-cache to allow status polling.
    const cacheControl =
      row.status === "complete"
        ? "public, s-maxage=3600, stale-while-revalidate=86400"
        : "no-cache, no-store";

    return NextResponse.json(
      {
        report: {
          id: row.reportId,
          slug: row.slug,
          status: row.status,
          data: row.data,
          narrative: row.narrative,
          createdAt: row.reportCreatedAt,
          updatedAt: row.reportUpdatedAt,
        },
        location: {
          id: row.locationId,
          address: row.address,
          latitude: row.latitude,
          longitude: row.longitude,
          city: row.city,
          state: row.state,
          zip: row.zip,
        },
      },
      {
        headers: {
          "Cache-Control": cacheControl,
        },
      },
    );
  } catch (error) {
    console.error("[report/slug] Failed to fetch report:", error);
    return NextResponse.json(
      { error: "Failed to fetch report." },
      { status: 500 },
    );
  }
}

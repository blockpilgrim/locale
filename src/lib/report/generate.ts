// ---------------------------------------------------------------------------
// Report Orchestrator + Slug Generation (T2.1)
// ---------------------------------------------------------------------------
// Takes geocoded coordinates + address info, fires parallel API calls for
// Census, isochrone, and POI data, generates a URL slug, persists location +
// report rows, and returns structured data.
//
// Partial failure handling (BUILD-STRATEGY Decision 4):
//   - Minimum viable report = at least one data section succeeds
//   - If ALL data sources fail, report status is set to "failed"
//   - Individual failures are recorded so the AI narrative knows what's missing
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { locations, reports } from "@/lib/db/schema";
import { fetchCensusData, type CensusResult } from "@/lib/census";
import {
  fetchIsochrone,
  type IsochroneResult,
} from "@/lib/mapbox/isochrone";
import { fetchPoi, type PoiResult } from "@/lib/poi";

// --- Types -------------------------------------------------------------------

/** The structured JSONB payload stored in `reports.data`. */
export interface ReportData {
  /** Address information used to generate the report. */
  address: {
    full: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  /** Coordinates of the location. */
  coordinates: {
    latitude: number;
    longitude: number;
  };
  /** Census demographics, housing, and economic data (null if fetch failed). */
  census: CensusResult | null;
  /** Mapbox walking isochrone polygons (null if fetch failed). */
  isochrone: IsochroneResult | null;
  /** Nearby points of interest from OpenStreetMap (null if fetch failed). */
  poi: PoiResult | null;
  /** Which data sources succeeded. */
  availableSections: {
    census: boolean;
    isochrone: boolean;
    poi: boolean;
  };
  /** Timestamp of when the data was fetched. */
  fetchedAt: string;
}

/** Input to the report orchestrator. */
export interface GenerateReportInput {
  address: string;
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
  zip?: string;
}

/** Result from the report orchestrator. */
export interface GenerateReportResult {
  /** The URL slug for this report. */
  slug: string;
  /** The report's database ID. */
  reportId: number;
  /** The location's database ID. */
  locationId: number;
  /** The structured data payload. */
  data: ReportData;
  /** Whether the report has enough data to generate a narrative. */
  isViable: boolean;
}

// --- Slug generation ---------------------------------------------------------

/**
 * Generate a human-readable URL slug from an address string.
 * Format: `123-main-st-springfield-il` (lowercase, hyphens, max ~60 chars).
 */
export function generateSlug(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // remove non-alphanumeric (except spaces/hyphens)
    .replace(/\s+/g, "-") // spaces to hyphens
    .replace(/-+/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, "") // trim leading/trailing hyphens
    .slice(0, 60);
}

/**
 * Generate a unique slug, appending a random suffix if the base slug already
 * exists in the database.
 */
async function generateUniqueSlug(address: string): Promise<string> {
  const db = getDb();
  const base = generateSlug(address);

  // Check if the base slug is available.
  const existing = await db
    .select({ id: reports.id })
    .from(reports)
    .where(eq(reports.slug, base))
    .limit(1);

  if (existing.length === 0) {
    return base;
  }

  // Append a short random suffix.
  const suffix = Math.random().toString(36).substring(2, 7);
  return `${base.slice(0, 53)}-${suffix}`;
}

// --- Orchestrator ------------------------------------------------------------

/**
 * Main report orchestrator. Fires parallel API calls, persists results to DB,
 * and returns structured data.
 *
 * This function:
 * 1. Creates a location row
 * 2. Generates a unique slug
 * 3. Creates a report row with status "generating"
 * 4. Fetches Census, isochrone, and POI data in parallel
 * 5. Updates the report with the data payload
 * 6. If ALL data sources fail, sets status to "failed"
 */
export async function generateReport(
  input: GenerateReportInput,
): Promise<GenerateReportResult> {
  const db = getDb();

  // Step 1: Insert location row.
  const [location] = await db
    .insert(locations)
    .values({
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      city: input.city ?? null,
      state: input.state ?? null,
      zip: input.zip ?? null,
    })
    .returning();

  // Step 2: Generate unique slug.
  const slug = await generateUniqueSlug(input.address);

  // Step 3: Create report row with "generating" status.
  const [report] = await db
    .insert(reports)
    .values({
      locationId: location.id,
      slug,
      status: "generating",
    })
    .returning();

  // Step 4: Fire parallel API calls.
  // Note parameter order differences:
  //   - Census: (lat, lng)
  //   - Isochrone: (lng, lat) — Mapbox convention
  //   - POI: (lat, lng)
  const [censusResult, isochroneResult, poiResult] = await Promise.all([
    fetchCensusData(input.latitude, input.longitude).catch((err) => {
      console.error("[report] Census fetch failed:", err);
      return null;
    }),
    fetchIsochrone(input.longitude, input.latitude).catch((err) => {
      console.error("[report] Isochrone fetch failed:", err);
      return null;
    }),
    fetchPoi(input.latitude, input.longitude).catch((err) => {
      console.error("[report] POI fetch failed:", err);
      return null;
    }),
  ]);

  // Step 5: Build the report data payload.
  const availableSections = {
    census: censusResult !== null,
    isochrone: isochroneResult !== null,
    poi: poiResult !== null,
  };

  const isViable =
    availableSections.census ||
    availableSections.isochrone ||
    availableSections.poi;

  const data: ReportData = {
    address: {
      full: input.address,
      city: input.city,
      state: input.state,
      zip: input.zip,
    },
    coordinates: {
      latitude: input.latitude,
      longitude: input.longitude,
    },
    census: censusResult,
    isochrone: isochroneResult,
    poi: poiResult,
    availableSections,
    fetchedAt: new Date().toISOString(),
  };

  // Step 6: Update report row with data (and status if all failed).
  const newStatus = isViable ? "generating" : "failed";

  await db
    .update(reports)
    .set({
      data,
      status: newStatus,
    })
    .where(eq(reports.id, report.id));

  return {
    slug,
    reportId: report.id,
    locationId: location.id,
    data,
    isViable,
  };
}

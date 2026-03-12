// ---------------------------------------------------------------------------
// POST /api/report/generate
// ---------------------------------------------------------------------------
// Accepts address + coordinates from the client. Checks DB for an existing
// report (cache hit -> return slug immediately). Otherwise runs the
// orchestrator to fetch data and returns the slug. Narrative generation is
// triggered separately by the report page via POST /api/report/[slug]/narrative.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { count, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { locations, reports } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { generateReport } from "@/lib/report/generate";

// ---------------------------------------------------------------------------
// US geographic bounds
// ---------------------------------------------------------------------------
// Multiple zones to cover all 50 states + inhabited territories.
// Each zone: [minLat, maxLat, minLng, maxLng]
const US_BOUNDS: [number, number, number, number][] = [
  // Contiguous US + Alaska + Hawaii + Puerto Rico + USVI
  [17.5, 72.0, -180.0, -60.0],
  // Guam + Northern Mariana Islands (positive longitude)
  [13.0, 21.5, 144.0, 147.0],
  // American Samoa (southern hemisphere)
  [-15.0, -10.5, -171.5, -168.0],
];

function isWithinUSBounds(lat: number, lng: number): boolean {
  return US_BOUNDS.some(
    ([minLat, maxLat, minLng, maxLng]) =>
      lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng,
  );
}

// ---------------------------------------------------------------------------
// Daily report cap
// ---------------------------------------------------------------------------
// Hard ceiling on new report generations per calendar day (UTC).
// Override with MAX_DAILY_REPORTS env var. 0 = disabled.
const MAX_DAILY_REPORTS = parseInt(process.env.MAX_DAILY_REPORTS ?? "100", 10);

/** Shape of the POST request body. */
interface GenerateRequestBody {
  address: string;
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
  zip?: string;
}

/**
 * Validate the request body. Returns null if valid, or an error message string.
 */
function validateBody(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return "Request body must be a JSON object.";
  }

  const b = body as Record<string, unknown>;

  if (typeof b.address !== "string" || b.address.trim().length === 0) {
    return "address is required and must be a non-empty string.";
  }
  if (b.address.trim().length > 500) {
    return "address must be at most 500 characters.";
  }
  if (typeof b.latitude !== "number" || !Number.isFinite(b.latitude)) {
    return "latitude is required and must be a finite number.";
  }
  if (typeof b.longitude !== "number" || !Number.isFinite(b.longitude)) {
    return "longitude is required and must be a finite number.";
  }
  if (b.latitude < -90 || b.latitude > 90) {
    return "latitude must be between -90 and 90.";
  }
  if (b.longitude < -180 || b.longitude > 180) {
    return "longitude must be between -180 and 180.";
  }
  if (!isWithinUSBounds(b.latitude as number, b.longitude as number)) {
    return "Coordinates must be within the United States or its territories.";
  }

  // Optional fields — validate types and lengths if present.
  if (b.city !== undefined) {
    if (typeof b.city !== "string") return "city must be a string.";
    if (b.city.length > 100) return "city must be at most 100 characters.";
  }
  if (b.state !== undefined) {
    if (typeof b.state !== "string") return "state must be a string.";
    if (b.state.length > 50) return "state must be at most 50 characters.";
  }
  if (b.zip !== undefined) {
    if (typeof b.zip !== "string") return "zip must be a string.";
    if (b.zip.length > 10) return "zip must be at most 10 characters.";
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  // --- Rate limiting ---
  const rl = rateLimit.check(request);
  if (!rl.success) {
    return rateLimit.createLimitResponse(rl);
  }

  // --- Parse & validate body ---
  let body: GenerateRequestBody;
  try {
    body = (await request.json()) as GenerateRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const validationError = validateBody(body);
  if (validationError) {
    return NextResponse.json(
      { error: validationError },
      { status: 400 },
    );
  }

  const address = body.address.trim();

  // --- Check for existing report (cache hit) ---
  // Uses case-insensitive comparison to avoid duplicate reports for the same address.
  try {
    const db = getDb();
    const existingLocations = await db
      .select({ id: locations.id })
      .from(locations)
      .where(sql`lower(${locations.address}) = lower(${address})`)
      .limit(1);

    if (existingLocations.length > 0) {
      const existingReport = await db
        .select({
          id: reports.id,
          slug: reports.slug,
          status: reports.status,
        })
        .from(reports)
        .where(eq(reports.locationId, existingLocations[0].id))
        .limit(1);

      if (existingReport.length > 0) {
        // If previous attempt failed, reset to "generating" so the
        // client-side orchestrator re-triggers the AI calls.
        if (existingReport[0].status === "failed") {
          await db
            .update(reports)
            .set({ status: "generating", narrative: null })
            .where(eq(reports.id, existingReport[0].id));

          return NextResponse.json(
            {
              slug: existingReport[0].slug,
              status: "generating",
              cached: false,
            },
            { headers: rateLimit.headers(rl) },
          );
        }

        return NextResponse.json(
          {
            slug: existingReport[0].slug,
            status: existingReport[0].status,
            cached: true,
          },
          { headers: rateLimit.headers(rl) },
        );
      }
    }
  } catch (error) {
    // DB lookup failure is not fatal — proceed to generate a fresh report.
    console.error("[report/generate] Cache check failed:", error);
  }

  // --- Daily report cap ---
  if (MAX_DAILY_REPORTS > 0) {
    try {
      const db = getDb();
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const [row] = await db
        .select({ total: count() })
        .from(reports)
        .where(gte(reports.createdAt, startOfDay));
      if (row && row.total >= MAX_DAILY_REPORTS) {
        return NextResponse.json(
          { error: "Daily report limit reached. Please try again tomorrow." },
          { status: 429 },
        );
      }
    } catch (error) {
      // Cap check failure is non-fatal — allow the request through rather
      // than blocking legitimate users on a DB hiccup.
      console.error("[report/generate] Daily cap check failed:", error);
    }
  }

  // --- Generate report (data only, no narrative) ---
  try {
    const result = await generateReport({
      address,
      latitude: body.latitude,
      longitude: body.longitude,
      city: body.city,
      state: body.state,
      zip: body.zip,
    });

    // If report is not viable (all data sources failed), return error response.
    if (!result.isViable) {
      return NextResponse.json(
        {
          error: "Unable to generate report. All data sources failed.",
          slug: result.slug,
        },
        { status: 502, headers: rateLimit.headers(rl) },
      );
    }

    return NextResponse.json(
      { slug: result.slug, status: "generating" },
      { headers: rateLimit.headers(rl) },
    );
  } catch (error) {
    console.error("[report/generate] Report generation failed:", error);
    return NextResponse.json(
      { error: "Report generation failed. Please try again." },
      { status: 500 },
    );
  }
}

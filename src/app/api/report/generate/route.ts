// ---------------------------------------------------------------------------
// POST /api/report/generate
// ---------------------------------------------------------------------------
// Accepts address + coordinates from the client. Checks DB for an existing
// report (cache hit -> return slug immediately). Otherwise runs the
// orchestrator, starts narrative streaming, and returns a streaming response.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { locations, reports } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import { generateReport } from "@/lib/report/generate";
import { generateNarrative } from "@/lib/report/narrative";

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

  // Optional fields — validate types if present.
  if (b.city !== undefined && typeof b.city !== "string") {
    return "city must be a string.";
  }
  if (b.state !== undefined && typeof b.state !== "string") {
    return "state must be a string.";
  }
  if (b.zip !== undefined && typeof b.zip !== "string") {
    return "zip must be a string.";
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
          slug: reports.slug,
          status: reports.status,
        })
        .from(reports)
        .where(eq(reports.locationId, existingLocations[0].id))
        .limit(1);

      if (existingReport.length > 0) {
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

  // --- Generate report ---
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

    // --- Start narrative streaming ---
    try {
      const streamResult = await generateNarrative(
        result.reportId,
        result.data,
      );

      // Return the AI stream as the response.
      // The narrative module handles DB persistence on completion in the background.
      return streamResult.toTextStreamResponse({
        headers: {
          ...rateLimit.headers(rl),
          "X-Report-Slug": result.slug,
          "X-Report-Id": String(result.reportId),
        },
      });
    } catch (narrativeError) {
      // Narrative streaming failed — return the data we have with the slug.
      // The report still has data, it just won't have a narrative yet.
      console.error(
        "[report/generate] Narrative generation failed:",
        narrativeError,
      );
      return NextResponse.json(
        {
          slug: result.slug,
          status: "generating",
          data: result.data,
          narrativeError: true,
        },
        { status: 200, headers: rateLimit.headers(rl) },
      );
    }
  } catch (error) {
    console.error("[report/generate] Report generation failed:", error);
    return NextResponse.json(
      { error: "Report generation failed. Please try again." },
      { status: 500 },
    );
  }
}

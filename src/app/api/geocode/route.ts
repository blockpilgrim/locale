import { NextResponse } from "next/server";
import { forwardGeocode } from "@/lib/mapbox/geocoding";
import { createRateLimiter } from "@/lib/rate-limit";

// More generous limit than report generation — autocomplete fires frequently.
const geocodeLimiter = createRateLimiter({ limit: 60, windowMs: 3_600_000 });

/**
 * GET /api/geocode?q=<query>
 *
 * Proxies geocoding requests to Mapbox so the secret access token stays
 * server-side. Returns structured address suggestions with coordinates.
 *
 * Query parameters:
 *   q — Address search string (3–200 characters).
 */
export async function GET(request: Request): Promise<Response> {
  // --- Rate limiting ---------------------------------------------------------
  const rl = geocodeLimiter.check(request);
  if (!rl.success) {
    return geocodeLimiter.createLimitResponse(rl);
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  // --- Input validation ------------------------------------------------------
  if (query.length < 3) {
    return NextResponse.json(
      { error: "Query must be at least 3 characters." },
      { status: 400 },
    );
  }

  if (query.length > 200) {
    return NextResponse.json(
      { error: "Query must be at most 200 characters." },
      { status: 400 },
    );
  }

  // --- Forward to Mapbox geocoding client ------------------------------------
  try {
    const result = await forwardGeocode(query);
    return NextResponse.json(result, { headers: geocodeLimiter.headers(rl) });
  } catch {
    return NextResponse.json(
      { error: "Geocoding service unavailable." },
      { status: 500 },
    );
  }
}

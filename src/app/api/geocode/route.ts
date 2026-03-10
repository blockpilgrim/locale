import { NextResponse } from "next/server";
import { forwardGeocode } from "@/lib/mapbox/geocoding";

/**
 * GET /api/geocode?q=<query>
 *
 * Proxies geocoding requests to Mapbox so the secret access token stays
 * server-side. Returns structured address suggestions with coordinates.
 *
 * Query parameters:
 *   q — Address search string (minimum 3 characters).
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  // --- Input validation ------------------------------------------------------
  if (query.length < 3) {
    return NextResponse.json(
      { error: "Query must be at least 3 characters." },
      { status: 400 },
    );
  }

  // --- Forward to Mapbox geocoding client ------------------------------------
  const result = await forwardGeocode(query);

  return NextResponse.json(result);
}

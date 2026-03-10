// ---------------------------------------------------------------------------
// Mapbox Isochrone Client
// ---------------------------------------------------------------------------
// Fetches walking isochrone polygons (5 / 10 / 15 minutes) for given
// coordinates using the Mapbox Isochrone API.
// ---------------------------------------------------------------------------

// --- Types -------------------------------------------------------------------

/** GeoJSON geometry for a polygon. */
interface PolygonGeometry {
  type: "Polygon";
  coordinates: number[][][];
}

/** Properties attached to each isochrone feature. */
export interface IsochroneProperties {
  /** Contour value in minutes. */
  contour: number;
  /** Hex color string assigned by the API. */
  color: string;
  /** Opacity value assigned by the API. */
  opacity: number;
  /** "contour" literal. */
  metric: string;
}

/** A single isochrone polygon feature. */
export interface IsochroneFeature {
  type: "Feature";
  properties: IsochroneProperties;
  geometry: PolygonGeometry;
}

/** The full response: a GeoJSON FeatureCollection of isochrone polygons. */
export interface IsochroneResult {
  type: "FeatureCollection";
  features: IsochroneFeature[];
}

/** Raw Mapbox isochrone API response shape. */
interface MapboxIsochroneResponse {
  type: string;
  features: Array<{
    type: string;
    properties: Record<string, unknown>;
    geometry: {
      type: string;
      coordinates: number[][][];
    };
  }>;
}

// --- Helpers -----------------------------------------------------------------

function getAccessToken(): string {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "MAPBOX_ACCESS_TOKEN is not set. See .env.example for required environment variables.",
    );
  }
  return token;
}

// --- Public API --------------------------------------------------------------

/**
 * Fetch walking isochrone polygons for a set of time contours.
 *
 * Returns a GeoJSON FeatureCollection with one polygon feature per contour
 * value. Returns `null` (rather than throwing) if the API call fails.
 *
 * @param lng - Longitude of the origin point.
 * @param lat - Latitude of the origin point.
 * @param options - Optional overrides for contour minutes.
 */
export async function fetchIsochrone(
  lng: number,
  lat: number,
  options: { contourMinutes?: number[] } = {},
): Promise<IsochroneResult | null> {
  const token = getAccessToken();
  const contours = options.contourMinutes ?? [5, 10, 15];

  const url = new URL(
    `https://api.mapbox.com/isochrone/v1/mapbox/walking/${lng},${lat}`,
  );
  url.searchParams.set("contours_minutes", contours.join(","));
  url.searchParams.set("polygons", "true");
  url.searchParams.set("access_token", token);

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(
        `[isochrone] Mapbox API error: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data = (await response.json()) as MapboxIsochroneResponse;

    // Normalize into our typed structure.
    const features: IsochroneFeature[] = (data.features ?? []).map(
      (feature) => ({
        type: "Feature" as const,
        properties: {
          contour: Number(feature.properties["contour"]),
          color: String(feature.properties["color"] ?? "#000000"),
          opacity: Number(feature.properties["opacity"] ?? 0.33),
          metric: String(feature.properties["metric"] ?? "contour"),
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: feature.geometry.coordinates,
        },
      }),
    );

    return {
      type: "FeatureCollection",
      features,
    };
  } catch (error) {
    console.error("[isochrone] Failed to fetch from Mapbox:", error);
    return null;
  }
}

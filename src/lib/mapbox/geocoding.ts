// ---------------------------------------------------------------------------
// Mapbox Geocoding v6 Client
// ---------------------------------------------------------------------------
// Wraps the Mapbox Geocoding API v6 (forward geocode) for server-side use.
// Filters to US-only results and returns structured suggestions.
// ---------------------------------------------------------------------------

// --- Types -------------------------------------------------------------------

/** A single geocoding suggestion returned by the API. */
export interface GeocodeSuggestion {
  /** Mapbox feature id. */
  id: string;
  /** Full formatted address string. */
  fullAddress: string;
  /** Short name / place name. */
  name: string;
  /** Longitude. */
  longitude: number;
  /** Latitude. */
  latitude: number;
  /** City / place context, if available. */
  city: string | null;
  /** State / region, if available. */
  state: string | null;
  /** Postal code, if available. */
  zip: string | null;
}

/** The structured response from our geocoding wrapper. */
export interface GeocodeResult {
  suggestions: GeocodeSuggestion[];
}

/** Raw Mapbox v6 feature shape (subset we care about). */
interface MapboxV6Feature {
  id: string;
  type: string;
  properties: {
    mapbox_id: string;
    feature_type: string;
    name: string;
    name_preferred?: string;
    full_address?: string;
    place_formatted?: string;
    context?: {
      place?: { name: string };
      region?: { name: string; region_code: string };
      postcode?: { name: string };
      country?: { name: string; country_code: string };
    };
  };
  geometry: {
    type: string;
    coordinates: [number, number]; // [lng, lat]
  };
}

interface MapboxV6Response {
  type: string;
  features: MapboxV6Feature[];
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

function mapFeatureToSuggestion(feature: MapboxV6Feature): GeocodeSuggestion {
  const { properties, geometry } = feature;
  const ctx = properties.context;

  return {
    id: properties.mapbox_id ?? feature.id,
    fullAddress: properties.full_address ?? properties.name,
    name: properties.name_preferred ?? properties.name,
    longitude: geometry.coordinates[0],
    latitude: geometry.coordinates[1],
    city: ctx?.place?.name ?? null,
    state: ctx?.region?.name ?? null,
    zip: ctx?.postcode?.name ?? null,
  };
}

// --- Public API --------------------------------------------------------------

/**
 * Forward geocode a query string using the Mapbox Geocoding v6 API.
 *
 * Returns structured US-only suggestions with coordinates. Returns an empty
 * suggestions array rather than throwing when the API returns an error or no
 * results.
 *
 * @param query - Address search string (should be at least 3 characters).
 * @param options - Optional overrides (limit).
 */
export async function forwardGeocode(
  query: string,
  options: { limit?: number } = {},
): Promise<GeocodeResult> {
  const token = getAccessToken();
  const limit = options.limit ?? 5;

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", query);
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "us");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("types", "address,place");

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(
        `[geocoding] Mapbox API error: ${response.status} ${response.statusText}`,
      );
      return { suggestions: [] };
    }

    const data = (await response.json()) as MapboxV6Response;

    const suggestions = (data.features ?? []).map(mapFeatureToSuggestion);

    return { suggestions };
  } catch (error) {
    console.error("[geocoding] Failed to fetch from Mapbox:", error);
    return { suggestions: [] };
  }
}

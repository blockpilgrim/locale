// ---------------------------------------------------------------------------
// POI / Amenities Data Client (Overpass API — OpenStreetMap)
// ---------------------------------------------------------------------------
// Fetches nearby points of interest using the Overpass API and categorizes
// them into structured groups. No API key required.
// ---------------------------------------------------------------------------

// --- Types -------------------------------------------------------------------

/** Supported POI categories. */
export type PoiCategory =
  | "dining"
  | "groceries"
  | "parks"
  | "fitness"
  | "nightlife"
  | "healthcare"
  | "shopping"
  | "education";

/** A single point of interest. */
export interface PointOfInterest {
  /** OSM element id. */
  id: number;
  /** Human-readable name (may be empty for unnamed POIs). */
  name: string;
  /** Our high-level category. */
  category: PoiCategory;
  /** OSM amenity/shop/leisure tag value for finer granularity. */
  osmTag: string;
  /** Latitude of the POI. */
  latitude: number;
  /** Longitude of the POI. */
  longitude: number;
  /** Straight-line distance in meters from the queried coordinates. */
  distanceMeters: number;
  /** Approximate walking time in minutes (at ~80m/min or ~5 km/h). */
  walkingMinutes: number;
}

/** Summary of POIs grouped by category. */
export interface PoiCategorySummary {
  category: PoiCategory;
  count: number;
  items: PointOfInterest[];
}

/** Walking time to the nearest essential POIs. */
export interface NearestEssentials {
  grocery: PointOfInterest | null;
  pharmacy: PointOfInterest | null;
  park: PointOfInterest | null;
}

/** Full result from the POI client. */
export interface PoiResult {
  /** All POIs found, sorted by distance. */
  all: PointOfInterest[];
  /** POIs grouped by category with counts. */
  byCategory: PoiCategorySummary[];
  /** Walking time to nearest essential amenities. */
  nearestEssentials: NearestEssentials;
  /** Total count of POIs found. */
  totalCount: number;
}

// --- Category mapping --------------------------------------------------------

/**
 * Maps OSM tag values to our high-level categories.
 * Keys follow the pattern `<osm_key>:<osm_value>`.
 */
const TAG_TO_CATEGORY: Record<string, PoiCategory> = {
  // Dining
  "amenity:restaurant": "dining",
  "amenity:cafe": "dining",
  "amenity:fast_food": "dining",
  "amenity:food_court": "dining",
  "amenity:ice_cream": "dining",
  // Groceries
  "shop:supermarket": "groceries",
  "shop:convenience": "groceries",
  "shop:greengrocer": "groceries",
  "shop:bakery": "groceries",
  "shop:butcher": "groceries",
  "shop:deli": "groceries",
  // Parks
  "leisure:park": "parks",
  "leisure:garden": "parks",
  "leisure:playground": "parks",
  "leisure:dog_park": "parks",
  "leisure:nature_reserve": "parks",
  // Fitness
  "leisure:fitness_centre": "fitness",
  "leisure:sports_centre": "fitness",
  "leisure:swimming_pool": "fitness",
  "amenity:gym": "fitness",
  // Nightlife
  "amenity:bar": "nightlife",
  "amenity:pub": "nightlife",
  "amenity:nightclub": "nightlife",
  "amenity:biergarten": "nightlife",
  // Healthcare
  "amenity:pharmacy": "healthcare",
  "amenity:hospital": "healthcare",
  "amenity:clinic": "healthcare",
  "amenity:doctors": "healthcare",
  "amenity:dentist": "healthcare",
  // Shopping
  "shop:clothes": "shopping",
  "shop:books": "shopping",
  "shop:department_store": "shopping",
  "shop:electronics": "shopping",
  "shop:furniture": "shopping",
  "shop:hardware": "shopping",
  "shop:mall": "shopping",
  "shop:gift": "shopping",
  // Education
  "amenity:school": "education",
  "amenity:university": "education",
  "amenity:college": "education",
  "amenity:library": "education",
  "amenity:kindergarten": "education",
};

// --- Overpass query -----------------------------------------------------------

/**
 * Build an Overpass QL query that fetches amenities, shops, and leisure
 * features within a radius of the given coordinates.
 */
function buildOverpassQuery(
  lat: number,
  lng: number,
  radiusMeters: number,
): string {
  // Collect all unique OSM key-value pairs we care about.
  const amenityValues: string[] = [];
  const shopValues: string[] = [];
  const leisureValues: string[] = [];

  for (const tagKey of Object.keys(TAG_TO_CATEGORY)) {
    const [osmKey, osmValue] = tagKey.split(":");
    if (osmKey === "amenity") amenityValues.push(osmValue);
    else if (osmKey === "shop") shopValues.push(osmValue);
    else if (osmKey === "leisure") leisureValues.push(osmValue);
  }

  const amenityRegex = amenityValues.join("|");
  const shopRegex = shopValues.join("|");
  const leisureRegex = leisureValues.join("|");

  // Use `around:` to search within a radius. Query nodes and ways.
  return `
[out:json][timeout:15];
(
  node["amenity"~"^(${amenityRegex})$"](around:${radiusMeters},${lat},${lng});
  way["amenity"~"^(${amenityRegex})$"](around:${radiusMeters},${lat},${lng});
  node["shop"~"^(${shopRegex})$"](around:${radiusMeters},${lat},${lng});
  way["shop"~"^(${shopRegex})$"](around:${radiusMeters},${lat},${lng});
  node["leisure"~"^(${leisureRegex})$"](around:${radiusMeters},${lat},${lng});
  way["leisure"~"^(${leisureRegex})$"](around:${radiusMeters},${lat},${lng});
);
out center body;
`.trim();
}

// --- Geometry helpers --------------------------------------------------------

/** Average walking speed in meters per minute (~5 km/h). */
const WALKING_SPEED_M_PER_MIN = 80;

/**
 * Haversine distance between two points in meters.
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- Overpass response parsing -----------------------------------------------

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

/**
 * Determine the category for an OSM element based on its tags.
 * Returns null if the element doesn't match any known category.
 */
function categorizeElement(
  tags: Record<string, string>,
): { category: PoiCategory; osmTag: string } | null {
  // Check amenity, shop, leisure keys in order.
  for (const osmKey of ["amenity", "shop", "leisure"] as const) {
    const value = tags[osmKey];
    if (value) {
      const lookupKey = `${osmKey}:${value}`;
      const category = TAG_TO_CATEGORY[lookupKey];
      if (category) {
        return { category, osmTag: value };
      }
    }
  }
  return null;
}

// --- Public API --------------------------------------------------------------

/**
 * Fetch nearby points of interest for the given coordinates.
 *
 * Uses the Overpass API (OpenStreetMap) to find amenities within a ~1km radius,
 * categorizes them, and computes walking distances. Returns `null` if the
 * Overpass API request fails entirely.
 *
 * @param lat - Latitude of the origin point.
 * @param lng - Longitude of the origin point.
 * @param options - Optional overrides for search radius.
 */
export async function fetchPoi(
  lat: number,
  lng: number,
  options: { radiusMeters?: number } = {},
): Promise<PoiResult | null> {
  const radius = options.radiusMeters ?? 1000;
  const query = buildOverpassQuery(lat, lng, radius);

  let elements: OverpassElement[];

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      console.error(
        `[poi] Overpass API error: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data = (await response.json()) as OverpassResponse;
    elements = data.elements ?? [];
  } catch (error) {
    console.error("[poi] Overpass API request failed:", error);
    return null;
  }

  // --- Parse elements into PointOfInterest values ---
  const pois: PointOfInterest[] = [];

  for (const el of elements) {
    if (!el.tags) continue;

    const classified = categorizeElement(el.tags);
    if (!classified) continue;

    // Get coordinates — nodes have lat/lon directly, ways use `center`.
    const elLat = el.lat ?? el.center?.lat;
    const elLng = el.lon ?? el.center?.lon;
    if (elLat === undefined || elLng === undefined) continue;

    const distanceMeters = Math.round(haversineDistance(lat, lng, elLat, elLng));
    const walkingMinutes = Math.ceil(distanceMeters / WALKING_SPEED_M_PER_MIN);

    pois.push({
      id: el.id,
      name: el.tags["name"] ?? "",
      category: classified.category,
      osmTag: classified.osmTag,
      latitude: elLat,
      longitude: elLng,
      distanceMeters,
      walkingMinutes,
    });
  }

  // Sort by distance.
  pois.sort((a, b) => a.distanceMeters - b.distanceMeters);

  // --- Group by category ---
  const categoryMap = new Map<PoiCategory, PointOfInterest[]>();
  const allCategories: PoiCategory[] = [
    "dining",
    "groceries",
    "parks",
    "fitness",
    "nightlife",
    "healthcare",
    "shopping",
    "education",
  ];

  for (const cat of allCategories) {
    categoryMap.set(cat, []);
  }

  for (const poi of pois) {
    categoryMap.get(poi.category)!.push(poi);
  }

  const byCategory: PoiCategorySummary[] = allCategories.map((cat) => ({
    category: cat,
    count: categoryMap.get(cat)!.length,
    items: categoryMap.get(cat)!,
  }));

  // --- Nearest essentials ---
  const nearestGrocery =
    pois.find(
      (p) =>
        p.category === "groceries" &&
        (p.osmTag === "supermarket" || p.osmTag === "convenience"),
    ) ?? null;

  const nearestPharmacy =
    pois.find(
      (p) => p.category === "healthcare" && p.osmTag === "pharmacy",
    ) ?? null;

  const nearestPark =
    pois.find((p) => p.category === "parks") ?? null;

  return {
    all: pois,
    byCategory,
    nearestEssentials: {
      grocery: nearestGrocery,
      pharmacy: nearestPharmacy,
      park: nearestPark,
    },
    totalCount: pois.length,
  };
}

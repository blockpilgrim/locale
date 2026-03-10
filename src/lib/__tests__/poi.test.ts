import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchPoi } from "@/lib/poi/index";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

/** Build a minimal Overpass element. */
function makeElement(overrides: {
  id?: number;
  name?: string;
  tags: Record<string, string>;
  lat?: number;
  lon?: number;
  useCenter?: boolean;
}) {
  const base: Record<string, unknown> = {
    type: "node",
    id: overrides.id ?? Math.floor(Math.random() * 1e9),
    tags: { name: overrides.name ?? "", ...overrides.tags },
  };

  if (overrides.useCenter) {
    base.center = { lat: overrides.lat ?? 40.736, lon: overrides.lon ?? -73.984 };
  } else {
    base.lat = overrides.lat ?? 40.736;
    base.lon = overrides.lon ?? -73.984;
  }

  return base;
}

/**
 * Build a full Overpass response with diverse POI types.
 * Origin: lat=40.735, lng=-73.985 (approx Union Square, NYC)
 */
function makeDiverseOverpassResponse() {
  return {
    elements: [
      // Dining
      makeElement({
        id: 1,
        name: "Joe's Pizza",
        tags: { amenity: "restaurant" },
        lat: 40.7355,
        lon: -73.984,
      }),
      makeElement({
        id: 2,
        name: "Blue Bottle Coffee",
        tags: { amenity: "cafe" },
        lat: 40.736,
        lon: -73.986,
      }),
      // Groceries
      makeElement({
        id: 3,
        name: "Trader Joe's",
        tags: { shop: "supermarket" },
        lat: 40.734,
        lon: -73.983,
      }),
      // Parks
      makeElement({
        id: 4,
        name: "Union Square Park",
        tags: { leisure: "park" },
        lat: 40.7359,
        lon: -73.9911,
      }),
      // Nightlife
      makeElement({
        id: 5,
        name: "The Dead Rabbit",
        tags: { amenity: "bar" },
        lat: 40.737,
        lon: -73.982,
      }),
      // Healthcare (pharmacy specifically)
      makeElement({
        id: 6,
        name: "CVS Pharmacy",
        tags: { amenity: "pharmacy" },
        lat: 40.7345,
        lon: -73.9855,
      }),
      // Shopping
      makeElement({
        id: 7,
        name: "Strand Bookstore",
        tags: { shop: "books" },
        lat: 40.7335,
        lon: -73.986,
      }),
      // Education
      makeElement({
        id: 8,
        name: "NYU Library",
        tags: { amenity: "library" },
        lat: 40.7295,
        lon: -73.9965,
      }),
      // Way element (uses center instead of lat/lon)
      makeElement({
        id: 9,
        name: "Fitness Way",
        tags: { leisure: "fitness_centre" },
        lat: 40.7362,
        lon: -73.984,
        useCenter: true,
      }),
      // Element with unknown tag (should be excluded)
      makeElement({
        id: 10,
        name: "Random Thing",
        tags: { tourism: "attraction" },
        lat: 40.736,
        lon: -73.985,
      }),
      // Element with no tags (should be excluded)
      { type: "node", id: 11, lat: 40.736, lon: -73.985 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchPoi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("categorizes POIs correctly from Overpass response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeDiverseOverpassResponse()), {
        status: 200,
      }),
    );

    const result = await fetchPoi(40.735, -73.985);

    expect(result).not.toBeNull();
    // 9 valid elements (element 10 has unknown tag, element 11 has no tags)
    expect(result!.totalCount).toBe(9);

    // Check category groupings
    const dining = result!.byCategory.find((c) => c.category === "dining");
    expect(dining!.count).toBe(2);

    const groceries = result!.byCategory.find((c) => c.category === "groceries");
    expect(groceries!.count).toBe(1);

    const parks = result!.byCategory.find((c) => c.category === "parks");
    expect(parks!.count).toBe(1);

    const nightlife = result!.byCategory.find((c) => c.category === "nightlife");
    expect(nightlife!.count).toBe(1);

    const fitness = result!.byCategory.find((c) => c.category === "fitness");
    expect(fitness!.count).toBe(1);

    const healthcare = result!.byCategory.find((c) => c.category === "healthcare");
    expect(healthcare!.count).toBe(1);

    const shopping = result!.byCategory.find((c) => c.category === "shopping");
    expect(shopping!.count).toBe(1);

    const education = result!.byCategory.find((c) => c.category === "education");
    expect(education!.count).toBe(1);
  });

  it("sorts POIs by distance from origin", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeDiverseOverpassResponse()), {
        status: 200,
      }),
    );

    const result = await fetchPoi(40.735, -73.985);
    const distances = result!.all.map((p) => p.distanceMeters);

    // Verify sorted ascending
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
  });

  it("computes haversine distance and walking time correctly", async () => {
    // Place a single POI at a known distance from origin
    const overpassResponse = {
      elements: [
        makeElement({
          id: 1,
          name: "Test Cafe",
          tags: { amenity: "cafe" },
          // ~500m north of origin
          lat: 40.7395,
          lon: -73.985,
        }),
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(overpassResponse), { status: 200 }),
    );

    const result = await fetchPoi(40.735, -73.985);
    const poi = result!.all[0];

    // ~500m distance (haversine), allow some tolerance
    expect(poi.distanceMeters).toBeGreaterThan(400);
    expect(poi.distanceMeters).toBeLessThan(600);

    // Walking time at 80m/min: ~500/80 = ~6-7 min
    expect(poi.walkingMinutes).toBeGreaterThanOrEqual(5);
    expect(poi.walkingMinutes).toBeLessThanOrEqual(8);
  });

  it("identifies nearest essentials correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeDiverseOverpassResponse()), {
        status: 200,
      }),
    );

    const result = await fetchPoi(40.735, -73.985);
    const essentials = result!.nearestEssentials;

    expect(essentials.grocery).not.toBeNull();
    expect(essentials.grocery!.name).toBe("Trader Joe's");
    expect(essentials.grocery!.osmTag).toBe("supermarket");

    expect(essentials.pharmacy).not.toBeNull();
    expect(essentials.pharmacy!.name).toBe("CVS Pharmacy");

    expect(essentials.park).not.toBeNull();
    expect(essentials.park!.name).toBe("Union Square Park");
  });

  it("returns all 8 categories even when some are empty", async () => {
    // Only one dining element
    const overpassResponse = {
      elements: [
        makeElement({
          id: 1,
          name: "Solo Cafe",
          tags: { amenity: "cafe" },
          lat: 40.736,
          lon: -73.985,
        }),
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(overpassResponse), { status: 200 }),
    );

    const result = await fetchPoi(40.735, -73.985);
    expect(result!.byCategory).toHaveLength(8);

    const emptyCategories = result!.byCategory.filter((c) => c.count === 0);
    expect(emptyCategories).toHaveLength(7); // all but dining
  });

  it("handles way elements using center coordinates", async () => {
    const overpassResponse = {
      elements: [
        makeElement({
          id: 1,
          name: "Way Gym",
          tags: { leisure: "fitness_centre" },
          lat: 40.736,
          lon: -73.984,
          useCenter: true,
        }),
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(overpassResponse), { status: 200 }),
    );

    const result = await fetchPoi(40.735, -73.985);
    expect(result!.all).toHaveLength(1);
    expect(result!.all[0].category).toBe("fitness");
    expect(result!.all[0].latitude).toBe(40.736);
  });

  it("returns null on Overpass API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Too Many Requests", { status: 429 }),
    );

    const result = await fetchPoi(40.735, -73.985);
    expect(result).toBeNull();
  });

  it("returns null on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    const result = await fetchPoi(40.735, -73.985);
    expect(result).toBeNull();
  });

  it("handles empty Overpass response gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ elements: [] }), { status: 200 }),
    );

    const result = await fetchPoi(40.735, -73.985);
    expect(result).not.toBeNull();
    expect(result!.totalCount).toBe(0);
    expect(result!.all).toEqual([]);
    expect(result!.nearestEssentials.grocery).toBeNull();
    expect(result!.nearestEssentials.pharmacy).toBeNull();
    expect(result!.nearestEssentials.park).toBeNull();
  });
});

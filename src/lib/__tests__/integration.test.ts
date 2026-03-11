// ---------------------------------------------------------------------------
// Integration Tests — Full Report Generation Flow (T7.2)
// ---------------------------------------------------------------------------
// Tests the report orchestrator, prompt construction, and slug generation
// with realistic data shapes and edge cases not covered by unit tests.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Database mocks ----------------------------------------------------------

const mockInsertReturning = vi.fn();
const mockUpdateSet = vi.fn();

// Note: This mock returns the same `mockInsertReturning` for both `insert(locations)`
// and `insert(reports)`. Tests rely on call order (location first, then report) to
// sequence their `mockResolvedValueOnce` calls. If the insert order in `generateReport`
// changes, these tests will need updating.
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        returning: mockInsertReturning,
      }),
    }),
    update: () => ({
      set: () => ({
        where: mockUpdateSet,
      }),
    }),
  }),
}));

vi.mock("@/lib/db/schema", () => ({
  locations: { id: "id", address: "address" },
  reports: { id: "id", slug: "slug", locationId: "location_id" },
}));

// --- API client mocks --------------------------------------------------------

vi.mock("@/lib/census", () => ({
  fetchCensusData: vi.fn(),
}));

vi.mock("@/lib/mapbox/isochrone", () => ({
  fetchIsochrone: vi.fn(),
}));

vi.mock("@/lib/poi", () => ({
  fetchPoi: vi.fn(),
}));

// --- Imports (after mocks) ---------------------------------------------------

import { generateReport, generateSlug } from "@/lib/report/generate";
import type { ReportData } from "@/lib/report/generate";
import { fetchCensusData } from "@/lib/census";
import { fetchIsochrone } from "@/lib/mapbox/isochrone";
import { fetchPoi } from "@/lib/poi";
import { buildUserPrompt, buildSystemPrompt } from "@/lib/report/narrative";
import type { CensusResult } from "@/lib/census/index";
import type { IsochroneResult } from "@/lib/mapbox/isochrone";
import type { PoiResult, PointOfInterest, PoiCategorySummary } from "@/lib/poi/index";

// --- Realistic fixture builders ----------------------------------------------

/** Build a realistic Census result matching the actual API response shape. */
function makeRealisticCensusResult(
  overrides: Partial<{
    totalPopulation: number | null;
    medianAge: number | null;
    medianHomeValue: number | null;
    medianRent: number | null;
    medianHouseholdIncome: number | null;
  }> = {},
): CensusResult {
  return {
    demographics: {
      totalPopulation: overrides.totalPopulation ?? 6200,
      medianAge: overrides.medianAge ?? 34.8,
      householdTypes: {
        totalHouseholds: 2800,
        marriedCouple: 900,
        singleMale: 180,
        singleFemale: 320,
        nonFamily: 1400,
      },
      educationalAttainment: {
        highSchoolOrHigher: 4800,
        bachelorsOrHigher: 2900,
        graduateOrProfessional: 850,
      },
      raceEthnicity: {
        white: 2600,
        blackOrAfricanAmerican: 1200,
        asian: 800,
        hispanicOrLatino: 1100,
        twoOrMore: 300,
        other: 200,
      },
    },
    housing: {
      medianHomeValue: overrides.medianHomeValue ?? 425000,
      medianRent: overrides.medianRent ?? 1750,
      ownerOccupied: 1100,
      renterOccupied: 1700,
      totalHousingUnits: 3000,
      yearBuilt: {
        before1950: 800,
        from1950to1979: 600,
        from1980to1999: 500,
        from2000to2009: 600,
        from2010orLater: 500,
      },
    },
    economic: {
      medianHouseholdIncome: overrides.medianHouseholdIncome ?? 92000,
      employmentStatus: {
        inLaborForce: 4200,
        employed: 3950,
        unemployed: 250,
      },
      commuteMeans: {
        droveAlone: 1200,
        carpooled: 250,
        publicTransit: 1100,
        walked: 400,
        workedFromHome: 700,
        other: 100,
      },
      medianCommuteMinutes: 32,
    },
    nationalAverages: {
      demographics: { medianAge: 38.9, totalPopulation: 331_449_281 },
      housing: {
        medianHomeValue: 281_900,
        medianRent: 1_163,
        ownerOccupiedPct: 64.4,
      },
      economic: { medianHouseholdIncome: 75_149, unemploymentRate: 5.3 },
    },
    fips: { state: "36", county: "047", tract: "012500" },
  };
}

/** Build a realistic isochrone result with proper GeoJSON polygon rings. */
function makeRealisticIsochroneResult(): IsochroneResult {
  // Realistic polygon ring around a point in Brooklyn
  const center = { lng: -73.969, lat: 40.691 };
  function ring(radiusDeg: number): number[][] {
    const points: number[][] = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * 2 * Math.PI;
      points.push([
        center.lng + radiusDeg * Math.cos(angle),
        center.lat + radiusDeg * Math.sin(angle),
      ]);
    }
    // Close the ring
    points.push([...points[0]]);
    return points;
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          contour: 5,
          color: "#6706ce",
          opacity: 0.33,
          metric: "contour",
        },
        geometry: { type: "Polygon", coordinates: [ring(0.005)] },
      },
      {
        type: "Feature",
        properties: {
          contour: 10,
          color: "#04e813",
          opacity: 0.33,
          metric: "contour",
        },
        geometry: { type: "Polygon", coordinates: [ring(0.01)] },
      },
      {
        type: "Feature",
        properties: {
          contour: 15,
          color: "#4286f4",
          opacity: 0.33,
          metric: "contour",
        },
        geometry: { type: "Polygon", coordinates: [ring(0.015)] },
      },
    ],
  };
}

/** Build a realistic POI result with multiple categories. */
function makeRealisticPoiResult(): PoiResult {
  const pois: PointOfInterest[] = [
    {
      id: 100,
      name: "Colonie",
      category: "dining",
      osmTag: "restaurant",
      latitude: 40.6882,
      longitude: -73.9745,
      distanceMeters: 120,
      walkingMinutes: 2,
    },
    {
      id: 101,
      name: "Hungry Ghost Coffee",
      category: "dining",
      osmTag: "cafe",
      latitude: 40.6895,
      longitude: -73.9715,
      distanceMeters: 200,
      walkingMinutes: 3,
    },
    {
      id: 102,
      name: "Fort Greene Park",
      category: "parks",
      osmTag: "park",
      latitude: 40.6893,
      longitude: -73.9725,
      distanceMeters: 180,
      walkingMinutes: 3,
    },
    {
      id: 103,
      name: "Key Foods",
      category: "groceries",
      osmTag: "supermarket",
      latitude: 40.6910,
      longitude: -73.9680,
      distanceMeters: 300,
      walkingMinutes: 4,
    },
    {
      id: 104,
      name: "Rite Aid",
      category: "healthcare",
      osmTag: "pharmacy",
      latitude: 40.6905,
      longitude: -73.9700,
      distanceMeters: 250,
      walkingMinutes: 4,
    },
    {
      id: 105,
      name: "The Emerson Bar",
      category: "nightlife",
      osmTag: "bar",
      latitude: 40.6890,
      longitude: -73.9750,
      distanceMeters: 350,
      walkingMinutes: 5,
    },
    {
      id: 106,
      name: "PS 20",
      category: "education",
      osmTag: "school",
      latitude: 40.6878,
      longitude: -73.9760,
      distanceMeters: 400,
      walkingMinutes: 5,
    },
    {
      id: 107,
      name: "Brooklyn Boulders",
      category: "fitness",
      osmTag: "fitness_centre",
      latitude: 40.6870,
      longitude: -73.9770,
      distanceMeters: 500,
      walkingMinutes: 7,
    },
    {
      id: 108,
      name: "Greenlight Bookstore",
      category: "shopping",
      osmTag: "books",
      latitude: 40.6886,
      longitude: -73.9740,
      distanceMeters: 280,
      walkingMinutes: 4,
    },
  ];

  const allCategories = [
    "dining",
    "groceries",
    "parks",
    "fitness",
    "nightlife",
    "healthcare",
    "shopping",
    "education",
  ] as const;

  const byCategory: PoiCategorySummary[] = allCategories.map((cat) => {
    const items = pois.filter((p) => p.category === cat);
    return { category: cat, count: items.length, items };
  });

  return {
    all: pois,
    byCategory,
    nearestEssentials: {
      grocery: pois.find((p) => p.osmTag === "supermarket") ?? null,
      pharmacy: pois.find((p) => p.osmTag === "pharmacy") ?? null,
      park: pois.find((p) => p.category === "parks") ?? null,
    },
    totalCount: pois.length,
  };
}

/** Build a complete ReportData object for prompt construction tests. */
function makeFullReportData(
  overrides: Partial<ReportData> = {},
): ReportData {
  return {
    address: {
      full: "456 DeKalb Ave, Brooklyn, NY 11205",
      city: "Brooklyn",
      state: "NY",
      zip: "11205",
    },
    coordinates: { latitude: 40.6907, longitude: -73.9689 },
    census: makeRealisticCensusResult(),
    isochrone: makeRealisticIsochroneResult(),
    poi: makeRealisticPoiResult(),
    availableSections: { census: true, isochrone: true, poi: true },
    fetchedAt: "2026-03-11T12:00:00.000Z",
    ...overrides,
  };
}

// --- Test setup helpers ------------------------------------------------------

function setupDefaultDbMocks() {
  mockInsertReturning.mockResolvedValue([{ id: 1 }]);
  mockUpdateSet.mockResolvedValue(undefined);
}

function setupAllApiSuccess() {
  vi.mocked(fetchCensusData).mockResolvedValue(makeRealisticCensusResult());
  vi.mocked(fetchIsochrone).mockResolvedValue(makeRealisticIsochroneResult());
  vi.mocked(fetchPoi).mockResolvedValue(makeRealisticPoiResult());
}

const baseInput = {
  address: "456 DeKalb Ave, Brooklyn, NY 11205",
  latitude: 40.6907,
  longitude: -73.9689,
  city: "Brooklyn",
  state: "NY",
  zip: "11205",
};

// =============================================================================
// Tests
// =============================================================================

describe("Integration: full orchestration with realistic data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultDbMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("produces a complete report with all realistic data sections", async () => {
    setupAllApiSuccess();

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(true);
    expect(result.slug).toBe("456-dekalb-ave-brooklyn-ny-11205");
    expect(result.data.availableSections).toEqual({
      census: true,
      isochrone: true,
      poi: true,
    });

    // Verify the data payload matches realistic shapes
    const census = result.data.census!;
    expect(census.demographics.totalPopulation).toBe(6200);
    expect(census.housing.yearBuilt.before1950).toBe(800);
    expect(census.economic.commuteMeans.publicTransit).toBe(1100);
    expect(census.nationalAverages.housing.medianHomeValue).toBe(281_900);

    const iso = result.data.isochrone!;
    expect(iso.features).toHaveLength(3);
    expect(iso.features[0].properties.contour).toBe(5);
    // Verify the polygon ring is closed (first and last point match)
    const ring = iso.features[0].geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);

    const poi = result.data.poi!;
    expect(poi.totalCount).toBe(9);
    expect(poi.nearestEssentials.grocery).not.toBeNull();
    expect(poi.nearestEssentials.pharmacy).not.toBeNull();
    expect(poi.nearestEssentials.park).not.toBeNull();
    expect(poi.byCategory).toHaveLength(8);
  });

  it("stores coordinates in the data payload with correct precision", async () => {
    setupAllApiSuccess();

    const result = await generateReport(baseInput);

    expect(result.data.coordinates.latitude).toBe(40.6907);
    expect(result.data.coordinates.longitude).toBe(-73.9689);
  });

  it("passes correct coordinate order to each API client", async () => {
    setupAllApiSuccess();

    await generateReport(baseInput);

    // Census: (lat, lng)
    expect(fetchCensusData).toHaveBeenCalledWith(40.6907, -73.9689);
    // Isochrone: (lng, lat) — Mapbox convention
    expect(fetchIsochrone).toHaveBeenCalledWith(-73.9689, 40.6907);
    // POI: (lat, lng)
    expect(fetchPoi).toHaveBeenCalledWith(40.6907, -73.9689);
  });

  it("records fetchedAt as a valid ISO timestamp", async () => {
    setupAllApiSuccess();

    const result = await generateReport(baseInput);

    const parsed = new Date(result.data.fetchedAt);
    expect(parsed.getTime()).not.toBeNaN();
    expect(result.data.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// =============================================================================
// Partial failure matrix
// =============================================================================

describe("Integration: partial failure matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultDbMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Census fails, others succeed -> viable report", async () => {
    vi.mocked(fetchCensusData).mockRejectedValue(new Error("Census timeout"));
    vi.mocked(fetchIsochrone).mockResolvedValue(makeRealisticIsochroneResult());
    vi.mocked(fetchPoi).mockResolvedValue(makeRealisticPoiResult());

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(true);
    expect(result.data.census).toBeNull();
    expect(result.data.isochrone).not.toBeNull();
    expect(result.data.poi).not.toBeNull();
    expect(result.data.availableSections).toEqual({
      census: false,
      isochrone: true,
      poi: true,
    });
  });

  it("POI fails, others succeed -> viable report", async () => {
    vi.mocked(fetchCensusData).mockResolvedValue(makeRealisticCensusResult());
    vi.mocked(fetchIsochrone).mockResolvedValue(makeRealisticIsochroneResult());
    vi.mocked(fetchPoi).mockRejectedValue(new Error("Overpass 429"));

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(true);
    expect(result.data.census).not.toBeNull();
    expect(result.data.isochrone).not.toBeNull();
    expect(result.data.poi).toBeNull();
    expect(result.data.availableSections).toEqual({
      census: true,
      isochrone: true,
      poi: false,
    });
  });

  it("Isochrone fails, others succeed -> viable report", async () => {
    vi.mocked(fetchCensusData).mockResolvedValue(makeRealisticCensusResult());
    vi.mocked(fetchIsochrone).mockRejectedValue(new Error("Mapbox 500"));
    vi.mocked(fetchPoi).mockResolvedValue(makeRealisticPoiResult());

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(true);
    expect(result.data.census).not.toBeNull();
    expect(result.data.isochrone).toBeNull();
    expect(result.data.poi).not.toBeNull();
    expect(result.data.availableSections).toEqual({
      census: true,
      isochrone: false,
      poi: true,
    });
  });

  it("Census + POI fail, isochrone succeeds -> viable report", async () => {
    vi.mocked(fetchCensusData).mockRejectedValue(new Error("Census down"));
    vi.mocked(fetchIsochrone).mockResolvedValue(makeRealisticIsochroneResult());
    vi.mocked(fetchPoi).mockRejectedValue(new Error("Overpass down"));

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(true);
    expect(result.data.census).toBeNull();
    expect(result.data.isochrone).not.toBeNull();
    expect(result.data.poi).toBeNull();
    expect(result.data.availableSections).toEqual({
      census: false,
      isochrone: true,
      poi: false,
    });
  });

  it("Census + isochrone fail, POI succeeds -> viable report", async () => {
    vi.mocked(fetchCensusData).mockRejectedValue(new Error("Census down"));
    vi.mocked(fetchIsochrone).mockRejectedValue(new Error("Mapbox down"));
    vi.mocked(fetchPoi).mockResolvedValue(makeRealisticPoiResult());

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(true);
    expect(result.data.census).toBeNull();
    expect(result.data.isochrone).toBeNull();
    expect(result.data.poi).not.toBeNull();
    expect(result.data.availableSections).toEqual({
      census: false,
      isochrone: false,
      poi: true,
    });
  });

  it("Isochrone + POI fail, Census succeeds -> viable report", async () => {
    vi.mocked(fetchCensusData).mockResolvedValue(makeRealisticCensusResult());
    vi.mocked(fetchIsochrone).mockRejectedValue(new Error("Mapbox down"));
    vi.mocked(fetchPoi).mockRejectedValue(new Error("Overpass down"));

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(true);
    expect(result.data.census).not.toBeNull();
    expect(result.data.isochrone).toBeNull();
    expect(result.data.poi).toBeNull();
    expect(result.data.availableSections).toEqual({
      census: true,
      isochrone: false,
      poi: false,
    });
  });

  it("All three fail -> NOT viable, status set to failed", async () => {
    vi.mocked(fetchCensusData).mockRejectedValue(new Error("Census down"));
    vi.mocked(fetchIsochrone).mockRejectedValue(new Error("Mapbox down"));
    vi.mocked(fetchPoi).mockRejectedValue(new Error("Overpass down"));

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(false);
    expect(result.data.census).toBeNull();
    expect(result.data.isochrone).toBeNull();
    expect(result.data.poi).toBeNull();
    expect(result.data.availableSections).toEqual({
      census: false,
      isochrone: false,
      poi: false,
    });
  });

  it("APIs return null (not throw) -> treated as unavailable", async () => {
    vi.mocked(fetchCensusData).mockResolvedValue(null);
    vi.mocked(fetchIsochrone).mockResolvedValue(null);
    vi.mocked(fetchPoi).mockResolvedValue(makeRealisticPoiResult());

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(true);
    expect(result.data.census).toBeNull();
    expect(result.data.isochrone).toBeNull();
    expect(result.data.poi).not.toBeNull();
  });
});

// =============================================================================
// Timeout behavior
// =============================================================================

describe("Integration: timeout behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultDbMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles AbortError from timed-out Census call gracefully", async () => {
    vi.mocked(fetchCensusData).mockRejectedValue(
      Object.assign(new Error("The operation was aborted"), {
        name: "AbortError",
      }),
    );
    vi.mocked(fetchIsochrone).mockResolvedValue(makeRealisticIsochroneResult());
    vi.mocked(fetchPoi).mockResolvedValue(makeRealisticPoiResult());

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(true);
    expect(result.data.census).toBeNull();
    expect(result.data.isochrone).not.toBeNull();
    expect(result.data.poi).not.toBeNull();
  });

  it("handles concurrent timeouts from multiple APIs", async () => {
    const abortError = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
    vi.mocked(fetchCensusData).mockRejectedValue(abortError);
    vi.mocked(fetchIsochrone).mockRejectedValue(abortError);
    vi.mocked(fetchPoi).mockResolvedValue(makeRealisticPoiResult());

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(true);
    expect(result.data.census).toBeNull();
    expect(result.data.isochrone).toBeNull();
    expect(result.data.poi).not.toBeNull();
  });

  it("handles all APIs timing out -> not viable", async () => {
    const abortError = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
    vi.mocked(fetchCensusData).mockRejectedValue(abortError);
    vi.mocked(fetchIsochrone).mockRejectedValue(abortError);
    vi.mocked(fetchPoi).mockRejectedValue(abortError);

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(false);
  });

  it("handles delayed resolution (slow but not timed out)", async () => {
    vi.mocked(fetchCensusData).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(makeRealisticCensusResult()), 50)),
    );
    vi.mocked(fetchIsochrone).mockResolvedValue(makeRealisticIsochroneResult());
    vi.mocked(fetchPoi).mockResolvedValue(makeRealisticPoiResult());

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(true);
    expect(result.data.census).not.toBeNull();
  });
});

// =============================================================================
// Malformed API responses
// =============================================================================

describe("Integration: malformed API responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultDbMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles Census returning null fields within valid structure", async () => {
    // Build a Census result where key fields are explicitly null
    const censusWithNulls = makeRealisticCensusResult();
    censusWithNulls.demographics.totalPopulation = null;
    censusWithNulls.demographics.medianAge = null;
    censusWithNulls.housing.medianHomeValue = null;
    censusWithNulls.housing.medianRent = null;
    censusWithNulls.economic.medianHouseholdIncome = null;

    vi.mocked(fetchCensusData).mockResolvedValue(censusWithNulls);
    vi.mocked(fetchIsochrone).mockResolvedValue(makeRealisticIsochroneResult());
    vi.mocked(fetchPoi).mockResolvedValue(makeRealisticPoiResult());

    const result = await generateReport(baseInput);

    // Census returned a valid structure (not null), so it counts as available
    expect(result.isViable).toBe(true);
    expect(result.data.availableSections.census).toBe(true);
    expect(result.data.census!.demographics.totalPopulation).toBeNull();
    expect(result.data.census!.housing.medianHomeValue).toBeNull();
  });

  it("handles isochrone with empty features array", async () => {
    vi.mocked(fetchCensusData).mockResolvedValue(makeRealisticCensusResult());
    vi.mocked(fetchIsochrone).mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    });
    vi.mocked(fetchPoi).mockResolvedValue(makeRealisticPoiResult());

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(true);
    expect(result.data.isochrone).not.toBeNull();
    expect(result.data.isochrone!.features).toHaveLength(0);
  });

  it("handles POI with zero results", async () => {
    const emptyPoi: PoiResult = {
      all: [],
      byCategory: [
        { category: "dining", count: 0, items: [] },
        { category: "groceries", count: 0, items: [] },
        { category: "parks", count: 0, items: [] },
        { category: "fitness", count: 0, items: [] },
        { category: "nightlife", count: 0, items: [] },
        { category: "healthcare", count: 0, items: [] },
        { category: "shopping", count: 0, items: [] },
        { category: "education", count: 0, items: [] },
      ],
      nearestEssentials: { grocery: null, pharmacy: null, park: null },
      totalCount: 0,
    };
    vi.mocked(fetchCensusData).mockResolvedValue(makeRealisticCensusResult());
    vi.mocked(fetchIsochrone).mockResolvedValue(makeRealisticIsochroneResult());
    vi.mocked(fetchPoi).mockResolvedValue(emptyPoi);

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(true);
    expect(result.data.poi!.totalCount).toBe(0);
  });

  it("handles Census with extreme values gracefully", async () => {
    const extremeCensus = makeRealisticCensusResult({
      totalPopulation: 0,
      medianAge: 99.9,
      medianHomeValue: 50_000_000,
      medianRent: 0,
      medianHouseholdIncome: 0,
    });
    vi.mocked(fetchCensusData).mockResolvedValue(extremeCensus);
    vi.mocked(fetchIsochrone).mockResolvedValue(null);
    vi.mocked(fetchPoi).mockResolvedValue(null);

    const result = await generateReport(baseInput);

    expect(result.isViable).toBe(true);
    expect(result.data.census!.demographics.totalPopulation).toBe(0);
    expect(result.data.census!.demographics.medianAge).toBe(99.9);
    expect(result.data.census!.housing.medianHomeValue).toBe(50_000_000);
  });
});

// =============================================================================
// Narrative prompt construction with various data combinations
// =============================================================================

describe("Integration: prompt construction with data combinations", () => {
  it("includes all Census sections when full data is present", () => {
    const data = makeFullReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("DEMOGRAPHICS & CENSUS DATA");
    expect(prompt).toContain("HOUSING DATA");
    expect(prompt).toContain("ECONOMIC DATA");
    expect(prompt).toContain("WALKABILITY");
    expect(prompt).toContain("NEARBY AMENITIES");
    expect(prompt).not.toContain("were unavailable");
  });

  it("constructs prompt correctly with only Census data", () => {
    const data = makeFullReportData({
      isochrone: null,
      poi: null,
      availableSections: { census: true, isochrone: false, poi: false },
    });
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("DEMOGRAPHICS & CENSUS DATA");
    expect(prompt).toContain("HOUSING DATA");
    expect(prompt).toContain("ECONOMIC DATA");
    expect(prompt).not.toContain("WALKABILITY");
    expect(prompt).not.toContain("NEARBY AMENITIES");
    expect(prompt).toContain("walkability isochrone");
    expect(prompt).toContain("nearby amenities");
  });

  it("constructs prompt correctly with only isochrone data", () => {
    const data = makeFullReportData({
      census: null,
      poi: null,
      availableSections: { census: false, isochrone: true, poi: false },
    });
    const prompt = buildUserPrompt(data);

    expect(prompt).not.toContain("DEMOGRAPHICS & CENSUS DATA");
    expect(prompt).toContain("WALKABILITY");
    expect(prompt).not.toContain("NEARBY AMENITIES");
    expect(prompt).toContain("demographics/housing/economic");
    expect(prompt).toContain("nearby amenities");
  });

  it("constructs prompt correctly with only POI data", () => {
    const data = makeFullReportData({
      census: null,
      isochrone: null,
      availableSections: { census: false, isochrone: false, poi: true },
    });
    const prompt = buildUserPrompt(data);

    expect(prompt).not.toContain("DEMOGRAPHICS & CENSUS DATA");
    expect(prompt).not.toContain("WALKABILITY");
    expect(prompt).toContain("NEARBY AMENITIES");
    expect(prompt).toContain("demographics/housing/economic");
    expect(prompt).toContain("walkability isochrone");
  });

  it("includes national averages in Census comparison data", () => {
    const data = makeFullReportData();
    const prompt = buildUserPrompt(data);

    // Verify national averages appear as comparison context
    expect(prompt).toContain("national avg: $281,900"); // home value
    expect(prompt).toContain("national avg: $1,163"); // rent
    expect(prompt).toContain("national avg: $75,149"); // income
    expect(prompt).toContain("national avg: 38.9"); // median age
  });

  it("includes walkability area calculations from isochrone polygons", () => {
    const data = makeFullReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("5-minute walking area:");
    expect(prompt).toContain("10-minute walking area:");
    expect(prompt).toContain("15-minute walking area:");
    expect(prompt).toContain("sq km");
  });

  it("includes POI names and walking times in prompt", () => {
    const data = makeFullReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("Colonie");
    expect(prompt).toContain("2 min walk");
    expect(prompt).toContain("Key Foods");
    expect(prompt).toContain("NEAREST ESSENTIALS");
    expect(prompt).toContain("Nearest grocery: Key Foods");
    expect(prompt).toContain("Nearest pharmacy: Rite Aid");
    expect(prompt).toContain("Nearest park: Fort Greene Park");
  });

  it("includes household breakdown in demographics", () => {
    const data = makeFullReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("married couples: 900");
    expect(prompt).toContain("non-family: 1400");
  });

  it("includes race/ethnicity breakdown", () => {
    const data = makeFullReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("White: 2600");
    expect(prompt).toContain("Black/African American: 1200");
    expect(prompt).toContain("Asian: 800");
    expect(prompt).toContain("Hispanic/Latino: 1100");
  });

  it("includes commute mode breakdown", () => {
    const data = makeFullReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("drove alone: 1200");
    expect(prompt).toContain("public transit: 1100");
    expect(prompt).toContain("walked: 400");
    expect(prompt).toContain("work from home: 700");
    expect(prompt).toContain("32 minutes");
  });

  it("includes housing age distribution", () => {
    const data = makeFullReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("Pre-1950: 800");
    expect(prompt).toContain("1950-1979: 600");
    expect(prompt).toContain("2010+: 500");
  });

  it("includes owner-occupied percentage with national comparison", () => {
    const data = makeFullReportData();
    const prompt = buildUserPrompt(data);

    // ownerOccupied=1100, renterOccupied=1700, total=2800
    // ownerPct = round(1100/2800 * 100) = 39%
    expect(prompt).toContain("Owner-occupied: 39%");
    expect(prompt).toContain("national avg: 64.4%");
  });

  it("includes unemployment rate calculation", () => {
    const data = makeFullReportData();
    const prompt = buildUserPrompt(data);

    // employed=3950, unemployed=250, laborForce=4200
    // unempRate = (250/4200)*100 = 5.952... => 6.0%
    expect(prompt).toContain("Unemployment rate: 6.0%");
    expect(prompt).toContain("national avg: 5.3%");
  });

  it("handles Census data with all null fields without crashing", () => {
    const nullCensus: CensusResult = {
      demographics: {
        totalPopulation: null,
        medianAge: null,
        householdTypes: {
          totalHouseholds: null,
          marriedCouple: null,
          singleMale: null,
          singleFemale: null,
          nonFamily: null,
        },
        educationalAttainment: {
          highSchoolOrHigher: null,
          bachelorsOrHigher: null,
          graduateOrProfessional: null,
        },
        raceEthnicity: {
          white: null,
          blackOrAfricanAmerican: null,
          asian: null,
          hispanicOrLatino: null,
          twoOrMore: null,
          other: null,
        },
      },
      housing: {
        medianHomeValue: null,
        medianRent: null,
        ownerOccupied: null,
        renterOccupied: null,
        totalHousingUnits: null,
        yearBuilt: {
          before1950: null,
          from1950to1979: null,
          from1980to1999: null,
          from2000to2009: null,
          from2010orLater: null,
        },
      },
      economic: {
        medianHouseholdIncome: null,
        employmentStatus: {
          inLaborForce: null,
          employed: null,
          unemployed: null,
        },
        commuteMeans: {
          droveAlone: null,
          carpooled: null,
          publicTransit: null,
          walked: null,
          workedFromHome: null,
          other: null,
        },
        medianCommuteMinutes: null,
      },
      nationalAverages: {
        demographics: { medianAge: 38.9, totalPopulation: 331_449_281 },
        housing: { medianHomeValue: 281_900, medianRent: 1_163, ownerOccupiedPct: 64.4 },
        economic: { medianHouseholdIncome: 75_149, unemploymentRate: 5.3 },
      },
      fips: null,
    };

    const data = makeFullReportData({ census: nullCensus });

    // Should not throw
    const prompt = buildUserPrompt(data);

    // Should still have the Census section header
    expect(prompt).toContain("DEMOGRAPHICS & CENSUS DATA");
    // Should not contain specific data values
    expect(prompt).not.toContain("Census tract population:");
    expect(prompt).not.toContain("Median age:");
    expect(prompt).not.toContain("Median home value:");
    expect(prompt).not.toContain("Median household income:");
  });

  it("includes the address in the prompt header", () => {
    const data = makeFullReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("456 DeKalb Ave, Brooklyn, NY 11205");
  });

  it("handles empty isochrone features without crashing", () => {
    const data = makeFullReportData({
      isochrone: { type: "FeatureCollection", features: [] },
    });

    const prompt = buildUserPrompt(data);

    // Section header should appear but no walking area lines
    expect(prompt).toContain("WALKABILITY");
    expect(prompt).not.toContain("walking area");
  });
});

// =============================================================================
// System prompt verification
// =============================================================================

describe("Integration: system prompt content", () => {
  it("establishes the knowledgeable local friend voice", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("knowledgeable local friend");
    expect(prompt).toContain("warm");
    expect(prompt).toContain("candid");
  });

  it("bans generic AI boosterism words", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("bustling");
    expect(prompt).toContain("vibrant");
    expect(prompt).toContain("tapestry");
    expect(prompt).toContain("hidden gem");
  });
});

// =============================================================================
// Slug generation edge cases
// =============================================================================

describe("Integration: slug generation edge cases", () => {
  it("handles very long addresses by truncating to 60 chars", () => {
    const longAddress =
      "12345 North Very Long Boulevard Apartment 42B Suite 100, " +
      "San Francisco International Airport District, California 94128-1234";
    const slug = generateSlug(longAddress);

    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    // After truncation, trailing hyphens should be trimmed
    expect(slug).not.toMatch(/-$/);
  });

  it("handles addresses with special characters", () => {
    const addresses = [
      "123 O'Malley St., St. Louis, MO",
      '456 "The Heights" Blvd, Denver, CO',
      "789 First Ave. #101 (Unit A), NYC, NY",
      "100 Main St. & 1st Ave, Portland, OR",
      "200 W. 3rd St., Suite #500, Austin, TX",
    ];

    for (const addr of addresses) {
      const slug = generateSlug(addr);
      // Should only contain lowercase alphanumeric and hyphens
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      // Should not have double hyphens
      expect(slug).not.toMatch(/--/);
      // Should not start or end with hyphens
      expect(slug).not.toMatch(/^-|-$/);
      expect(slug.length).toBeGreaterThan(0);
      expect(slug.length).toBeLessThanOrEqual(60);
    }
  });

  it("handles Unicode characters in addresses", () => {
    const unicodeAddresses = [
      "100 Caf\u00e9 Street, Miami, FL",
      "200 Stra\u00dfe Way, Milwaukee, WI",
      "300 \u00d1o\u00f1o Lane, San Antonio, TX",
    ];

    for (const addr of unicodeAddresses) {
      const slug = generateSlug(addr);
      // Unicode chars get stripped, result should still be valid
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(slug.length).toBeGreaterThan(0);
    }
  });

  it("handles addresses that are all special characters", () => {
    const slug = generateSlug("!@#$%^&*()");
    // Should result in empty string after stripping
    expect(slug).toBe("");
  });

  it("handles empty address string", () => {
    const slug = generateSlug("");
    expect(slug).toBe("");
  });

  it("handles address with only whitespace", () => {
    const slug = generateSlug("   ");
    expect(slug).toBe("");
  });

  it("handles addresses with consecutive special characters", () => {
    const slug = generateSlug("123---Main...St!!!Springfield");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    // Multiple hyphens should collapse
    expect(slug).not.toMatch(/--/);
  });

  it("handles numeric-only addresses", () => {
    const slug = generateSlug("12345");
    expect(slug).toBe("12345");
  });

  it("handles addresses exactly at the 60-char limit", () => {
    // 60 chars exactly: "abcdefghij" repeated 6 times
    const sixtyCharAddr = "a".repeat(60);
    const slug = generateSlug(sixtyCharAddr);
    expect(slug.length).toBe(60);
  });

  it("produces different slugs for different addresses", () => {
    const slugs = [
      generateSlug("123 Main St, Springfield, IL"),
      generateSlug("456 Oak Ave, Portland, OR"),
      generateSlug("789 Elm St, Madison, WI"),
    ];

    const unique = new Set(slugs);
    expect(unique.size).toBe(3);
  });

  it("produces consistent slugs for the same address", () => {
    const address = "42 Wallaby Way, Sydney, NSW";
    const slug1 = generateSlug(address);
    const slug2 = generateSlug(address);
    expect(slug1).toBe(slug2);
  });
});

// =============================================================================
// DB interaction edge cases
// =============================================================================

describe("Integration: slug collision retry with varied error messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultDbMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries on Postgres error code 23505", async () => {
    setupAllApiSuccess();

    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }]); // location insert
    mockInsertReturning.mockRejectedValueOnce(
      new Error("error: 23505 duplicate key value"),
    );
    mockInsertReturning.mockResolvedValueOnce([{ id: 2 }]); // retry succeeds

    const result = await generateReport(baseInput);

    expect(result.slug).not.toBe("456-dekalb-ave-brooklyn-ny-11205");
    // Retry appends -<5 random chars> to the base slug (sliced to 53 chars)
    expect(result.slug).toMatch(/^456-dekalb-ave-brooklyn-ny-11205-[a-z0-9]{5}$/);
  });

  it("retries on 'unique' constraint error message", async () => {
    setupAllApiSuccess();

    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }]); // location
    mockInsertReturning.mockRejectedValueOnce(
      new Error("violates unique constraint"),
    );
    mockInsertReturning.mockResolvedValueOnce([{ id: 2 }]); // retry

    const result = await generateReport(baseInput);

    expect(result.slug).toMatch(/-[a-z0-9]{5}$/);
  });

  it("throws after exhausting all retries", async () => {
    setupAllApiSuccess();

    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }]); // location
    // 4 consecutive unique violations (1 initial + 3 retries = 4 total, exceeds MAX_SLUG_RETRIES)
    for (let i = 0; i < 4; i++) {
      mockInsertReturning.mockRejectedValueOnce(
        new Error("duplicate key value violates unique constraint"),
      );
    }

    await expect(generateReport(baseInput)).rejects.toThrow(
      "duplicate key",
    );
  });

  it("throws non-unique errors immediately without retry", async () => {
    setupAllApiSuccess();

    mockInsertReturning.mockResolvedValueOnce([{ id: 1 }]); // location
    mockInsertReturning.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    await expect(generateReport(baseInput)).rejects.toThrow(
      "connection refused",
    );
  });
});

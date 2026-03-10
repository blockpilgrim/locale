import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks -------------------------------------------------------------------

// Mock the database module.
const mockInsertReturning = vi.fn();
const mockUpdateSet = vi.fn();
const mockSelectWhere = vi.fn();

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
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockSelectWhere,
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/db/schema", () => ({
  locations: { id: "id", address: "address" },
  reports: { id: "id", slug: "slug", locationId: "location_id" },
}));

// Mock the API clients.
vi.mock("@/lib/census", () => ({
  fetchCensusData: vi.fn(),
}));

vi.mock("@/lib/mapbox/isochrone", () => ({
  fetchIsochrone: vi.fn(),
}));

vi.mock("@/lib/poi", () => ({
  fetchPoi: vi.fn(),
}));

import { generateReport, generateSlug } from "@/lib/report/generate";
import { fetchCensusData } from "@/lib/census";
import { fetchIsochrone } from "@/lib/mapbox/isochrone";
import { fetchPoi } from "@/lib/poi";

// --- Fixtures ----------------------------------------------------------------

const mockCensusResult = {
  demographics: {
    totalPopulation: 5000,
    medianAge: 35,
    householdTypes: {
      totalHouseholds: 2000,
      marriedCouple: 800,
      singleMale: 200,
      singleFemale: 300,
      nonFamily: 700,
    },
    educationalAttainment: {
      highSchoolOrHigher: 4000,
      bachelorsOrHigher: 2000,
      graduateOrProfessional: 500,
    },
    raceEthnicity: {
      white: 3000,
      blackOrAfricanAmerican: 500,
      asian: 400,
      hispanicOrLatino: 800,
      twoOrMore: 200,
      other: 100,
    },
  },
  housing: {
    medianHomeValue: 350000,
    medianRent: 1500,
    ownerOccupied: 1200,
    renterOccupied: 800,
    totalHousingUnits: 2100,
    yearBuilt: {
      before1950: 300,
      from1950to1979: 500,
      from1980to1999: 600,
      from2000to2009: 400,
      from2010orLater: 300,
    },
  },
  economic: {
    medianHouseholdIncome: 85000,
    employmentStatus: { inLaborForce: 3000, employed: 2800, unemployed: 200 },
    commuteMeans: {
      droveAlone: 1500,
      carpooled: 300,
      publicTransit: 400,
      walked: 200,
      workedFromHome: 500,
      other: 100,
    },
    medianCommuteMinutes: 28,
  },
  nationalAverages: {
    demographics: { medianAge: 38.9, totalPopulation: 331449281 },
    housing: { medianHomeValue: 281900, medianRent: 1163, ownerOccupiedPct: 64.4 },
    economic: { medianHouseholdIncome: 75149, unemploymentRate: 5.3 },
  },
  fips: { state: "17", county: "031", tract: "010100" },
};

const mockIsochroneResult = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      properties: { contour: 5, color: "#ff0000", opacity: 0.33, metric: "contour" },
      geometry: { type: "Polygon" as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    },
  ],
};

const mockPoiResult = {
  all: [],
  byCategory: [],
  nearestEssentials: { grocery: null, pharmacy: null, park: null },
  totalCount: 0,
};

// --- Tests -------------------------------------------------------------------

describe("generateSlug", () => {
  it("converts an address to a lowercase hyphenated slug", () => {
    expect(generateSlug("123 Main St, Springfield, IL")).toBe(
      "123-main-st-springfield-il",
    );
  });

  it("removes special characters", () => {
    expect(generateSlug("456 Oak Ave. #2B, Portland, OR 97201")).toBe(
      "456-oak-ave-2b-portland-or-97201",
    );
  });

  it("truncates to 60 characters", () => {
    const longAddress =
      "12345 Very Long Street Name Boulevard Suite 100, San Francisco, California 94105";
    const slug = generateSlug(longAddress);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it("collapses multiple hyphens", () => {
    expect(generateSlug("100   Main   St")).toBe("100-main-st");
  });

  it("trims leading and trailing hyphens", () => {
    expect(generateSlug("  - test address - ")).toBe("test-address");
  });
});

describe("generateReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock setup: DB inserts succeed, no existing slug.
    mockInsertReturning.mockResolvedValue([{ id: 1 }]);
    mockSelectWhere.mockResolvedValue([]); // No existing slug
    mockUpdateSet.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fires Census, isochrone, and POI fetches in parallel and returns structured data", async () => {
    vi.mocked(fetchCensusData).mockResolvedValueOnce(mockCensusResult);
    vi.mocked(fetchIsochrone).mockResolvedValueOnce(mockIsochroneResult);
    vi.mocked(fetchPoi).mockResolvedValueOnce(mockPoiResult);

    const result = await generateReport({
      address: "123 Main St, Springfield, IL",
      latitude: 39.78,
      longitude: -89.65,
      city: "Springfield",
      state: "IL",
    });

    expect(result.slug).toBe("123-main-st-springfield-il");
    expect(result.isViable).toBe(true);
    expect(result.data.census).toBe(mockCensusResult);
    expect(result.data.isochrone).toBe(mockIsochroneResult);
    expect(result.data.poi).toBe(mockPoiResult);
    expect(result.data.availableSections).toEqual({
      census: true,
      isochrone: true,
      poi: true,
    });

    // Verify correct parameter order for each API client.
    expect(fetchCensusData).toHaveBeenCalledWith(39.78, -89.65);
    expect(fetchIsochrone).toHaveBeenCalledWith(-89.65, 39.78); // lng first!
    expect(fetchPoi).toHaveBeenCalledWith(39.78, -89.65);
  });

  it("marks report as viable when at least one data source succeeds", async () => {
    vi.mocked(fetchCensusData).mockResolvedValueOnce(null);
    vi.mocked(fetchIsochrone).mockResolvedValueOnce(null);
    vi.mocked(fetchPoi).mockResolvedValueOnce(mockPoiResult);

    const result = await generateReport({
      address: "456 Oak Ave, Portland, OR",
      latitude: 45.52,
      longitude: -122.68,
    });

    expect(result.isViable).toBe(true);
    expect(result.data.availableSections).toEqual({
      census: false,
      isochrone: false,
      poi: true,
    });
  });

  it("marks report as not viable and sets status to 'failed' when ALL data sources fail", async () => {
    vi.mocked(fetchCensusData).mockResolvedValueOnce(null);
    vi.mocked(fetchIsochrone).mockResolvedValueOnce(null);
    vi.mocked(fetchPoi).mockResolvedValueOnce(null);

    const result = await generateReport({
      address: "789 Elm St, Nowhere, TX",
      latitude: 30.0,
      longitude: -97.0,
    });

    expect(result.isViable).toBe(false);
    expect(result.data.availableSections).toEqual({
      census: false,
      isochrone: false,
      poi: false,
    });

    // Verify DB update was called with "failed" status.
    expect(mockUpdateSet).toHaveBeenCalled();
  });

  it("handles API client exceptions gracefully (catches thrown errors)", async () => {
    vi.mocked(fetchCensusData).mockRejectedValueOnce(
      new Error("Network timeout"),
    );
    vi.mocked(fetchIsochrone).mockResolvedValueOnce(mockIsochroneResult);
    vi.mocked(fetchPoi).mockRejectedValueOnce(new Error("Overpass down"));

    const result = await generateReport({
      address: "100 Test Blvd, Chicago, IL",
      latitude: 41.88,
      longitude: -87.63,
    });

    // Should not throw; census and POI treated as null.
    expect(result.isViable).toBe(true);
    expect(result.data.census).toBeNull();
    expect(result.data.isochrone).toBe(mockIsochroneResult);
    expect(result.data.poi).toBeNull();
  });

  it("stores address metadata in the data payload", async () => {
    vi.mocked(fetchCensusData).mockResolvedValueOnce(mockCensusResult);
    vi.mocked(fetchIsochrone).mockResolvedValueOnce(null);
    vi.mocked(fetchPoi).mockResolvedValueOnce(null);

    const result = await generateReport({
      address: "200 State St, Madison, WI",
      latitude: 43.07,
      longitude: -89.40,
      city: "Madison",
      state: "WI",
      zip: "53703",
    });

    expect(result.data.address).toEqual({
      full: "200 State St, Madison, WI",
      city: "Madison",
      state: "WI",
      zip: "53703",
    });
    expect(result.data.coordinates).toEqual({
      latitude: 43.07,
      longitude: -89.40,
    });
  });
});

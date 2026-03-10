import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/report/narrative";
import type { ReportData } from "@/lib/report/generate";

// --- Fixtures ----------------------------------------------------------------

function makeReportData(
  overrides: Partial<ReportData> = {},
): ReportData {
  return {
    address: {
      full: "123 Main St, Springfield, IL",
      city: "Springfield",
      state: "IL",
      zip: "62701",
    },
    coordinates: { latitude: 39.78, longitude: -89.65 },
    census: {
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
    },
    isochrone: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { contour: 5, color: "#ff0000", opacity: 0.33, metric: "contour" },
          geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
        {
          type: "Feature",
          properties: { contour: 10, color: "#00ff00", opacity: 0.33, metric: "contour" },
          geometry: { type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 0]]] },
        },
      ],
    },
    poi: {
      all: [
        {
          id: 1,
          name: "Joe's Coffee",
          category: "dining",
          osmTag: "cafe",
          latitude: 39.781,
          longitude: -89.651,
          distanceMeters: 150,
          walkingMinutes: 2,
        },
        {
          id: 2,
          name: "Fresh Market",
          category: "groceries",
          osmTag: "supermarket",
          latitude: 39.779,
          longitude: -89.649,
          distanceMeters: 300,
          walkingMinutes: 4,
        },
      ],
      byCategory: [
        {
          category: "dining",
          count: 1,
          items: [
            {
              id: 1,
              name: "Joe's Coffee",
              category: "dining",
              osmTag: "cafe",
              latitude: 39.781,
              longitude: -89.651,
              distanceMeters: 150,
              walkingMinutes: 2,
            },
          ],
        },
        {
          category: "groceries",
          count: 1,
          items: [
            {
              id: 2,
              name: "Fresh Market",
              category: "groceries",
              osmTag: "supermarket",
              latitude: 39.779,
              longitude: -89.649,
              distanceMeters: 300,
              walkingMinutes: 4,
            },
          ],
        },
        { category: "parks", count: 0, items: [] },
        { category: "fitness", count: 0, items: [] },
        { category: "nightlife", count: 0, items: [] },
        { category: "healthcare", count: 0, items: [] },
        { category: "shopping", count: 0, items: [] },
        { category: "education", count: 0, items: [] },
      ],
      nearestEssentials: {
        grocery: {
          id: 2,
          name: "Fresh Market",
          category: "groceries",
          osmTag: "supermarket",
          latitude: 39.779,
          longitude: -89.649,
          distanceMeters: 300,
          walkingMinutes: 4,
        },
        pharmacy: null,
        park: null,
      },
      totalCount: 2,
    },
    availableSections: { census: true, isochrone: true, poi: true },
    fetchedAt: "2026-03-10T12:00:00.000Z",
    ...overrides,
  };
}

// --- Tests -------------------------------------------------------------------

describe("buildSystemPrompt", () => {
  it("includes voice guidelines and banned words", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("knowledgeable local friend");
    expect(prompt).toContain("bustling");
    expect(prompt).toContain("vibrant");
    expect(prompt).toContain("tapestry");
    expect(prompt).toContain("3-5 paragraphs");
    expect(prompt).toContain("HANDLING MISSING DATA");
  });

  it("instructs the AI to avoid boosterism", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("never use generic boosterism");
  });
});

describe("buildUserPrompt", () => {
  it("includes the full address", () => {
    const data = makeReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("123 Main St, Springfield, IL");
  });

  it("includes census demographics data", () => {
    const data = makeReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("DEMOGRAPHICS & CENSUS DATA");
    expect(prompt).toContain("5,000"); // totalPopulation formatted
    expect(prompt).toContain("Median age: 35");
  });

  it("includes housing data with national comparison", () => {
    const data = makeReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("HOUSING DATA");
    expect(prompt).toContain("$350,000");
    expect(prompt).toContain("$281,900"); // national avg
  });

  it("includes economic data", () => {
    const data = makeReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("ECONOMIC DATA");
    expect(prompt).toContain("$85,000");
    expect(prompt).toContain("28 minutes");
  });

  it("includes isochrone walking data", () => {
    const data = makeReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("WALKABILITY");
    expect(prompt).toContain("5-minute walking area");
  });

  it("includes POI data with named items", () => {
    const data = makeReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("NEARBY AMENITIES");
    expect(prompt).toContain("Joe's Coffee");
    expect(prompt).toContain("Fresh Market");
    expect(prompt).toContain("NEAREST ESSENTIALS");
  });

  it("handles missing census data gracefully", () => {
    const data = makeReportData({ census: null });
    const prompt = buildUserPrompt(data);

    expect(prompt).not.toContain("DEMOGRAPHICS & CENSUS DATA");
    expect(prompt).not.toContain("HOUSING DATA");
    expect(prompt).not.toContain("ECONOMIC DATA");
    expect(prompt).toContain("demographics/housing/economic");
  });

  it("handles missing isochrone data gracefully", () => {
    const data = makeReportData({ isochrone: null });
    const prompt = buildUserPrompt(data);

    expect(prompt).not.toContain("WALKABILITY");
    expect(prompt).toContain("walkability isochrone");
  });

  it("handles missing POI data gracefully", () => {
    const data = makeReportData({ poi: null });
    const prompt = buildUserPrompt(data);

    expect(prompt).not.toContain("NEARBY AMENITIES");
    expect(prompt).toContain("nearby amenities");
  });

  it("handles all data missing", () => {
    const data = makeReportData({
      census: null,
      isochrone: null,
      poi: null,
    });
    const prompt = buildUserPrompt(data);

    // Should still have the address header
    expect(prompt).toContain("123 Main St, Springfield, IL");
    // Should note all missing sections
    expect(prompt).toContain("demographics/housing/economic");
    expect(prompt).toContain("walkability isochrone");
    expect(prompt).toContain("nearby amenities");
  });

  it("omits the location line when both city and state are missing", () => {
    const data = makeReportData({
      address: {
        full: "123 Main St, Springfield, IL",
        city: undefined,
        state: undefined,
        zip: "62701",
      },
    });
    const prompt = buildUserPrompt(data);

    // Should still have the address header
    expect(prompt).toContain("123 Main St, Springfield, IL");
    // Should NOT have a separate "Location:" line
    expect(prompt).not.toMatch(/^Location:/m);
  });

  it("shows 'none found' for missing nearest essentials", () => {
    const data = makeReportData();
    // The default fixture has pharmacy: null and park: null
    const prompt = buildUserPrompt(data);

    expect(prompt).toContain("Nearest pharmacy: none found within search radius");
    expect(prompt).toContain("Nearest park: none found within search radius");
    // Grocery is present in the fixture
    expect(prompt).toContain("Nearest grocery: Fresh Market");
  });

  it("does not include missing-data note when all sections are present", () => {
    const data = makeReportData();
    const prompt = buildUserPrompt(data);

    expect(prompt).not.toContain("were unavailable for this location");
  });
});

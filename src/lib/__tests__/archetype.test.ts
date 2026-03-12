// ---------------------------------------------------------------------------
// Tests for Archetype Classification (src/lib/report/archetype.ts)
// ---------------------------------------------------------------------------
// Covers: validation logic, system prompt content, AI call orchestration,
// DB update on success, graceful null-return on failure.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mock AI SDK before imports -------------------------------------------

const mockGenerateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: (model: string) => ({ model }),
}));

// --- Mock DB ---------------------------------------------------------------

const mockSelectFrom = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockSelectFrom,
        }),
      }),
    }),
    update: () => ({
      set: (data: unknown) => {
        mockUpdateSet(data);
        return {
          where: mockUpdateWhere,
        };
      },
    }),
  }),
}));

vi.mock("@/lib/db/schema", () => ({
  reports: { id: "id", data: "data" },
}));

// --- Imports (after mocks) -------------------------------------------------

import {
  classifyArchetype,
  buildArchetypeSystemPrompt,
  validateArchetypeResult,
} from "@/lib/report/archetype";
import type { ReportData } from "@/lib/report/generate";

// --- Fixtures ---------------------------------------------------------------

function makeValidArchetypeJson() {
  return {
    archetype: "The Brownstone Belt",
    tagline: "Where stoops are social infrastructure and the bodega knows your order.",
    vibeSpectrum: {
      walkable: 85,
      buzzing: 62,
      settled: 78,
      accessible: 35,
      diverse: 71,
    },
    definingTraits: [
      "$2,800 median rent",
      "83% walk or take transit",
      "47 restaurants within 10 min",
    ],
    reasoning: "Dense urban walkable neighborhood with pre-war character.",
  };
}

function makeMinimalReportData(): ReportData {
  return {
    address: {
      full: "456 DeKalb Ave, Brooklyn, NY 11205",
      city: "Brooklyn",
      state: "NY",
      zip: "11205",
    },
    coordinates: { latitude: 40.6907, longitude: -73.9689 },
    census: null,
    isochrone: null,
    poi: null,
    availableSections: { census: false, isochrone: false, poi: false },
    archetype: null,
    fetchedAt: "2026-03-11T12:00:00.000Z",
  };
}

// =============================================================================
// validateArchetypeResult — pure function tests
// =============================================================================

describe("validateArchetypeResult", () => {
  it("accepts a valid archetype result", () => {
    const valid = makeValidArchetypeJson();
    const result = validateArchetypeResult(valid);

    expect(result).not.toBeNull();
    expect(result!.archetype).toBe("The Brownstone Belt");
    expect(result!.tagline).toContain("stoops");
    expect(result!.definingTraits).toHaveLength(3);
    expect(result!.vibeSpectrum.walkable).toBe(85);
  });

  it("returns null for null input", () => {
    expect(validateArchetypeResult(null)).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(validateArchetypeResult("string")).toBeNull();
    expect(validateArchetypeResult(42)).toBeNull();
    expect(validateArchetypeResult(true)).toBeNull();
  });

  it("returns null when archetype field is missing", () => {
    const invalid = makeValidArchetypeJson();
    delete (invalid as Record<string, unknown>).archetype;
    expect(validateArchetypeResult(invalid)).toBeNull();
  });

  it("returns null when archetype is empty string", () => {
    const invalid = { ...makeValidArchetypeJson(), archetype: "" };
    expect(validateArchetypeResult(invalid)).toBeNull();
  });

  it("returns null when tagline is missing", () => {
    const invalid = makeValidArchetypeJson();
    delete (invalid as Record<string, unknown>).tagline;
    expect(validateArchetypeResult(invalid)).toBeNull();
  });

  it("returns null when vibeSpectrum is missing", () => {
    const invalid = makeValidArchetypeJson();
    delete (invalid as Record<string, unknown>).vibeSpectrum;
    expect(validateArchetypeResult(invalid)).toBeNull();
  });

  it("returns null when a vibeSpectrum axis is missing", () => {
    const invalid = makeValidArchetypeJson();
    delete (invalid.vibeSpectrum as Record<string, unknown>).walkable;
    expect(validateArchetypeResult(invalid)).toBeNull();
  });

  it("returns null when a vibeSpectrum axis is not a number", () => {
    const invalid = makeValidArchetypeJson();
    (invalid.vibeSpectrum as Record<string, unknown>).buzzing = "high";
    expect(validateArchetypeResult(invalid)).toBeNull();
  });

  it("clamps vibeSpectrum values above 100 to 100", () => {
    const data = makeValidArchetypeJson();
    data.vibeSpectrum.walkable = 150;
    const result = validateArchetypeResult(data);

    expect(result).not.toBeNull();
    expect(result!.vibeSpectrum.walkable).toBe(100);
  });

  it("clamps vibeSpectrum values below 0 to 0", () => {
    const data = makeValidArchetypeJson();
    data.vibeSpectrum.diverse = -20;
    const result = validateArchetypeResult(data);

    expect(result).not.toBeNull();
    expect(result!.vibeSpectrum.diverse).toBe(0);
  });

  it("rounds vibeSpectrum float values to integers", () => {
    const data = makeValidArchetypeJson();
    data.vibeSpectrum.settled = 72.7;
    const result = validateArchetypeResult(data);

    expect(result).not.toBeNull();
    expect(result!.vibeSpectrum.settled).toBe(73);
  });

  it("returns null when definingTraits has fewer than 3 items", () => {
    const invalid = {
      ...makeValidArchetypeJson(),
      definingTraits: ["trait one", "trait two"],
    };
    expect(validateArchetypeResult(invalid)).toBeNull();
  });

  it("returns null when definingTraits has more than 3 items", () => {
    const invalid = {
      ...makeValidArchetypeJson(),
      definingTraits: ["one", "two", "three", "four"],
    };
    expect(validateArchetypeResult(invalid)).toBeNull();
  });

  it("returns null when definingTraits contains empty strings", () => {
    const invalid = {
      ...makeValidArchetypeJson(),
      definingTraits: ["trait one", "", "trait three"],
    };
    expect(validateArchetypeResult(invalid)).toBeNull();
  });

  it("returns null when definingTraits is not an array", () => {
    const invalid = {
      ...makeValidArchetypeJson(),
      definingTraits: "not an array",
    };
    expect(validateArchetypeResult(invalid)).toBeNull();
  });

  it("returns null when reasoning is missing", () => {
    const invalid = makeValidArchetypeJson();
    delete (invalid as Record<string, unknown>).reasoning;
    expect(validateArchetypeResult(invalid)).toBeNull();
  });

  it("returns null when vibeSpectrum axis is NaN", () => {
    const invalid = makeValidArchetypeJson();
    (invalid.vibeSpectrum as Record<string, unknown>).accessible = NaN;
    expect(validateArchetypeResult(invalid)).toBeNull();
  });
});

// =============================================================================
// buildArchetypeSystemPrompt — content verification
// =============================================================================

describe("buildArchetypeSystemPrompt", () => {
  it("includes seed archetype labels", () => {
    const prompt = buildArchetypeSystemPrompt();

    expect(prompt).toContain("The Urban Engine");
    expect(prompt).toContain("The Brownstone Belt");
    expect(prompt).toContain("Cul-de-Sac Country");
    expect(prompt).toContain("The Flux District");
  });

  it("specifies the JSON output format", () => {
    const prompt = buildArchetypeSystemPrompt();

    expect(prompt).toContain("OUTPUT FORMAT (strict JSON)");
    expect(prompt).toContain('"archetype"');
    expect(prompt).toContain('"vibeSpectrum"');
    expect(prompt).toContain('"definingTraits"');
  });

  it("requires exactly 3 defining traits", () => {
    const prompt = buildArchetypeSystemPrompt();
    expect(prompt).toContain("exactly 3");
  });

  it("specifies vibeSpectrum range as 0-100", () => {
    const prompt = buildArchetypeSystemPrompt();
    expect(prompt).toContain("0-100");
  });
});

// =============================================================================
// classifyArchetype — full AI call + DB update flow
// =============================================================================

describe("classifyArchetype", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when ANTHROPIC_API_KEY is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    // The getApiKey() check throws for empty string? Let me check - it checks `if (!key)`.
    // Empty string is falsy, so it should throw.

    await expect(
      classifyArchetype(1, makeMinimalReportData()),
    ).rejects.toThrow("ANTHROPIC_API_KEY");
  });

  it("parses valid JSON response and updates DB", async () => {
    const validResult = makeValidArchetypeJson();
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(validResult),
    });

    mockUpdateWhere.mockResolvedValueOnce(undefined);

    const result = await classifyArchetype(1, makeMinimalReportData());

    expect(result).not.toBeNull();
    expect(result!.archetype).toBe("The Brownstone Belt");
    expect(result!.vibeSpectrum.walkable).toBe(85);
    expect(result!.definingTraits).toHaveLength(3);

    // Verify DB was updated via atomic JSONB merge (SQL expression)
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    expect(mockUpdateWhere).toHaveBeenCalled();
  });

  it("strips markdown code fencing from response", async () => {
    const validResult = makeValidArchetypeJson();
    const wrappedResponse = "```json\n" + JSON.stringify(validResult) + "\n```";
    mockGenerateText.mockResolvedValueOnce({ text: wrappedResponse });

    mockUpdateWhere.mockResolvedValueOnce(undefined);

    const result = await classifyArchetype(1, makeMinimalReportData());

    expect(result).not.toBeNull();
    expect(result!.archetype).toBe("The Brownstone Belt");
  });

  it("returns null for malformed JSON response", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "This is not JSON at all",
    });

    const result = await classifyArchetype(1, makeMinimalReportData());

    expect(result).toBeNull();
    // DB should NOT be updated
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("returns null when validation fails (e.g., missing fields)", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ archetype: "Test" }),
    });

    const result = await classifyArchetype(1, makeMinimalReportData());

    expect(result).toBeNull();
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("returns null when AI call throws (network error)", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("API timeout"));

    const result = await classifyArchetype(1, makeMinimalReportData());

    expect(result).toBeNull();
  });

  it("always performs atomic DB merge after successful classification", async () => {
    const validResult = makeValidArchetypeJson();
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(validResult),
    });

    mockUpdateWhere.mockResolvedValueOnce(undefined);

    const result = await classifyArchetype(1, makeMinimalReportData());

    // Returns the archetype
    expect(result).not.toBeNull();
    expect(result!.archetype).toBe("The Brownstone Belt");
    // Atomic JSONB merge always runs (SQL `||` is safe on any existing data)
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
  });

  it("passes temperature 0.3 and maxOutputTokens 500 to generateText", async () => {
    const validResult = makeValidArchetypeJson();
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(validResult),
    });
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    await classifyArchetype(1, makeMinimalReportData());

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.3,
        maxOutputTokens: 500,
      }),
    );
  });

  it("uses buildUserPrompt from narrative.ts for the prompt", async () => {
    const validResult = makeValidArchetypeJson();
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(validResult),
    });
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    const data = makeMinimalReportData();
    await classifyArchetype(1, data);

    // The prompt should contain the address from the report data
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain("456 DeKalb Ave, Brooklyn, NY 11205");
  });
});

// =============================================================================
// classifyArchetype — partial data edge cases (T6.3)
// =============================================================================
// Verifies that archetype classification handles partial/missing data gracefully:
// census-only, POI-only, all-sources-failed, and census with some null fields.

describe("classifyArchetype — partial data scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function makeReportDataWithCensusOnly(): ReportData {
    return {
      address: {
        full: "123 Main St, Springfield, IL 62701",
        city: "Springfield",
        state: "IL",
        zip: "62701",
      },
      coordinates: { latitude: 39.7817, longitude: -89.6501 },
      census: {
        demographics: {
          totalPopulation: 4500,
          medianAge: 42.1,
          householdTypes: {
            totalHouseholds: 1800,
            marriedCouple: 700,
            singleMale: 150,
            singleFemale: 250,
            nonFamily: 700,
          },
          educationalAttainment: {
            highSchoolOrHigher: 3200,
            bachelorsOrHigher: 1200,
            graduateOrProfessional: 350,
          },
          raceEthnicity: {
            white: 3000,
            blackOrAfricanAmerican: 800,
            asian: 200,
            hispanicOrLatino: 350,
            twoOrMore: 100,
            other: 50,
          },
        },
        housing: {
          medianHomeValue: 185000,
          medianRent: 850,
          ownerOccupied: 1100,
          renterOccupied: 700,
          totalHousingUnits: 2000,
          yearBuilt: {
            before1950: 600,
            from1950to1979: 500,
            from1980to1999: 400,
            from2000to2009: 300,
            from2010orLater: 200,
          },
        },
        economic: {
          medianHouseholdIncome: 55000,
          employmentStatus: {
            inLaborForce: 2800,
            employed: 2600,
            unemployed: 200,
          },
          commuteMeans: {
            droveAlone: 1800,
            carpooled: 200,
            publicTransit: 100,
            walked: 150,
            workedFromHome: 300,
            other: 50,
          },
          medianCommuteMinutes: 22,
        },
        nationalAverages: {
          demographics: { medianAge: 38.9, totalPopulation: 331_449_281 },
          housing: { medianHomeValue: 281_900, medianRent: 1_163, ownerOccupiedPct: 64.4 },
          economic: { medianHouseholdIncome: 75_149, unemploymentRate: 5.3 },
        },
        fips: { state: "17", county: "167", tract: "000200" },
      },
      isochrone: null,
      poi: null,
      availableSections: { census: true, isochrone: false, poi: false },
      archetype: null,
      fetchedAt: "2026-03-12T12:00:00.000Z",
    };
  }

  function makeReportDataWithPoiOnly(): ReportData {
    return {
      address: {
        full: "789 Oak Ave, Portland, OR 97201",
        city: "Portland",
        state: "OR",
        zip: "97201",
      },
      coordinates: { latitude: 45.5122, longitude: -122.6587 },
      census: null,
      isochrone: null,
      poi: {
        all: [
          {
            id: 200,
            name: "Stumptown Coffee",
            category: "dining",
            osmTag: "cafe",
            latitude: 45.5130,
            longitude: -122.6580,
            distanceMeters: 100,
            walkingMinutes: 2,
          },
          {
            id: 201,
            name: "Powell's Books",
            category: "shopping",
            osmTag: "books",
            latitude: 45.5135,
            longitude: -122.6600,
            distanceMeters: 200,
            walkingMinutes: 3,
          },
          {
            id: 202,
            name: "Tom McCall Waterfront Park",
            category: "parks",
            osmTag: "park",
            latitude: 45.5110,
            longitude: -122.6700,
            distanceMeters: 300,
            walkingMinutes: 4,
          },
        ],
        byCategory: [
          { category: "dining", count: 1, items: [{ id: 200, name: "Stumptown Coffee", category: "dining", osmTag: "cafe", latitude: 45.5130, longitude: -122.6580, distanceMeters: 100, walkingMinutes: 2 }] },
          { category: "shopping", count: 1, items: [{ id: 201, name: "Powell's Books", category: "shopping", osmTag: "books", latitude: 45.5135, longitude: -122.6600, distanceMeters: 200, walkingMinutes: 3 }] },
          { category: "parks", count: 1, items: [{ id: 202, name: "Tom McCall Waterfront Park", category: "parks", osmTag: "park", latitude: 45.5110, longitude: -122.6700, distanceMeters: 300, walkingMinutes: 4 }] },
          { category: "groceries", count: 0, items: [] },
          { category: "fitness", count: 0, items: [] },
          { category: "nightlife", count: 0, items: [] },
          { category: "healthcare", count: 0, items: [] },
          { category: "education", count: 0, items: [] },
        ],
        nearestEssentials: { grocery: null, pharmacy: null, park: { id: 202, name: "Tom McCall Waterfront Park", category: "parks", osmTag: "park", latitude: 45.5110, longitude: -122.6700, distanceMeters: 300, walkingMinutes: 4 } },
        totalCount: 3,
      },
      availableSections: { census: false, isochrone: false, poi: true },
      archetype: null,
      fetchedAt: "2026-03-12T12:00:00.000Z",
    };
  }

  function makeReportDataAllFailed(): ReportData {
    return {
      address: {
        full: "999 Remote Rd, Nowhere, MT 59001",
        city: "Nowhere",
        state: "MT",
        zip: "59001",
      },
      coordinates: { latitude: 45.0, longitude: -110.0 },
      census: null,
      isochrone: null,
      poi: null,
      availableSections: { census: false, isochrone: false, poi: false },
      archetype: null,
      fetchedAt: "2026-03-12T12:00:00.000Z",
    };
  }

  it("classifies successfully with census data only (no POI, no isochrone)", async () => {
    const validResult = makeValidArchetypeJson();
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(validResult),
    });
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    const data = makeReportDataWithCensusOnly();
    const result = await classifyArchetype(1, data);

    expect(result).not.toBeNull();
    expect(result!.archetype).toBe("The Brownstone Belt");

    // Verify the prompt contains census data but not POI/isochrone sections
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain("DEMOGRAPHICS & CENSUS DATA");
    expect(callArgs.prompt).toContain("HOUSING DATA");
    expect(callArgs.prompt).toContain("ECONOMIC DATA");
    expect(callArgs.prompt).not.toContain("WALKABILITY");
    expect(callArgs.prompt).not.toContain("NEARBY AMENITIES");
    // Should note missing data sections
    expect(callArgs.prompt).toContain("walkability isochrone");
    expect(callArgs.prompt).toContain("nearby amenities");
  });

  it("classifies successfully with POI data only (no census, no isochrone)", async () => {
    const validResult = makeValidArchetypeJson();
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(validResult),
    });
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    const data = makeReportDataWithPoiOnly();
    const result = await classifyArchetype(1, data);

    expect(result).not.toBeNull();
    expect(result!.archetype).toBe("The Brownstone Belt");

    // Verify the prompt includes POI data but not census/isochrone
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain("NEARBY AMENITIES");
    expect(callArgs.prompt).toContain("Stumptown Coffee");
    expect(callArgs.prompt).not.toContain("DEMOGRAPHICS & CENSUS DATA");
    expect(callArgs.prompt).not.toContain("WALKABILITY");
    // Should note missing data sections
    expect(callArgs.prompt).toContain("demographics/housing/economic");
    expect(callArgs.prompt).toContain("walkability isochrone");
  });

  it("returns null when all data sources failed (no data to classify)", async () => {
    // When all sources fail, classifyArchetype still calls the AI, but the AI
    // receives minimal data. The function itself does not pre-check for data
    // availability — it passes whatever data exists to the AI and validates
    // the response. Simulate the AI returning invalid JSON (realistic for no data).
    mockGenerateText.mockResolvedValueOnce({
      text: '{"error": "insufficient data"}',
    });

    const data = makeReportDataAllFailed();
    const result = await classifyArchetype(1, data);

    // The AI response lacks required fields, so validation returns null
    expect(result).toBeNull();
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("still classifies when all sources failed but AI produces valid response", async () => {
    // Edge case: even with minimal data (address + coordinates only), if the
    // AI somehow produces a valid archetype, classifyArchetype accepts it.
    const validResult = makeValidArchetypeJson();
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(validResult),
    });
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    const data = makeReportDataAllFailed();
    const result = await classifyArchetype(1, data);

    // Valid AI response is accepted even with minimal input data
    expect(result).not.toBeNull();
    expect(result!.archetype).toBe("The Brownstone Belt");

    // Verify the prompt notes all sections unavailable
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain("demographics/housing/economic");
    expect(callArgs.prompt).toContain("walkability isochrone");
    expect(callArgs.prompt).toContain("nearby amenities");
  });

  it("handles census with some null fields gracefully (missing rent data)", async () => {
    const data = makeReportDataWithCensusOnly();
    // Set rent to null — simulates Census sentinel value filtering
    data.census!.housing.medianRent = null;
    data.census!.housing.medianHomeValue = null;

    const validResult = makeValidArchetypeJson();
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(validResult),
    });
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    const result = await classifyArchetype(1, data);

    expect(result).not.toBeNull();
    expect(result!.archetype).toBe("The Brownstone Belt");

    // Verify the prompt does not contain the null fields
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).not.toContain("Median rent:");
    expect(callArgs.prompt).not.toContain("Median home value:");
    // But other census data should still be present
    expect(callArgs.prompt).toContain("DEMOGRAPHICS & CENSUS DATA");
    expect(callArgs.prompt).toContain("Census tract population: 4,500");
  });

  it("handles census with null income and employment gracefully", async () => {
    const data = makeReportDataWithCensusOnly();
    data.census!.economic.medianHouseholdIncome = null;
    data.census!.economic.employmentStatus.employed = null;
    data.census!.economic.employmentStatus.unemployed = null;
    data.census!.economic.medianCommuteMinutes = null;

    const validResult = makeValidArchetypeJson();
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(validResult),
    });
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    const result = await classifyArchetype(1, data);

    expect(result).not.toBeNull();

    // Verify the prompt does not contain null economic fields
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).not.toContain("Median household income:");
    expect(callArgs.prompt).not.toContain("Unemployment rate:");
    expect(callArgs.prompt).not.toContain("Median commute time:");
    // But demographic data should still be present
    expect(callArgs.prompt).toContain("Median age: 42.1");
  });

  it("handles census with all null demographic fields", async () => {
    const data = makeReportDataWithCensusOnly();
    data.census!.demographics.totalPopulation = null;
    data.census!.demographics.medianAge = null;
    data.census!.demographics.householdTypes.totalHouseholds = null;
    data.census!.demographics.householdTypes.marriedCouple = null;
    data.census!.demographics.householdTypes.singleMale = null;
    data.census!.demographics.householdTypes.singleFemale = null;
    data.census!.demographics.householdTypes.nonFamily = null;
    data.census!.demographics.educationalAttainment.bachelorsOrHigher = null;
    data.census!.demographics.educationalAttainment.highSchoolOrHigher = null;
    data.census!.demographics.educationalAttainment.graduateOrProfessional = null;
    data.census!.demographics.raceEthnicity.white = null;
    data.census!.demographics.raceEthnicity.blackOrAfricanAmerican = null;
    data.census!.demographics.raceEthnicity.asian = null;
    data.census!.demographics.raceEthnicity.hispanicOrLatino = null;
    data.census!.demographics.raceEthnicity.twoOrMore = null;
    data.census!.demographics.raceEthnicity.other = null;

    const validResult = makeValidArchetypeJson();
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(validResult),
    });
    mockUpdateWhere.mockResolvedValueOnce(undefined);

    const result = await classifyArchetype(1, data);

    // Should still succeed — buildUserPrompt handles all-null fields
    expect(result).not.toBeNull();

    // Verify prompt has Census header but no specific demographic values
    const callArgs = mockGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toContain("DEMOGRAPHICS & CENSUS DATA");
    expect(callArgs.prompt).not.toContain("Census tract population:");
    expect(callArgs.prompt).not.toContain("Median age:");
    expect(callArgs.prompt).not.toContain("Race/ethnicity:");
    // Housing and economic sections should still be present since they have data
    expect(callArgs.prompt).toContain("HOUSING DATA");
    expect(callArgs.prompt).toContain("ECONOMIC DATA");
  });
});

// Pentagon geometry tests are consolidated in src/lib/__tests__/pentagon.test.ts

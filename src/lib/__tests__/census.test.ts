import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchCensusData } from "@/lib/census/index";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

/** FCC geocoder response with a valid block FIPS code. */
const FCC_RESPONSE = {
  results: [
    {
      block_fips: "170310801001234", // IL (17), county 031, tract 080100, block 1234
      state_fips: "17",
      county_fips: "031",
    },
  ],
};

/**
 * Build a Census ACS API response (2D array with headers + one data row).
 * Uses realistic variable names and values.
 */
function makeCensusResponse(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    // Demographics
    B01003_001E: "4500",     // total population
    B01002_001E: "34.2",     // median age
    // Household types
    B11001_001E: "2000",     // total households
    B11001_003E: "800",      // married couple
    B11001_005E: "100",      // single male
    B11001_006E: "200",      // single female
    B11001_007E: "900",      // non-family
    // Educational attainment (25+)
    B15003_001E: "3500",     // total pop 25+
    B15003_017E: "500",      // HS diploma
    B15003_018E: "80",       // GED
    B15003_019E: "120",      // some college <1yr
    B15003_020E: "200",      // some college no degree
    B15003_021E: "150",      // associate's
    B15003_022E: "1200",     // bachelors
    B15003_023E: "400",      // masters
    B15003_024E: "50",       // professional
    B15003_025E: "30",       // doctorate
    // Race/ethnicity
    B03002_001E: "4500",     // total
    B03002_003E: "2000",     // white
    B03002_004E: "800",      // black
    B03002_006E: "500",      // asian
    B03002_012E: "900",      // hispanic
    B03002_009E: "100",      // two or more
    // Housing
    B25077_001E: "350000",   // median home value
    B25064_001E: "1800",     // median rent
    B25003_002E: "1100",     // owner-occupied
    B25003_003E: "900",      // renter-occupied
    B25001_001E: "2200",     // total housing units
    // Year built
    B25034_009E: "100",      // 1940-1949
    B25034_010E: "50",       // 1939 or earlier
    B25034_008E: "150",      // 1950-1959
    B25034_007E: "200",      // 1960-1969
    B25034_006E: "300",      // 1970-1979
    B25034_005E: "250",      // 1980-1989
    B25034_004E: "180",      // 1990-1999
    B25034_003E: "350",      // 2000-2009
    B25034_002E: "200",      // 2010 or later
    // Economic
    B19013_001E: "85000",    // median household income
    // Employment
    B23025_002E: "3200",     // in labor force
    B23025_004E: "3000",     // employed
    B23025_005E: "200",      // unemployed
    // Commute means
    B08301_001E: "2800",     // total commuters
    B08301_003E: "1200",     // drove alone
    B08301_004E: "200",      // carpooled
    B08301_010E: "600",      // public transit
    B08301_019E: "300",      // walked
    B08301_021E: "400",      // worked from home
    // Commute time
    B08013_001E: "84000",    // aggregate travel time (84000 / 2800 = 30 min avg)
    // Geo identifiers appended by Census API
    state: "17",
    county: "031",
    tract: "080100",
  };

  const row = { ...defaults, ...overrides };
  const headers = Object.keys(row);
  const values = Object.values(row);

  return [headers, values];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set up fetch to respond to FCC geocoder first, then Census API.
 * Optionally override the Census response.
 */
function mockFetchSequence(censusOverrides?: Record<string, string>) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const urlStr = typeof url === "string" ? url : url.toString();

    if (urlStr.includes("geo.fcc.gov")) {
      return new Response(JSON.stringify(FCC_RESPONSE), { status: 200 });
    }

    if (urlStr.includes("api.census.gov")) {
      return new Response(
        JSON.stringify(makeCensusResponse(censusOverrides)),
        { status: 200 },
      );
    }

    return new Response("Not Found", { status: 404 });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchCensusData", () => {
  beforeEach(() => {
    vi.stubEnv("CENSUS_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("parses Census API data into structured demographics, housing, and economic sections", async () => {
    mockFetchSequence();

    const result = await fetchCensusData(41.8781, -87.6298);

    expect(result).not.toBeNull();

    // -- FIPS --
    expect(result!.fips).toEqual({
      state: "17",
      county: "031",
      tract: "080100",
    });

    // -- Demographics --
    const d = result!.demographics;
    expect(d.totalPopulation).toBe(4500);
    expect(d.medianAge).toBe(34.2);
    expect(d.householdTypes.totalHouseholds).toBe(2000);
    expect(d.householdTypes.marriedCouple).toBe(800);
    expect(d.householdTypes.nonFamily).toBe(900);

    // Education: bachelorsOrHigher = 1200 + 400 + 50 + 30 = 1680
    expect(d.educationalAttainment.bachelorsOrHigher).toBe(1680);
    // graduateOrProfessional = 400 + 50 + 30 = 480
    expect(d.educationalAttainment.graduateOrProfessional).toBe(480);
    // hsOrHigher = HS(500) + GED(80) + someCollege1(120) + someCollege2(200) + associates(150) + bachelors(1200) + masters(400) + professional(50) + doctorate(30) = 2730
    expect(d.educationalAttainment.highSchoolOrHigher).toBe(2730);

    // Race
    expect(d.raceEthnicity.white).toBe(2000);
    expect(d.raceEthnicity.blackOrAfricanAmerican).toBe(800);
    expect(d.raceEthnicity.asian).toBe(500);
    expect(d.raceEthnicity.hispanicOrLatino).toBe(900);
    expect(d.raceEthnicity.twoOrMore).toBe(100);
    // other = total(4500) - white(2000) - black(800) - asian(500) - hispanic(900) - twoOrMore(100) = 200
    expect(d.raceEthnicity.other).toBe(200);

    // -- Housing --
    const h = result!.housing;
    expect(h.medianHomeValue).toBe(350000);
    expect(h.medianRent).toBe(1800);
    expect(h.ownerOccupied).toBe(1100);
    expect(h.renterOccupied).toBe(900);
    expect(h.totalHousingUnits).toBe(2200);

    // Year built: before1950 = B25034_009E(100) + B25034_010E(50) = 150
    expect(h.yearBuilt.before1950).toBe(150);
    // from1950to1979 = 150 + 200 + 300 = 650
    expect(h.yearBuilt.from1950to1979).toBe(650);
    // from1980to1999 = 250 + 180 = 430
    expect(h.yearBuilt.from1980to1999).toBe(430);
    expect(h.yearBuilt.from2000to2009).toBe(350);
    expect(h.yearBuilt.from2010orLater).toBe(200);

    // -- Economic --
    const e = result!.economic;
    expect(e.medianHouseholdIncome).toBe(85000);
    expect(e.employmentStatus.inLaborForce).toBe(3200);
    expect(e.employmentStatus.employed).toBe(3000);
    expect(e.employmentStatus.unemployed).toBe(200);
    expect(e.commuteMeans.droveAlone).toBe(1200);
    expect(e.commuteMeans.publicTransit).toBe(600);
    expect(e.commuteMeans.walked).toBe(300);
    expect(e.commuteMeans.workedFromHome).toBe(400);
    // other commute = 2800 - 1200 - 200 - 600 - 300 - 400 = 100
    expect(e.commuteMeans.other).toBe(100);
    // mean commute = 84000 / 2800 = 30
    expect(e.medianCommuteMinutes).toBe(30);
  });

  it("includes national averages for comparison", async () => {
    mockFetchSequence();

    const result = await fetchCensusData(41.8781, -87.6298);

    const na = result!.nationalAverages;
    expect(na.demographics.medianAge).toBe(38.9);
    expect(na.housing.medianHomeValue).toBe(281_900);
    expect(na.economic.medianHouseholdIncome).toBe(75_149);
  });

  it("handles missing/null Census values gracefully", async () => {
    mockFetchSequence({
      B01003_001E: "-",       // dash = missing
      B01002_001E: "",        // empty = missing
      B25077_001E: "NaN",     // non-finite = missing
      B19013_001E: "65000",   // valid
    });

    const result = await fetchCensusData(41.8781, -87.6298);

    expect(result!.demographics.totalPopulation).toBeNull();
    expect(result!.demographics.medianAge).toBeNull();
    expect(result!.housing.medianHomeValue).toBeNull();
    expect(result!.economic.medianHouseholdIncome).toBe(65000);
  });

  it("returns null when FIPS lookup fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );

    const result = await fetchCensusData(41.8781, -87.6298);
    expect(result).toBeNull();
  });

  it("returns empty result (with FIPS) when Census API returns non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      if (urlStr.includes("geo.fcc.gov")) {
        return new Response(JSON.stringify(FCC_RESPONSE), { status: 200 });
      }
      // Census API fails
      return new Response("Server Error", { status: 500 });
    });

    const result = await fetchCensusData(41.8781, -87.6298);
    expect(result).not.toBeNull();
    // FIPS is preserved
    expect(result!.fips).toEqual({ state: "17", county: "031", tract: "080100" });
    // All data fields are null
    expect(result!.demographics.totalPopulation).toBeNull();
    expect(result!.housing.medianHomeValue).toBeNull();
    expect(result!.economic.medianHouseholdIncome).toBeNull();
  });

  it("returns empty result when Census API returns insufficient rows", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      if (urlStr.includes("geo.fcc.gov")) {
        return new Response(JSON.stringify(FCC_RESPONSE), { status: 200 });
      }
      // Only headers, no data row
      return new Response(JSON.stringify([["B01003_001E"]]), { status: 200 });
    });

    const result = await fetchCensusData(41.8781, -87.6298);
    expect(result).not.toBeNull();
    expect(result!.demographics.totalPopulation).toBeNull();
  });

  it("throws when CENSUS_API_KEY is missing", async () => {
    vi.stubEnv("CENSUS_API_KEY", "");

    // FCC geocoder must succeed first
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(FCC_RESPONSE), { status: 200 }),
    );

    await expect(fetchCensusData(41.8781, -87.6298)).rejects.toThrow(
      "CENSUS_API_KEY is not set",
    );
  });

  it("parses FIPS codes correctly from block_fips string", async () => {
    // block_fips: 170310801001234
    // state = 17, county = 031, tract = 080100
    mockFetchSequence();

    const result = await fetchCensusData(41.8781, -87.6298);
    expect(result!.fips!.state).toBe("17");
    expect(result!.fips!.county).toBe("031");
    expect(result!.fips!.tract).toBe("080100");

    // Verify the Census API was called with the right FIPS in the URL
    const fetchSpy = vi.mocked(globalThis.fetch);
    const censusCall = fetchSpy.mock.calls.find(
      (call) => String(call[0]).includes("api.census.gov"),
    );
    expect(censusCall).toBeDefined();
    const censusUrl = new URL(censusCall![0] as string);
    expect(censusUrl.searchParams.get("for")).toBe("tract:080100");
    expect(censusUrl.searchParams.get("in")).toBe("state:17 county:031");
  });
});

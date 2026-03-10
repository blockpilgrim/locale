// ---------------------------------------------------------------------------
// Census ACS 5-Year Data Client
// ---------------------------------------------------------------------------
// Flow: coordinates → FIPS codes (via FCC geocoder) → Census ACS 5-year query
//
// Fetches demographics, housing, and economic data for a census tract and
// structures it into typed sections. Handles missing fields gracefully by
// returning null for individual data points rather than throwing.
// ---------------------------------------------------------------------------

// --- Types -------------------------------------------------------------------

export interface DemographicsData {
  totalPopulation: number | null;
  medianAge: number | null;
  householdTypes: {
    totalHouseholds: number | null;
    marriedCouple: number | null;
    singleMale: number | null;
    singleFemale: number | null;
    nonFamily: number | null;
  };
  educationalAttainment: {
    highSchoolOrHigher: number | null;
    bachelorsOrHigher: number | null;
    graduateOrProfessional: number | null;
  };
  raceEthnicity: {
    white: number | null;
    blackOrAfricanAmerican: number | null;
    asian: number | null;
    hispanicOrLatino: number | null;
    twoOrMore: number | null;
    other: number | null;
  };
}

export interface HousingData {
  medianHomeValue: number | null;
  medianRent: number | null;
  ownerOccupied: number | null;
  renterOccupied: number | null;
  totalHousingUnits: number | null;
  yearBuilt: {
    before1950: number | null;
    from1950to1979: number | null;
    from1980to1999: number | null;
    from2000to2009: number | null;
    from2010orLater: number | null;
  };
}

export interface EconomicData {
  medianHouseholdIncome: number | null;
  employmentStatus: {
    inLaborForce: number | null;
    employed: number | null;
    unemployed: number | null;
  };
  commuteMeans: {
    droveAlone: number | null;
    carpooled: number | null;
    publicTransit: number | null;
    walked: number | null;
    workedFromHome: number | null;
    other: number | null;
  };
  medianCommuteMinutes: number | null;
}

export interface NationalAverages {
  demographics: {
    medianAge: number;
    totalPopulation: number;
  };
  housing: {
    medianHomeValue: number;
    medianRent: number;
    ownerOccupiedPct: number;
  };
  economic: {
    medianHouseholdIncome: number;
    unemploymentRate: number;
  };
}

export interface CensusResult {
  demographics: DemographicsData;
  housing: HousingData;
  economic: EconomicData;
  /** National averages for comparison context. */
  nationalAverages: NationalAverages;
  /** FIPS metadata for the queried location. */
  fips: {
    state: string;
    county: string;
    tract: string;
  } | null;
}

/** FIPS codes returned by the FCC geocoder. */
interface FipsResult {
  state: string;
  county: string;
  tract: string;
}

// --- Constants ---------------------------------------------------------------

// National averages (ACS 2022 5-year estimates, hardcoded for comparison).
// These are reasonable approximations and can be refreshed periodically.
const NATIONAL_AVERAGES: NationalAverages = {
  demographics: {
    medianAge: 38.9,
    totalPopulation: 331_449_281,
  },
  housing: {
    medianHomeValue: 281_900,
    medianRent: 1_163,
    ownerOccupiedPct: 64.4,
  },
  economic: {
    medianHouseholdIncome: 75_149,
    unemploymentRate: 5.3,
  },
};

// ACS 5-year dataset year. Update when newer data becomes available.
const ACS_YEAR = "2022";

// Census ACS variable codes mapped to our field names.
const CENSUS_VARIABLES = [
  // Demographics
  "B01003_001E", // total population
  "B01002_001E", // median age
  // Household types
  "B11001_001E", // total households
  "B11001_003E", // married-couple family
  "B11001_005E", // male householder, no spouse
  "B11001_006E", // female householder, no spouse
  "B11001_007E", // non-family households
  // Educational attainment (25+)
  "B15003_017E", // high school diploma
  "B15003_018E", // GED or alternative credential
  "B15003_019E", // some college, less than 1 year
  "B15003_020E", // some college, 1 or more years, no degree
  "B15003_021E", // associate's degree
  "B15003_022E", // bachelor's degree
  "B15003_023E", // master's degree
  "B15003_024E", // professional school degree
  "B15003_025E", // doctorate degree
  "B15003_001E", // total pop 25+
  // Race/ethnicity
  "B03002_003E", // white alone (not Hispanic)
  "B03002_004E", // black or African American alone (not Hispanic)
  "B03002_006E", // Asian alone (not Hispanic)
  "B03002_012E", // Hispanic or Latino
  "B03002_009E", // two or more races (not Hispanic)
  "B03002_001E", // total for race/ethnicity denominators
  // Housing
  "B25077_001E", // median home value
  "B25064_001E", // median gross rent
  "B25003_002E", // owner-occupied units
  "B25003_003E", // renter-occupied units
  "B25001_001E", // total housing units
  // Year built
  "B25034_009E", // built 1940-1949
  "B25034_010E", // built 1939 or earlier
  "B25034_007E", // built 1960-1969
  "B25034_008E", // built 1950-1959
  "B25034_005E", // built 1980-1989
  "B25034_006E", // built 1970-1979
  "B25034_004E", // built 1990-1999
  "B25034_003E", // built 2000-2009
  "B25034_002E", // built 2010 or later
  // Economic
  "B19013_001E", // median household income
  // Employment
  "B23025_002E", // in labor force
  "B23025_004E", // employed
  "B23025_005E", // unemployed
  // Commute means
  "B08301_003E", // drove alone
  "B08301_004E", // carpooled
  "B08301_010E", // public transit
  "B08301_019E", // walked
  "B08301_021E", // worked from home
  "B08301_001E", // total commuters
  // Commute time — B08013_001E is aggregate travel time to work (minutes),
  // divide by total commuters (B08301_001E) to get mean commute time.
  "B08013_001E", // aggregate travel time to work (minutes)
] as const;

// --- Helpers -----------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.CENSUS_API_KEY;
  if (!key) {
    throw new Error(
      "CENSUS_API_KEY is not set. See .env.example for required environment variables.",
    );
  }
  return key;
}

/**
 * Look up FIPS codes (state, county, tract) for a lat/lng pair using the
 * FCC Area API.
 */
async function lookupFips(
  lat: number,
  lng: number,
): Promise<FipsResult | null> {
  const url = new URL("https://geo.fcc.gov/api/census/area");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("censusYear", "2020");
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(
        `[census] FCC geocoder error: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      results?: Array<{
        block_fips?: string;
        state_fips?: string;
        county_fips?: string;
      }>;
    };

    const result = data.results?.[0];
    if (!result?.block_fips) {
      console.error("[census] FCC geocoder returned no results for", {
        lat,
        lng,
      });
      return null;
    }

    // block_fips is 15 chars: state(2) + county(3) + tract(6) + block(4)
    const blockFips = result.block_fips;
    return {
      state: blockFips.substring(0, 2),
      county: blockFips.substring(2, 5),
      tract: blockFips.substring(5, 11),
    };
  } catch (error) {
    console.error("[census] FCC geocoder request failed:", error);
    return null;
  }
}

/** Safely parse a numeric value from Census API data. Returns null for missing/invalid. */
function parseNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "-") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// --- Public API --------------------------------------------------------------

/**
 * Fetch Census ACS 5-year data for the census tract containing the given
 * coordinates.
 *
 * Returns structured demographics, housing, and economic data with national
 * averages for comparison context. Returns `null` only if the FIPS lookup
 * fails entirely; individual fields within the result may be null when data
 * is unavailable.
 */
export async function fetchCensusData(
  lat: number,
  lng: number,
): Promise<CensusResult | null> {
  // Step 1: Resolve lat/lng → FIPS codes.
  const fips = await lookupFips(lat, lng);
  if (!fips) {
    return null;
  }

  // Step 2: Fetch ACS data from Census Bureau.
  const apiKey = getApiKey();
  const variableList = CENSUS_VARIABLES.join(",");

  const url = new URL(
    `https://api.census.gov/data/${ACS_YEAR}/acs/acs5`,
  );
  url.searchParams.set("get", variableList);
  url.searchParams.set("for", `tract:${fips.tract}`);
  url.searchParams.set("in", `state:${fips.state} county:${fips.county}`);
  url.searchParams.set("key", apiKey);

  let row: Record<string, string>;

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error(
        `[census] Census API error: ${response.status} ${response.statusText}`,
      );
      return buildEmptyResult(fips);
    }

    const data = (await response.json()) as string[][];
    // First row is headers, second row is data.
    if (!data || data.length < 2) {
      console.error("[census] Census API returned no data for tract", fips);
      return buildEmptyResult(fips);
    }

    const headers = data[0];
    const values = data[1];
    row = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  } catch (error) {
    console.error("[census] Census API request failed:", error);
    return buildEmptyResult(fips);
  }

  // Step 3: Map raw Census variables to structured data.
  const v = (key: string) => parseNum(row[key]);

  // --- Demographics ---
  const hsGrad = v("B15003_017E");
  const ged = v("B15003_018E");
  const someCollege1 = v("B15003_019E");
  const someCollege2 = v("B15003_020E");
  const associates = v("B15003_021E");
  const bachelors = v("B15003_022E");
  const masters = v("B15003_023E");
  const professional = v("B15003_024E");
  const doctorate = v("B15003_025E");

  const bachelorOrHigher = sumNullable([bachelors, masters, professional, doctorate]);
  const graduateOrProfessional = sumNullable([masters, professional, doctorate]);

  // HS or higher = HS diploma + GED + some college + associate's + bachelor's+
  const hsOrHigher = sumNullable([
    hsGrad, ged, someCollege1, someCollege2, associates,
    bachelors, masters, professional, doctorate,
  ]);

  const raceTotal = v("B03002_001E");
  const whiteCount = v("B03002_003E");
  const blackCount = v("B03002_004E");
  const asianCount = v("B03002_006E");
  const hispanicCount = v("B03002_012E");
  const twoOrMoreCount = v("B03002_009E");
  const otherRace =
    raceTotal !== null
      ? (raceTotal ?? 0) -
        (whiteCount ?? 0) -
        (blackCount ?? 0) -
        (asianCount ?? 0) -
        (hispanicCount ?? 0) -
        (twoOrMoreCount ?? 0)
      : null;

  const demographics: DemographicsData = {
    totalPopulation: v("B01003_001E"),
    medianAge: v("B01002_001E"),
    householdTypes: {
      totalHouseholds: v("B11001_001E"),
      marriedCouple: v("B11001_003E"),
      singleMale: v("B11001_005E"),
      singleFemale: v("B11001_006E"),
      nonFamily: v("B11001_007E"),
    },
    educationalAttainment: {
      highSchoolOrHigher: hsOrHigher,
      bachelorsOrHigher: bachelorOrHigher,
      graduateOrProfessional: graduateOrProfessional,
    },
    raceEthnicity: {
      white: whiteCount,
      blackOrAfricanAmerican: blackCount,
      asian: asianCount,
      hispanicOrLatino: hispanicCount,
      twoOrMore: twoOrMoreCount,
      other: otherRace !== null ? Math.max(0, otherRace) : null,
    },
  };

  // --- Housing ---
  const builtBefore1950 = sumNullable([v("B25034_009E"), v("B25034_010E")]);
  const builtFrom1950to1979 = sumNullable([
    v("B25034_008E"),
    v("B25034_007E"),
    v("B25034_006E"),
  ]);
  const builtFrom1980to1999 = sumNullable([v("B25034_005E"), v("B25034_004E")]);
  const builtFrom2000to2009 = v("B25034_003E");
  const builtFrom2010orLater = v("B25034_002E");

  const housing: HousingData = {
    medianHomeValue: v("B25077_001E"),
    medianRent: v("B25064_001E"),
    ownerOccupied: v("B25003_002E"),
    renterOccupied: v("B25003_003E"),
    totalHousingUnits: v("B25001_001E"),
    yearBuilt: {
      before1950: builtBefore1950,
      from1950to1979: builtFrom1950to1979,
      from1980to1999: builtFrom1980to1999,
      from2000to2009: builtFrom2000to2009,
      from2010orLater: builtFrom2010orLater,
    },
  };

  // --- Economic ---
  const totalCommuters = v("B08301_001E");
  const droveAlone = v("B08301_003E");
  const carpooled = v("B08301_004E");
  const publicTransit = v("B08301_010E");
  const walked = v("B08301_019E");
  const workedFromHome = v("B08301_021E");
  const otherCommute =
    totalCommuters !== null
      ? (totalCommuters ?? 0) -
        (droveAlone ?? 0) -
        (carpooled ?? 0) -
        (publicTransit ?? 0) -
        (walked ?? 0) -
        (workedFromHome ?? 0)
      : null;

  // Mean commute time: aggregate travel time / total commuters.
  const aggregateTime = v("B08013_001E");
  const medianCommuteMinutes =
    aggregateTime !== null && totalCommuters !== null && totalCommuters > 0
      ? Math.round(aggregateTime / totalCommuters)
      : null;

  const economic: EconomicData = {
    medianHouseholdIncome: v("B19013_001E"),
    employmentStatus: {
      inLaborForce: v("B23025_002E"),
      employed: v("B23025_004E"),
      unemployed: v("B23025_005E"),
    },
    commuteMeans: {
      droveAlone,
      carpooled,
      publicTransit,
      walked,
      workedFromHome,
      other: otherCommute !== null ? Math.max(0, otherCommute) : null,
    },
    medianCommuteMinutes,
  };

  return {
    demographics,
    housing,
    economic,
    nationalAverages: NATIONAL_AVERAGES,
    fips,
  };
}

// --- Utilities ---------------------------------------------------------------

/** Sum an array of nullable numbers. Returns null if ALL values are null. */
function sumNullable(values: (number | null)[]): number | null {
  let sum = 0;
  let hasAny = false;
  for (const v of values) {
    if (v !== null) {
      sum += v;
      hasAny = true;
    }
  }
  return hasAny ? sum : null;
}

/** Build a result with empty data sections when Census API fails after FIPS resolved. */
function buildEmptyResult(fips: FipsResult): CensusResult {
  return {
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
    nationalAverages: NATIONAL_AVERAGES,
    fips,
  };
}

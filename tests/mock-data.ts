// ---------------------------------------------------------------------------
// Shared Mock Data Builders for Eval Scripts
// ---------------------------------------------------------------------------
// Extracted from eval-narratives.ts so that both the narrative eval and
// archetype consistency scripts can build realistic synthetic ReportData
// without duplicating 500+ lines of mock data construction.
// ---------------------------------------------------------------------------

import type { GoldenAddress } from "./golden-addresses";
import type { ReportData } from "../src/lib/report/generate";
import type { CensusResult } from "../src/lib/census/index";
import type { IsochroneResult } from "../src/lib/mapbox/isochrone";
import type { PoiResult, PointOfInterest, PoiCategorySummary } from "../src/lib/poi/index";

/**
 * Build realistic synthetic Census data appropriate for the given address type.
 */
export function buildMockCensus(addr: GoldenAddress): CensusResult {
  // Vary data based on label patterns to make prompts realistic.
  const label = addr.label;

  // Defaults (middle-class suburb baseline)
  let totalPop = 4200;
  let medianAge = 37.5;
  let totalHouseholds = 1700;
  let marriedCouple = 750;
  const singleMale = 120;
  const singleFemale = 280;
  let nonFamily = 550;
  const hsOrHigher = 3200;
  let bachelorsOrHigher = 1400;
  let gradOrProf = 350;
  let white = 2800;
  let black = 400;
  let asian = 300;
  let hispanic = 500;
  let twoOrMore = 100;
  let other = 100;
  let medianHomeValue = 280000;
  let medianRent = 1200;
  let ownerOccupied = 1000;
  let renterOccupied = 700;
  const totalHousingUnits = 1850;
  let before1950 = 200;
  let from1950to1979 = 400;
  let from1980to1999 = 500;
  let from2000to2009 = 400;
  let from2010orLater = 350;
  let medianIncome = 72000;
  const inLaborForce = 2800;
  const employed = 2650;
  let unemployed = 150;
  let droveAlone = 1500;
  const carpooled = 200;
  let publicTransit = 300;
  let walked = 150;
  let workedFromHome = 400;
  const commuteOther = 50;
  let medianCommute = 28;

  // --- Customize per archetype ---

  if (label.includes("manhattan") || label.includes("soma")) {
    totalPop = 8500;
    medianAge = 33.2;
    totalHouseholds = 5000;
    marriedCouple = 1200;
    nonFamily = 3200;
    bachelorsOrHigher = 3800;
    gradOrProf = 1200;
    medianHomeValue = 850000;
    medianRent = 3200;
    ownerOccupied = 1200;
    renterOccupied = 3800;
    medianIncome = 110000;
    publicTransit = 2500;
    droveAlone = 400;
    walked = 800;
    medianCommute = 35;
  }

  if (label.includes("brooklyn")) {
    totalPop = 6200;
    medianAge = 34.8;
    bachelorsOrHigher = 2800;
    medianHomeValue = 720000;
    medianRent = 2400;
    renterOccupied = 2800;
    ownerOccupied = 800;
    publicTransit = 1800;
    walked = 400;
    before1950 = 1500;
    from1950to1979 = 800;
    black = 1200;
    white = 2200;
    asian = 600;
    hispanic = 1500;
  }

  if (label.includes("palo-alto")) {
    totalPop = 3200;
    medianAge = 41.5;
    bachelorsOrHigher = 2400;
    gradOrProf = 1100;
    medianHomeValue = 2800000;
    medianRent = 3100;
    medianIncome = 185000;
    ownerOccupied = 1500;
    renterOccupied = 600;
    asian = 1000;
    white = 1600;
    hispanic = 300;
    before1950 = 400;
    from1950to1979 = 800;
  }

  if (label.includes("ohio") || label.includes("middle-class")) {
    totalPop = 4500;
    medianAge = 38.2;
    medianHomeValue = 240000;
    medianRent = 1050;
    droveAlone = 1800;
    publicTransit = 50;
    workedFromHome = 350;
    white = 3500;
    black = 350;
    hispanic = 250;
    asian = 200;
  }

  if (label.includes("college-town") || label.includes("ann-arbor")) {
    totalPop = 5800;
    medianAge = 26.4;
    nonFamily = 3200;
    marriedCouple = 400;
    renterOccupied = 2800;
    ownerOccupied = 500;
    medianRent = 1350;
    medianHomeValue = 380000;
    bachelorsOrHigher = 3000;
    walked = 800;
    publicTransit = 500;
  }

  if (label.includes("rural") || label.includes("galena")) {
    totalPop = 1200;
    totalHouseholds = 600;
    medianAge = 48.5;
    medianHomeValue = 180000;
    medianRent = 750;
    droveAlone = 400;
    publicTransit = 5;
    walked = 20;
    before1950 = 300;
    from1950to1979 = 150;
    from2010orLater = 30;
  }

  if (label.includes("gentrifying") || label.includes("logan")) {
    totalPop = 5500;
    medianAge = 32.1;
    medianHomeValue = 420000;
    medianRent = 1650;
    renterOccupied = 2200;
    ownerOccupied = 800;
    hispanic = 1800;
    white = 2200;
    before1950 = 600;
    from1950to1979 = 800;
    from2010orLater = 200;
  }

  if (label.includes("round-rock") || label.includes("new-development")) {
    totalPop = 6800;
    medianAge = 33.5;
    marriedCouple = 1800;
    medianHomeValue = 350000;
    medianRent = 1600;
    from2010orLater = 1200;
    from2000to2009 = 800;
    before1950 = 20;
    droveAlone = 2200;
    publicTransit = 30;
    medianIncome = 95000;
    hispanic = 1800;
    white = 3200;
    asian = 600;
  }

  if (label.includes("retirement") || label.includes("sarasota")) {
    totalPop = 3800;
    medianAge = 58.2;
    marriedCouple = 1200;
    nonFamily = 600;
    ownerOccupied = 1800;
    renterOccupied = 400;
    medianHomeValue = 320000;
    medianRent = 1400;
    medianIncome = 55000;
    unemployed = 50;
    workedFromHome = 300;
  }

  if (label.includes("philly") || label.includes("center-city")) {
    totalPop = 7200;
    medianAge = 34.0;
    medianHomeValue = 380000;
    medianRent = 1700;
    renterOccupied = 3000;
    ownerOccupied = 1200;
    publicTransit = 1400;
    walked = 600;
    before1950 = 1800;
    black = 1800;
    white = 2800;
    hispanic = 800;
    asian = 600;
  }

  if (label.includes("industrial") || label.includes("brighton")) {
    totalPop = 4800;
    medianAge = 29.5;
    medianHomeValue = 180000;
    medianRent = 900;
    medianIncome = 42000;
    hispanic = 3200;
    white = 800;
    black = 400;
    droveAlone = 1600;
    publicTransit = 300;
    before1950 = 800;
    from1950to1979 = 600;
  }

  if (label.includes("charleston") || label.includes("historic")) {
    totalPop = 3500;
    medianAge = 42.0;
    medianHomeValue = 680000;
    medianRent = 1800;
    before1950 = 1200;
    from1950to1979 = 400;
    from2010orLater = 100;
    white = 2400;
    black = 800;
    walked = 400;
  }

  if (label.includes("hermosa") || label.includes("coastal")) {
    totalPop = 2800;
    medianAge = 35.5;
    medianHomeValue = 1450000;
    medianRent = 2800;
    ownerOccupied = 900;
    renterOccupied = 1100;
    medianIncome = 125000;
    white = 2000;
    asian = 300;
    hispanic = 300;
    walked = 300;
    droveAlone = 800;
  }

  if (label.includes("vail") || label.includes("mountain")) {
    totalPop = 800;
    totalHouseholds = 450;
    medianAge = 38.0;
    medianHomeValue = 1200000;
    medianRent = 2200;
    medianIncome = 78000;
    ownerOccupied = 200;
    renterOccupied = 250;
    white = 680;
    hispanic = 80;
    from2000to2009 = 100;
    from2010orLater = 80;
  }

  if (label.includes("killeen") || label.includes("military")) {
    totalPop = 5200;
    medianAge = 27.8;
    renterOccupied = 2200;
    ownerOccupied = 800;
    medianHomeValue = 165000;
    medianRent = 950;
    medianIncome = 48000;
    black = 1500;
    white = 1800;
    hispanic = 1200;
    from2000to2009 = 600;
    from2010orLater = 400;
  }

  if (label.includes("jackson-heights") || label.includes("immigrant")) {
    totalPop = 9200;
    medianAge = 36.0;
    renterOccupied = 4500;
    ownerOccupied = 500;
    medianHomeValue = 550000;
    medianRent = 1800;
    hispanic = 3500;
    asian = 2800;
    white = 1200;
    black = 600;
    other = 500;
    twoOrMore = 600;
    publicTransit = 3000;
    walked = 400;
    droveAlone = 600;
  }

  if (label.includes("portland") || label.includes("arts-district")) {
    totalPop = 4200;
    medianAge = 35.2;
    bachelorsOrHigher = 2600;
    medianHomeValue = 520000;
    medianRent = 1900;
    renterOccupied = 2000;
    ownerOccupied = 600;
    walked = 500;
    publicTransit = 400;
    from1980to1999 = 200;
    from2000to2009 = 400;
    from2010orLater = 600;
    white = 3200;
    asian = 350;
    hispanic = 350;
  }

  if (label.includes("seattle") || label.includes("tech-hub")) {
    totalPop = 5500;
    medianAge = 33.0;
    bachelorsOrHigher = 3500;
    gradOrProf = 1200;
    medianHomeValue = 680000;
    medianRent = 2400;
    medianIncome = 140000;
    renterOccupied = 2800;
    ownerOccupied = 800;
    from2010orLater = 1500;
    from2000to2009 = 600;
    walked = 500;
    publicTransit = 600;
    white = 3000;
    asian = 1200;
    black = 300;
    hispanic = 500;
  }

  if (label.includes("dearborn") || label.includes("working-class")) {
    totalPop = 4800;
    medianAge = 35.0;
    medianHomeValue = 155000;
    medianRent = 850;
    medianIncome = 52000;
    ownerOccupied = 1400;
    renterOccupied = 900;
    droveAlone = 1800;
    publicTransit = 80;
    before1950 = 600;
    from1950to1979 = 800;
    white = 2200;
    asian = 200;
    black = 800;
    hispanic = 300;
    other = 1100; // Arab-American community (Census "other")
  }

  return {
    demographics: {
      totalPopulation: totalPop,
      medianAge,
      householdTypes: {
        totalHouseholds,
        marriedCouple,
        singleMale,
        singleFemale,
        nonFamily,
      },
      educationalAttainment: {
        highSchoolOrHigher: hsOrHigher,
        bachelorsOrHigher,
        graduateOrProfessional: gradOrProf,
      },
      raceEthnicity: {
        white,
        blackOrAfricanAmerican: black,
        asian,
        hispanicOrLatino: hispanic,
        twoOrMore,
        other,
      },
    },
    housing: {
      medianHomeValue,
      medianRent,
      ownerOccupied,
      renterOccupied,
      totalHousingUnits,
      yearBuilt: {
        before1950,
        from1950to1979,
        from1980to1999,
        from2000to2009,
        from2010orLater,
      },
    },
    economic: {
      medianHouseholdIncome: medianIncome,
      employmentStatus: {
        inLaborForce,
        employed,
        unemployed,
      },
      commuteMeans: {
        droveAlone,
        carpooled,
        publicTransit,
        walked,
        workedFromHome,
        other: commuteOther,
      },
      medianCommuteMinutes: medianCommute,
    },
    nationalAverages: {
      demographics: { medianAge: 38.9, totalPopulation: 331_449_281 },
      housing: { medianHomeValue: 281_900, medianRent: 1_163, ownerOccupiedPct: 64.4 },
      economic: { medianHouseholdIncome: 75_149, unemploymentRate: 5.3 },
    },
    fips: { state: "17", county: "031", tract: "010100" },
  };
}

/**
 * Build synthetic isochrone data scaled to area type.
 */
export function buildMockIsochrone(addr: GoldenAddress): IsochroneResult {
  const label = addr.label;
  // Urban areas get bigger isochrone polygons (more walkable area).
  const isUrban = label.includes("manhattan") || label.includes("brooklyn") ||
    label.includes("soma") || label.includes("philly") || label.includes("jackson") ||
    label.includes("seattle");
  const isRural = label.includes("rural") || label.includes("galena") ||
    label.includes("vail") || label.includes("killeen");

  const scale = isUrban ? 0.015 : isRural ? 0.005 : 0.01;
  const lat = addr.lat;
  const lng = addr.lng;

  function makePolygon(minutes: number): number[][][] {
    const s = scale * (minutes / 5);
    return [[
      [lng - s, lat - s],
      [lng + s, lat - s],
      [lng + s, lat + s],
      [lng - s, lat + s],
      [lng - s, lat - s],
    ]];
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { contour: 5, color: "#6706ce", opacity: 0.33, metric: "contour" },
        geometry: { type: "Polygon", coordinates: makePolygon(5) },
      },
      {
        type: "Feature",
        properties: { contour: 10, color: "#04e813", opacity: 0.33, metric: "contour" },
        geometry: { type: "Polygon", coordinates: makePolygon(10) },
      },
      {
        type: "Feature",
        properties: { contour: 15, color: "#4286f4", opacity: 0.33, metric: "contour" },
        geometry: { type: "Polygon", coordinates: makePolygon(15) },
      },
    ],
  };
}

/**
 * Build synthetic POI data appropriate for the address type.
 */
export function buildMockPoi(addr: GoldenAddress): PoiResult {
  const label = addr.label;
  const lat = addr.lat;
  const lng = addr.lng;

  const isUrban = label.includes("manhattan") || label.includes("brooklyn") ||
    label.includes("soma") || label.includes("philly") || label.includes("jackson") ||
    label.includes("seattle") || label.includes("portland");
  const isRural = label.includes("rural") || label.includes("galena") ||
    label.includes("vail");

  // Build a set of POIs based on area type
  const pois: PointOfInterest[] = [];
  let nextId = 1;

  function addPoi(
    name: string,
    category: PointOfInterest["category"],
    osmTag: string,
    dist: number,
  ) {
    pois.push({
      id: nextId++,
      name,
      category,
      osmTag,
      latitude: lat + ((nextId * 0.0013) % 0.01) - 0.005,
      longitude: lng + ((nextId * 0.0017) % 0.01) - 0.005,
      distanceMeters: dist,
      walkingMinutes: Math.ceil(dist / 80),
    });
  }

  if (isUrban) {
    // Dense POI set
    addPoi("Corner Cafe", "dining", "cafe", 80);
    addPoi("Neighborhood Bistro", "dining", "restaurant", 150);
    addPoi("Pho Express", "dining", "restaurant", 200);
    addPoi("Taco Stand", "dining", "fast_food", 250);
    addPoi("Pizza Palace", "dining", "restaurant", 300);
    addPoi("Sushi Bar", "dining", "restaurant", 350);
    addPoi("Fresh Mart", "groceries", "supermarket", 120);
    addPoi("Corner Store", "groceries", "convenience", 90);
    addPoi("Organic Bakery", "groceries", "bakery", 200);
    addPoi("City Park", "parks", "park", 180);
    addPoi("Pocket Park", "parks", "garden", 300);
    addPoi("Community Playground", "parks", "playground", 400);
    addPoi("FitLife Gym", "fitness", "fitness_centre", 250);
    addPoi("Yoga Studio", "fitness", "fitness_centre", 350);
    addPoi("The Dive Bar", "nightlife", "bar", 200);
    addPoi("Cocktail Lounge", "nightlife", "bar", 350);
    addPoi("Night Owl Club", "nightlife", "nightclub", 500);
    addPoi("CVS Pharmacy", "healthcare", "pharmacy", 150);
    addPoi("Urgent Care Clinic", "healthcare", "clinic", 400);
    addPoi("Vintage Threads", "shopping", "clothes", 250);
    addPoi("Indie Bookstore", "shopping", "books", 300);
    addPoi("Public Library", "education", "library", 350);
    addPoi("PS 42 Elementary", "education", "school", 500);
  } else if (isRural) {
    // Sparse POI set
    addPoi("Main Street Diner", "dining", "restaurant", 300);
    addPoi("General Store", "groceries", "convenience", 400);
    addPoi("Town Square Park", "parks", "park", 250);
    addPoi("County Library", "education", "library", 600);
  } else {
    // Suburban POI set
    addPoi("Local Coffee Shop", "dining", "cafe", 200);
    addPoi("Family Restaurant", "dining", "restaurant", 350);
    addPoi("Burger Joint", "dining", "fast_food", 400);
    addPoi("Grocery Store", "groceries", "supermarket", 300);
    addPoi("Quick Mart", "groceries", "convenience", 250);
    addPoi("Neighborhood Park", "parks", "park", 350);
    addPoi("Sports Complex", "fitness", "sports_centre", 500);
    addPoi("Walgreens", "healthcare", "pharmacy", 400);
    addPoi("Elementary School", "education", "school", 450);
    addPoi("Shopping Center", "shopping", "department_store", 600);
  }

  // Sort by distance
  pois.sort((a, b) => a.distanceMeters - b.distanceMeters);

  // Group by category
  const categories: PointOfInterest["category"][] = [
    "dining", "groceries", "parks", "fitness", "nightlife",
    "healthcare", "shopping", "education",
  ];

  const byCategory: PoiCategorySummary[] = categories.map((cat) => {
    const items = pois.filter((p) => p.category === cat);
    return { category: cat, count: items.length, items };
  });

  const nearestGrocery = pois.find(
    (p) => p.category === "groceries" &&
      (p.osmTag === "supermarket" || p.osmTag === "convenience"),
  ) ?? null;

  const nearestPharmacy = pois.find(
    (p) => p.category === "healthcare" && p.osmTag === "pharmacy",
  ) ?? null;

  const nearestPark = pois.find((p) => p.category === "parks") ?? null;

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

/**
 * Build a complete ReportData object for a golden address.
 */
export function buildReportData(addr: GoldenAddress): ReportData {
  return {
    address: {
      full: addr.address,
      city: addr.address.split(",")[1]?.trim(),
      state: addr.address.match(/,\s*([A-Z]{2})\s/)?.[1],
      zip: addr.address.match(/\d{5}$/)?.[0],
    },
    coordinates: {
      latitude: addr.lat,
      longitude: addr.lng,
    },
    census: buildMockCensus(addr),
    isochrone: buildMockIsochrone(addr),
    poi: buildMockPoi(addr),
    availableSections: {
      census: true,
      isochrone: true,
      poi: true,
    },
    archetype: null,
    fetchedAt: new Date().toISOString(),
  };
}

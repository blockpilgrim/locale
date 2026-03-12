#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// Golden Dataset Prompt Evaluation Script (T7.1 + T6.1)
// ---------------------------------------------------------------------------
// Generates AI narrative prompts and archetype classifications for 20 diverse
// US addresses. Optionally calls the Anthropic API to produce actual outputs.
//
// Usage:
//   npx tsx tests/eval-narratives.ts          # Output prompts only (default)
//   npx tsx tests/eval-narratives.ts --live   # Call AI and generate narratives + archetypes
//
// Outputs:
//   tests/output/prompts/<label>.txt                   # Constructed user prompts
//   tests/output/prompts/_system-prompt.txt            # Narrative system prompt
//   tests/output/prompts/_archetype-system-prompt.txt  # Archetype system prompt
//   tests/output/narratives/<label>.txt                # AI-generated narratives (--live only)
//   tests/output/archetypes/<label>.json               # AI-generated archetypes (--live only)
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import { goldenAddresses, type GoldenAddress } from "./golden-addresses";

// We import the prompt builders from the source code directly.
// This requires the path alias to resolve, which tsx + tsconfig handles.
import { buildSystemPrompt, buildUserPrompt } from "../src/lib/report/narrative";
import { buildArchetypeSystemPrompt, validateArchetypeResult } from "../src/lib/report/archetype";
import type { ReportData, ArchetypeResult } from "../src/lib/report/generate";
import type { CensusResult } from "../src/lib/census/index";
import type { IsochroneResult } from "../src/lib/mapbox/isochrone";
import type { PoiResult, PointOfInterest, PoiCategorySummary } from "../src/lib/poi/index";

// --- CLI args ----------------------------------------------------------------

const isLive = process.argv.includes("--live");

// --- Output directories ------------------------------------------------------

const OUTPUT_DIR = path.resolve(__dirname, "output");
const PROMPTS_DIR = path.join(OUTPUT_DIR, "prompts");
const NARRATIVES_DIR = path.join(OUTPUT_DIR, "narratives");
const ARCHETYPES_DIR = path.join(OUTPUT_DIR, "archetypes");

fs.mkdirSync(PROMPTS_DIR, { recursive: true });
if (isLive) {
  fs.mkdirSync(NARRATIVES_DIR, { recursive: true });
  fs.mkdirSync(ARCHETYPES_DIR, { recursive: true });
}

// --- Mock data builders ------------------------------------------------------

/**
 * Build realistic synthetic Census data appropriate for the given address type.
 */
function buildMockCensus(addr: GoldenAddress): CensusResult {
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
function buildMockIsochrone(addr: GoldenAddress): IsochroneResult {
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
function buildMockPoi(addr: GoldenAddress): PoiResult {
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
function buildReportData(addr: GoldenAddress): ReportData {
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

// --- Main execution ----------------------------------------------------------

async function main() {
  const systemPrompt = buildSystemPrompt();
  console.log(`Processing ${goldenAddresses.length} golden addresses...\n`);

  // Write the system prompts once (shared across all addresses)
  const systemPromptPath = path.join(PROMPTS_DIR, "_system-prompt.txt");
  fs.writeFileSync(systemPromptPath, systemPrompt, "utf-8");
  console.log(`Narrative system prompt: ${systemPromptPath}`);

  const archetypeSystemPrompt = buildArchetypeSystemPrompt();
  const archetypeSystemPromptPath = path.join(PROMPTS_DIR, "_archetype-system-prompt.txt");
  fs.writeFileSync(archetypeSystemPromptPath, archetypeSystemPrompt, "utf-8");
  console.log(`Archetype system prompt: ${archetypeSystemPromptPath}`);

  for (const addr of goldenAddresses) {
    const data = buildReportData(addr);
    const userPrompt = buildUserPrompt(data);

    // Write the prompt
    const promptPath = path.join(PROMPTS_DIR, `${addr.label}.txt`);
    const fullPrompt = [
      `=== GOLDEN ADDRESS: ${addr.label} ===`,
      `Address: ${addr.address}`,
      `Description: ${addr.description}`,
      `Expected themes: ${addr.expectedThemes.join(", ")}`,
      "",
      "=== SYSTEM PROMPT ===",
      systemPrompt,
      "",
      "=== USER PROMPT ===",
      userPrompt,
    ].join("\n");

    fs.writeFileSync(promptPath, fullPrompt, "utf-8");
    console.log(`  Prompt: ${addr.label}`);

    // If --live, call the Anthropic API
    if (isLive) {
      try {
        const narrative = await generateNarrativeLive(systemPrompt, userPrompt);
        const narrativePath = path.join(NARRATIVES_DIR, `${addr.label}.txt`);
        const output = [
          `=== ${addr.label} ===`,
          `Address: ${addr.address}`,
          `Expected themes: ${addr.expectedThemes.join(", ")}`,
          "",
          "=== NARRATIVE ===",
          narrative,
        ].join("\n");
        fs.writeFileSync(narrativePath, output, "utf-8");
        console.log(`  Narrative: ${addr.label} (${narrative.length} chars)`);
      } catch (err) {
        console.error(`  FAILED narrative: ${addr.label}:`, err);
      }

      // Archetype classification (same user prompt, different system prompt)
      try {
        const rawArchetype = await classifyArchetypeLive(archetypeSystemPrompt, userPrompt);

        // Strip markdown fencing if present (defensive, same as archetype.ts)
        let jsonStr = rawArchetype.trim();
        const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) {
          jsonStr = fenceMatch[1].trim();
        }

        let parsed: unknown;
        let archetype: ArchetypeResult | null = null;
        try {
          parsed = JSON.parse(jsonStr);
          archetype = validateArchetypeResult(parsed);
        } catch {
          parsed = null;
        }

        const archetypePath = path.join(ARCHETYPES_DIR, `${addr.label}.json`);
        const archetypeOutput = {
          label: addr.label,
          address: addr.address,
          description: addr.description,
          expectedThemes: addr.expectedThemes,
          rawResponse: rawArchetype,
          archetype,
        };
        fs.writeFileSync(archetypePath, JSON.stringify(archetypeOutput, null, 2), "utf-8");

        if (archetype) {
          console.log(`  Archetype: ${addr.label} → ${archetype.archetype}`);
        } else {
          console.log(`  Archetype: ${addr.label} → VALIDATION FAILED`);
        }
      } catch (err) {
        console.error(`  FAILED archetype: ${addr.label}:`, err);
      }
    }
  }

  console.log(`\nDone. Prompts written to: ${PROMPTS_DIR}`);
  if (isLive) {
    console.log(`Narratives written to: ${NARRATIVES_DIR}`);
    console.log(`Archetypes written to: ${ARCHETYPES_DIR}`);
  } else {
    console.log("Run with --live to generate AI narratives and archetypes (requires ANTHROPIC_API_KEY).");
  }
}

/**
 * Call the Anthropic API directly to generate a narrative.
 * Only used with --live flag.
 */
async function generateNarrativeLive(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required for --live mode",
    );
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  return data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/**
 * Call the Anthropic API directly to classify an archetype.
 * Only used with --live flag.
 */
async function classifyArchetypeLive(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required for --live mode",
    );
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  return data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

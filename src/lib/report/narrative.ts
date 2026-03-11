// ---------------------------------------------------------------------------
// AI Narrative Prompt + Streaming (T2.2)
// ---------------------------------------------------------------------------
// Constructs the Claude prompt from structured report data and streams the
// AI response. On stream completion, updates the report row in the DB with
// the final narrative and status: "complete".
//
// Uses the Vercel AI SDK with the Anthropic provider.
// Model: claude-sonnet-4-6 (per BUILD-STRATEGY.md)
// ---------------------------------------------------------------------------

import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reports } from "@/lib/db/schema";
import type { ReportData } from "./generate";

// --- Env validation ----------------------------------------------------------

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. See .env.example for required environment variables.",
    );
  }
  return key;
}

// --- Prompt construction -----------------------------------------------------

/**
 * Build the system prompt that establishes the AI's voice and constraints.
 */
function buildSystemPrompt(): string {
  return `You are a knowledgeable local friend writing a neighborhood profile for someone considering moving to or learning about a specific area. Your tone is warm, specific, candid, and conversational — like a trusted friend who happens to know a lot about this place.

VOICE GUIDELINES:
- Write as if you are talking to a friend over coffee, explaining what it is really like to live in this specific spot
- Be specific: reference actual data points (numbers, distances, categories) when they support your narrative
- Be honest about tradeoffs and shortcomings — never use generic boosterism
- Acknowledge what the data shows AND what it does not show
- Make the neighborhood feel distinct — avoid descriptions that could apply to any neighborhood

STRICTLY AVOID these words and phrases:
- "bustling", "vibrant", "tapestry", "diverse tapestry", "rich tapestry"
- "hidden gem", "best-kept secret", "up-and-coming"
- "offers something for everyone", "there is something for everyone"
- "nestled", "boasts", "plethora"
- Generic superlatives without supporting data

STRUCTURE:
- Open with a 1-2 sentence hook that captures the single most distinctive or useful insight about this place. No preamble, no "if you had to describe..." framing. Just the insight, direct and specific.
- Follow with 4-5 focused paragraphs. Each paragraph addresses ONE theme — do not combine demographics with housing, or walkability with commute patterns.
- Each paragraph after the opening hook must start with a bold lead-in: 2-4 words wrapped in **double asterisks**, followed by a period, then the content continues in the same paragraph. For example: **Who lives here.** The median age is...
- Vary paragraph length for rhythm. A punchy 2-3 sentence paragraph between longer ones creates breathing room and scannability. Not every section needs equal length.
- End with honest tradeoffs — shortcomings, what to consider before moving here, and a sense of trajectory (stable, changing, emerging) if the data supports it.

PARAGRAPH THEMES (choose 4-5 based on what the data best supports — not necessarily all):
- Character / personality — what makes this area feel like itself
- Who lives here — demographics, community composition, household types
- Housing picture — affordability, stock age, ownership vs. renting
- Day-to-day — walkability, nearby amenities, schools, daily errands
- Getting around — commute patterns, car dependency, transit options
- The honest tradeoffs — shortcomings, risks, considerations, trajectory

FORMAT:
- Use **double asterisks** for bold lead-ins ONLY at the start of each paragraph (not in the opening hook, and not elsewhere in the text).
- Plain text throughout — no markdown headers, bullet lists, or other formatting.
- Separate paragraphs with blank lines.

HANDLING MISSING DATA:
- If a data section is missing, simply do not reference it — do not call attention to its absence
- Never fabricate or guess at data that was not provided
- Work with whatever data is available to create the most helpful portrait possible`;
}

/**
 * Build the user prompt with the actual location data.
 */
function buildUserPrompt(data: ReportData): string {
  const parts: string[] = [];

  // Location header
  parts.push(
    `Write a neighborhood profile for: ${data.address.full}`,
  );
  if (data.address.city || data.address.state) {
    const location = [data.address.city, data.address.state]
      .filter(Boolean)
      .join(", ");
    parts.push(`Location: ${location}`);
  }
  parts.push(
    `Coordinates: ${data.coordinates.latitude}, ${data.coordinates.longitude}`,
  );
  parts.push("");

  // Census data
  if (data.census) {
    parts.push("=== DEMOGRAPHICS & CENSUS DATA ===");

    const demo = data.census.demographics;
    if (demo.totalPopulation !== null) {
      parts.push(`Census tract population: ${demo.totalPopulation.toLocaleString()}`);
    }
    if (demo.medianAge !== null) {
      parts.push(
        `Median age: ${demo.medianAge} (national avg: ${data.census.nationalAverages.demographics.medianAge})`,
      );
    }

    // Household composition
    const hh = demo.householdTypes;
    if (hh.totalHouseholds !== null) {
      parts.push(`Total households: ${hh.totalHouseholds.toLocaleString()}`);
      const types: string[] = [];
      if (hh.marriedCouple !== null) types.push(`married couples: ${hh.marriedCouple}`);
      if (hh.nonFamily !== null) types.push(`non-family: ${hh.nonFamily}`);
      if (hh.singleMale !== null) types.push(`single male householder: ${hh.singleMale}`);
      if (hh.singleFemale !== null) types.push(`single female householder: ${hh.singleFemale}`);
      if (types.length > 0) parts.push(`Household breakdown: ${types.join(", ")}`);
    }

    // Education
    const edu = demo.educationalAttainment;
    if (edu.bachelorsOrHigher !== null && hh.totalHouseholds !== null) {
      // Use total population 25+ if available, approximate otherwise
      parts.push(
        `Education: bachelor's degree or higher: ${edu.bachelorsOrHigher} residents`,
      );
    }
    if (edu.graduateOrProfessional !== null) {
      parts.push(
        `Graduate/professional degree: ${edu.graduateOrProfessional} residents`,
      );
    }

    // Race/ethnicity
    const race = demo.raceEthnicity;
    const raceEntries: string[] = [];
    if (race.white !== null) raceEntries.push(`White: ${race.white}`);
    if (race.blackOrAfricanAmerican !== null) raceEntries.push(`Black/African American: ${race.blackOrAfricanAmerican}`);
    if (race.asian !== null) raceEntries.push(`Asian: ${race.asian}`);
    if (race.hispanicOrLatino !== null) raceEntries.push(`Hispanic/Latino: ${race.hispanicOrLatino}`);
    if (race.twoOrMore !== null) raceEntries.push(`Two or more races: ${race.twoOrMore}`);
    if (race.other !== null && race.other > 0) raceEntries.push(`Other: ${race.other}`);
    if (raceEntries.length > 0) parts.push(`Race/ethnicity: ${raceEntries.join(", ")}`);

    parts.push("");
    parts.push("=== HOUSING DATA ===");

    const housing = data.census.housing;
    if (housing.medianHomeValue !== null) {
      parts.push(
        `Median home value: $${housing.medianHomeValue.toLocaleString()} (national avg: $${data.census.nationalAverages.housing.medianHomeValue.toLocaleString()})`,
      );
    }
    if (housing.medianRent !== null) {
      parts.push(
        `Median rent: $${housing.medianRent.toLocaleString()}/month (national avg: $${data.census.nationalAverages.housing.medianRent.toLocaleString()})`,
      );
    }
    if (housing.ownerOccupied !== null && housing.renterOccupied !== null) {
      const total = housing.ownerOccupied + housing.renterOccupied;
      if (total > 0) {
        const ownerPct = Math.round((housing.ownerOccupied / total) * 100);
        parts.push(
          `Owner-occupied: ${ownerPct}% (national avg: ${data.census.nationalAverages.housing.ownerOccupiedPct}%)`,
        );
      }
    }

    // Year built
    const yb = housing.yearBuilt;
    const ybEntries: string[] = [];
    if (yb.before1950 !== null) ybEntries.push(`Pre-1950: ${yb.before1950}`);
    if (yb.from1950to1979 !== null) ybEntries.push(`1950-1979: ${yb.from1950to1979}`);
    if (yb.from1980to1999 !== null) ybEntries.push(`1980-1999: ${yb.from1980to1999}`);
    if (yb.from2000to2009 !== null) ybEntries.push(`2000-2009: ${yb.from2000to2009}`);
    if (yb.from2010orLater !== null) ybEntries.push(`2010+: ${yb.from2010orLater}`);
    if (ybEntries.length > 0) parts.push(`Housing age: ${ybEntries.join(", ")}`);

    parts.push("");
    parts.push("=== ECONOMIC DATA ===");

    const econ = data.census.economic;
    if (econ.medianHouseholdIncome !== null) {
      parts.push(
        `Median household income: $${econ.medianHouseholdIncome.toLocaleString()} (national avg: $${data.census.nationalAverages.economic.medianHouseholdIncome.toLocaleString()})`,
      );
    }

    const emp = econ.employmentStatus;
    if (emp.employed !== null && emp.unemployed !== null) {
      const laborForce = (emp.employed ?? 0) + (emp.unemployed ?? 0);
      if (laborForce > 0) {
        const unempRate = ((emp.unemployed / laborForce) * 100).toFixed(1);
        parts.push(
          `Unemployment rate: ${unempRate}% (national avg: ${data.census.nationalAverages.economic.unemploymentRate}%)`,
        );
      }
    }

    // Commute
    const commute = econ.commuteMeans;
    const commuteEntries: string[] = [];
    if (commute.droveAlone !== null) commuteEntries.push(`drove alone: ${commute.droveAlone}`);
    if (commute.carpooled !== null) commuteEntries.push(`carpooled: ${commute.carpooled}`);
    if (commute.publicTransit !== null) commuteEntries.push(`public transit: ${commute.publicTransit}`);
    if (commute.walked !== null) commuteEntries.push(`walked: ${commute.walked}`);
    if (commute.workedFromHome !== null) commuteEntries.push(`work from home: ${commute.workedFromHome}`);
    if (commuteEntries.length > 0) parts.push(`Commute modes: ${commuteEntries.join(", ")}`);
    if (econ.medianCommuteMinutes !== null) {
      parts.push(`Median commute time: ${econ.medianCommuteMinutes} minutes`);
    }

    parts.push("");
  }

  // Isochrone data
  if (data.isochrone) {
    parts.push("=== WALKABILITY (ISOCHRONE DATA) ===");
    for (const feature of data.isochrone.features) {
      const minutes = feature.properties.contour;
      const areaSqKm = computePolygonAreaSqKm(feature.geometry.coordinates);
      if (areaSqKm !== null) {
        parts.push(
          `${minutes}-minute walking area: ~${areaSqKm.toFixed(2)} sq km`,
        );
      } else {
        parts.push(`${minutes}-minute walking isochrone available`);
      }
    }
    parts.push("");
  }

  // POI data
  if (data.poi) {
    parts.push("=== NEARBY AMENITIES (within ~1km) ===");
    parts.push(`Total POIs found: ${data.poi.totalCount}`);
    parts.push("");

    for (const cat of data.poi.byCategory) {
      if (cat.count === 0) continue;
      parts.push(`${cat.category.toUpperCase()} (${cat.count}):`);
      // List up to 8 named items per category
      const named = cat.items.filter((i) => i.name).slice(0, 8);
      for (const item of named) {
        parts.push(
          `  - ${item.name} (${item.osmTag}, ${item.walkingMinutes} min walk)`,
        );
      }
      const remaining = cat.count - named.length;
      if (remaining > 0) {
        parts.push(`  + ${remaining} more`);
      }
    }

    parts.push("");
    parts.push("NEAREST ESSENTIALS:");
    const ess = data.poi.nearestEssentials;
    if (ess.grocery) {
      parts.push(
        `  Nearest grocery: ${ess.grocery.name || "unnamed"} (${ess.grocery.walkingMinutes} min walk)`,
      );
    } else {
      parts.push("  Nearest grocery: none found within search radius");
    }
    if (ess.pharmacy) {
      parts.push(
        `  Nearest pharmacy: ${ess.pharmacy.name || "unnamed"} (${ess.pharmacy.walkingMinutes} min walk)`,
      );
    } else {
      parts.push("  Nearest pharmacy: none found within search radius");
    }
    if (ess.park) {
      parts.push(
        `  Nearest park: ${ess.park.name || "unnamed"} (${ess.park.walkingMinutes} min walk)`,
      );
    } else {
      parts.push("  Nearest park: none found within search radius");
    }
    parts.push("");
  }

  // Data availability summary
  const missing: string[] = [];
  if (!data.census) missing.push("demographics/housing/economic");
  if (!data.isochrone) missing.push("walkability isochrone");
  if (!data.poi) missing.push("nearby amenities");
  if (missing.length > 0) {
    parts.push(
      `NOTE: The following data sections were unavailable for this location: ${missing.join(", ")}. Write your narrative using only the data provided above. Do not mention missing data.`,
    );
  }

  return parts.join("\n");
}

// --- Streaming narrative generation ------------------------------------------

/**
 * Generate an AI narrative from report data and persist it to the DB.
 *
 * Streams text from the Anthropic API, awaits the full response, and updates
 * the report row with the narrative and status "complete". On failure, sets
 * status to "failed". Called from the dedicated narrative endpoint
 * (POST /api/report/[slug]/narrative).
 *
 * @param reportId - The database ID of the report to update on completion.
 * @param data - The structured report data to narrate.
 */
export async function generateNarrative(
  reportId: number,
  data: ReportData,
) {
  // Fail fast if ANTHROPIC_API_KEY is missing. The Anthropic provider reads
  // the key from the environment internally; this call is purely for validation.
  getApiKey();

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(data),
    maxOutputTokens: 2000,
    temperature: 0.7,
  });

  // Await full stream consumption and DB persistence. The caller (route
  // handler) is responsible for scheduling this via next/server `after()` so
  // the work survives after the HTTP response is sent.
  await collectAndPersistNarrative(reportId, result);

  return result;
}

/** The return type of streamText(), used for the persistence helper. */
type StreamResult = Awaited<ReturnType<typeof streamText>>;

/**
 * Await the full text from the stream and persist it to the database.
 */
async function collectAndPersistNarrative(
  reportId: number,
  result: StreamResult,
): Promise<void> {
  try {
    const text = await result.text;

    const db = getDb();
    await db
      .update(reports)
      .set({
        narrative: text,
        status: "complete",
      })
      .where(eq(reports.id, reportId));
  } catch (error) {
    console.error("[narrative] Stream collection/persistence failed:", error);

    // Mark the report as failed if we can't get the narrative.
    try {
      const db = getDb();
      await db
        .update(reports)
        .set({ status: "failed" })
        .where(eq(reports.id, reportId));
    } catch (dbError) {
      console.error("[narrative] Failed to mark report as failed:", dbError);
    }
  }
}

// --- Geometry helpers --------------------------------------------------------

/**
 * Compute the approximate area of a GeoJSON polygon in square kilometers
 * using the Shoelace formula on projected coordinates.
 * Returns null if the polygon has no valid rings.
 */
function computePolygonAreaSqKm(
  coordinates: number[][][],
): number | null {
  if (!coordinates || coordinates.length === 0) return null;
  const ring = coordinates[0]; // outer ring
  if (!ring || ring.length < 4) return null;

  // Use the Shoelace formula on lat/lng, then convert to approximate sq km.
  // At moderate latitudes, 1° lat ≈ 111 km, 1° lng ≈ 111 km * cos(lat).
  const centerLat =
    ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
  const latToKm = 111.32;
  const lngToKm = 111.32 * Math.cos((centerLat * Math.PI) / 180);

  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i][0] * lngToKm;
    const y1 = ring[i][1] * latToKm;
    const x2 = ring[i + 1][0] * lngToKm;
    const y2 = ring[i + 1][1] * latToKm;
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area) / 2;
}

// --- Exports for testing -----------------------------------------------------
export { buildSystemPrompt, buildUserPrompt };

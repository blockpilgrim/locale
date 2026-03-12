// ---------------------------------------------------------------------------
// Archetype Classification Prompt + AI Call (T1.2)
// ---------------------------------------------------------------------------
// Classifies a neighborhood into a personality archetype using Claude.
// Separate from narrative.ts: different temperature (0.3 vs 0.7), different
// output format (structured JSON vs free-form prose), different max tokens.
//
// On success, merges the archetype into the report's JSONB `data` column.
// On failure, returns null — archetype is non-fatal for report generation.
//
// Model: claude-sonnet-4-6 (same as narrative, per spec)
// Temperature: 0.3 (consistency over creativity)
// Max tokens: 500
// ---------------------------------------------------------------------------

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reports } from "@/lib/db/schema";
import type { ReportData, ArchetypeResult } from "./generate";
import { buildUserPrompt } from "./narrative";

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

// --- System prompt -----------------------------------------------------------

function buildArchetypeSystemPrompt(): string {
  return `You are a neighborhood classification system. Given structured data about a US neighborhood (demographics, housing, economics, walkability, and nearby amenities), you assign it a personality archetype — a vivid, memorable label that captures what makes this place feel like itself.

Your classification must be grounded in the data provided. Do not hallucinate or assume facts not in evidence. The archetype should feel specific to this place, not generic.

SEED ARCHETYPES (use one if it fits, or create a new label in the same style):

1. The Urban Engine — Ultra-dense core, transit-dominant, high-rise, maximum amenity access. POI 60+, transit commute >40%, density very high.
2. The Brownstone Belt — Walkable urban residential, pre-war character, community identity. Pre-1950 housing >40%, walkable, mixed owner/renter.
3. The Silicon Canopy — Tech money, new construction, educated transplants, premium pricing. Income >$120k, bachelor's+ >60%, post-2000 housing >40%.
4. Cul-de-Sac Country — Classic family suburb, moderate everything, minivan in every driveway. Owner-occupied >65%, family HH dominant, car commute >75%, POI <20.
5. Campus Orbit — University-adjacent, young, rental-heavy, cheap eats and late nights. Median age <30, renter >70%, nightlife+dining POI high.
6. The Main Street Time Capsule — Small-town charm, historic core, everyone-knows-everyone density. Population <5k, pre-1950 housing high, POI <15.
7. The Flux District — Neighborhood in active transition — old guard meets new money. Mixed housing age, renter-heavy, rising rents vs. moderate income.
8. Stroller & Sprinkler Country — New exurb, young families, big-box retail, garage doors and cul-de-sacs. Post-2000 housing >50%, family HH, high owner %, low walkability.
9. The Neon Mile — Dense nightlife and dining corridor, the neighborhood that never clocks out. Nightlife+dining POI >30, high density, renter-dominant.
10. The Sunset Circuit — Older residents, healthcare-proximate, owner-occupied calm. Median age >50, owner >70%, healthcare POI present.
11. The Mosaic — Extreme diversity, immigrant communities, international flavors on every block. No racial group >50%, diverse dining, transit-dependent.
12. The Workshop — Blue-collar roots, affordable housing, practical amenities, backbone of the city. Moderate income, affordable rent, older housing stock.
13. Saltwater & Sunscreen — Coastal living, beach culture, outdoor lifestyle, seasonal tourist influx. Coastal proximity, parks/fitness POI high, high rents.
14. The Powder Stash — Mountain/resort town, seasonal economy, outdoor recreation paradise. Very high home values, very low population, parks dominant.
15. The Garrison Gate — Military-adjacent, young transient population, rental economy, practical living. Young median age, high renter %, affordable, low POI variety.
16. The Loft Conversion — Former industrial, now arts/creative, converted warehouses and gallery walks. Mixed housing age, high rent, dining/shopping POI, walkable.

OUTPUT FORMAT (strict JSON):
{
  "archetype": "The Brownstone Belt",
  "tagline": "Where stoops are social infrastructure and the bodega knows your order.",
  "vibeSpectrum": {
    "walkable": 85,
    "buzzing": 62,
    "settled": 78,
    "accessible": 35,
    "diverse": 71
  },
  "definingTraits": [
    "$2,800 median rent",
    "83% walk or take transit",
    "47 restaurants within 10 min"
  ],
  "reasoning": "Brief 1-2 sentence explanation of why this archetype fits."
}

RULES:
- archetype: 2-5 words, title case, evocative but not cutesy
- tagline: one sentence, vivid and specific to this place, no cliches
- vibeSpectrum: each value 0-100, must be justified by the data
- definingTraits: exactly 3 short phrases, each grounded in a specific data point
- reasoning: for internal eval only, not displayed to users
- Respond with ONLY the JSON object, no markdown fencing or commentary`;
}

// --- Validation --------------------------------------------------------------

/**
 * Validate and normalize a parsed archetype result.
 * Returns null if the result is malformed.
 */
function validateArchetypeResult(
  parsed: unknown,
): ArchetypeResult | null {
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;

  // Required string fields with length limits to prevent runaway AI output
  if (typeof obj.archetype !== "string" || obj.archetype.length === 0 || obj.archetype.length > 100) return null;
  if (typeof obj.tagline !== "string" || obj.tagline.length === 0 || obj.tagline.length > 300) return null;
  if (typeof obj.reasoning !== "string" || obj.reasoning.length > 1000) return null;

  // vibeSpectrum must be an object with 5 numeric fields
  if (!obj.vibeSpectrum || typeof obj.vibeSpectrum !== "object") return null;
  const spectrum = obj.vibeSpectrum as Record<string, unknown>;
  const axes = ["walkable", "buzzing", "settled", "accessible", "diverse"] as const;

  const vibeSpectrum: Record<string, number> = {};
  for (const axis of axes) {
    const val = spectrum[axis];
    if (typeof val !== "number" || isNaN(val)) return null;
    // Clamp to 0-100
    vibeSpectrum[axis] = Math.max(0, Math.min(100, Math.round(val)));
  }

  // definingTraits must be an array of exactly 3 strings
  if (!Array.isArray(obj.definingTraits)) return null;
  if (obj.definingTraits.length !== 3) return null;
  for (const trait of obj.definingTraits) {
    if (typeof trait !== "string" || trait.length === 0 || trait.length > 200) return null;
  }

  return {
    archetype: obj.archetype,
    tagline: obj.tagline,
    vibeSpectrum: vibeSpectrum as ArchetypeResult["vibeSpectrum"],
    definingTraits: obj.definingTraits as [string, string, string],
    reasoning: obj.reasoning,
  };
}

// --- Classification ----------------------------------------------------------

/**
 * Classify a neighborhood into an archetype using Claude.
 *
 * On success, merges the archetype into the report's JSONB `data` column
 * and returns the result. On failure, returns null — classification is
 * non-fatal for report generation.
 *
 * @param reportId - The database ID of the report to update.
 * @param data - The structured report data to classify.
 * @returns The archetype result, or null on failure.
 */
export async function classifyArchetype(
  reportId: number,
  data: ReportData,
): Promise<ArchetypeResult | null> {
  // Fail fast if ANTHROPIC_API_KEY is missing.
  getApiKey();

  try {
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system: buildArchetypeSystemPrompt(),
      prompt: buildUserPrompt(data),
      maxOutputTokens: 500,
      temperature: 0.3,
      maxRetries: 3, // 4 total attempts — handles transient 529 "Overloaded"
      abortSignal: AbortSignal.timeout(30_000), // 30s timeout to allow retries with backoff
    });

    const text = result.text.trim();

    // Parse JSON response — the model should return raw JSON, but strip
    // markdown fencing if present (defensive).
    let jsonStr = text;
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[archetype] Failed to parse JSON response:", text);
      return null;
    }

    const archetype = validateArchetypeResult(parsed);
    if (!archetype) {
      console.error("[archetype] Validation failed for response:", parsed);
      return null;
    }

    // Atomic JSONB merge — uses Postgres `||` operator to avoid read-modify-write
    // race condition with concurrent narrative generation.
    const db = getDb();
    await db
      .update(reports)
      .set({
        data: sql`${reports.data} || ${JSON.stringify({ archetype })}::jsonb`,
      })
      .where(eq(reports.id, reportId));

    return archetype;
  } catch (error) {
    console.error("[archetype] Classification failed:", error);
    return null;
  }
}

// --- Exports for testing -----------------------------------------------------
export { buildArchetypeSystemPrompt, validateArchetypeResult };

#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// Archetype Consistency Test Script (T6.2)
// ---------------------------------------------------------------------------
// Tests whether the archetype classification produces consistent results
// across multiple runs with the same input data. Runs 5 classifications for
// each of 5 selected golden addresses (25 total API calls) and reports label
// stability and spectrum score deviation.
//
// Usage:
//   npx tsx tests/eval-archetype-consistency.ts
//   npm run test:eval:consistency
//
// Outputs:
//   stdout: Summary table with label consistency and max spectrum deviation
//   tests/output/consistency/<label>.json: Detailed per-address results
//
// Requires: ANTHROPIC_API_KEY in .env.local
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import { goldenAddresses } from "./golden-addresses";
import { buildReportData } from "./mock-data";

import { buildUserPrompt } from "../src/lib/report/narrative";
import { buildArchetypeSystemPrompt, validateArchetypeResult } from "../src/lib/report/archetype";
import type { ArchetypeResult } from "../src/lib/report/generate";

// --- Configuration -----------------------------------------------------------

/** Labels of the 5 golden addresses to test. */
const TARGET_LABELS = [
  "dense-urban-manhattan",
  "urban-residential-brooklyn",
  "rural-small-town-galena",
  "college-town-ann-arbor",
  "coastal-hermosa-beach",
] as const;

/** Number of classification runs per address. */
const RUNS_PER_ADDRESS = 5;

/** Delay between API calls in milliseconds (rate limiting). */
const DELAY_MS = 1000;

// --- Load .env.local ---------------------------------------------------------

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// --- Output directory --------------------------------------------------------

const OUTPUT_DIR = path.resolve(__dirname, "output/consistency");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// --- Types -------------------------------------------------------------------

interface RunResult {
  runIndex: number;
  rawResponse: string;
  archetype: ArchetypeResult | null;
  error: string | null;
}

interface AxisStats {
  mean: number;
  min: number;
  max: number;
  stddev: number;
  maxDelta: number; // max deviation from mean
}

interface AddressResult {
  label: string;
  address: string;
  runs: RunResult[];
  labelFrequency: Record<string, number>;
  mostCommonLabel: string;
  mostCommonCount: number;
  spectrumStats: Record<string, AxisStats>;
  maxSpectrumDelta: number;
  validCount: number;
  failedCount: number;
}

// --- API call ----------------------------------------------------------------

/**
 * Call the Anthropic API to classify an archetype.
 * Returns the raw text response.
 */
async function classifyArchetypeLive(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required. Set it in .env.local.",
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

/**
 * Parse raw archetype response into a validated ArchetypeResult.
 */
function parseArchetypeResponse(raw: string): ArchetypeResult | null {
  let jsonStr = raw.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return validateArchetypeResult(parsed);
  } catch {
    return null;
  }
}

// --- Statistics helpers ------------------------------------------------------

function computeAxisStats(values: number[]): AxisStats {
  if (values.length === 0) {
    return { mean: 0, min: 0, max: 0, stddev: 0, maxDelta: 0 };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);

  const maxDelta = Math.max(...values.map((v) => Math.abs(v - mean)));

  return {
    mean: Math.round(mean * 10) / 10,
    min,
    max,
    stddev: Math.round(stddev * 10) / 10,
    maxDelta: Math.round(maxDelta),
  };
}

// --- Delay helper ------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Main execution ----------------------------------------------------------

async function main() {
  // Validate API key is present before starting
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Error: ANTHROPIC_API_KEY not found. Set it in .env.local.",
    );
    process.exit(1);
  }

  // Resolve target addresses
  const targetAddresses = TARGET_LABELS.map((label) => {
    const addr = goldenAddresses.find((a) => a.label === label);
    if (!addr) {
      console.error(`Error: Golden address with label "${label}" not found.`);
      process.exit(1);
    }
    return addr;
  });

  const archetypeSystemPrompt = buildArchetypeSystemPrompt();
  const totalCalls = targetAddresses.length * RUNS_PER_ADDRESS;

  console.log(`=== Archetype Consistency Test ===`);
  console.log(
    `${targetAddresses.length} addresses x ${RUNS_PER_ADDRESS} runs = ${totalCalls} API calls`,
  );
  console.log(`Delay between calls: ${DELAY_MS}ms`);
  console.log(`Estimated time: ~${Math.ceil((totalCalls * DELAY_MS) / 1000 / 60)} minutes\n`);

  const allResults: AddressResult[] = [];
  let callNumber = 0;

  for (const addr of targetAddresses) {
    console.log(`\n--- ${addr.label} ---`);

    const data = buildReportData(addr);
    const userPrompt = buildUserPrompt(data);
    const runs: RunResult[] = [];

    for (let i = 0; i < RUNS_PER_ADDRESS; i++) {
      callNumber++;
      process.stdout.write(`  Run ${i + 1}/${RUNS_PER_ADDRESS} (${callNumber}/${totalCalls})... `);

      try {
        // Rate limiting delay (skip before first call)
        if (callNumber > 1) {
          await delay(DELAY_MS);
        }

        const rawResponse = await classifyArchetypeLive(
          archetypeSystemPrompt,
          userPrompt,
        );
        const archetype = parseArchetypeResponse(rawResponse);

        runs.push({
          runIndex: i,
          rawResponse,
          archetype,
          error: archetype ? null : "Validation failed",
        });

        if (archetype) {
          console.log(archetype.archetype);
        } else {
          console.log("VALIDATION FAILED");
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        runs.push({
          runIndex: i,
          rawResponse: "",
          archetype: null,
          error: errorMsg,
        });
        console.log(`ERROR: ${errorMsg}`);
      }
    }

    // Compute statistics for this address
    const validRuns = runs.filter((r) => r.archetype !== null);
    const failedRuns = runs.filter((r) => r.archetype === null);

    // Label frequency
    const labelFrequency: Record<string, number> = {};
    for (const run of validRuns) {
      const label = run.archetype!.archetype;
      labelFrequency[label] = (labelFrequency[label] || 0) + 1;
    }

    // Most common label
    let mostCommonLabel = "N/A";
    let mostCommonCount = 0;
    for (const [label, count] of Object.entries(labelFrequency)) {
      if (count > mostCommonCount) {
        mostCommonLabel = label;
        mostCommonCount = count;
      }
    }

    // Per-axis spectrum stats
    const axes = ["walkable", "buzzing", "settled", "accessible", "diverse"] as const;
    const spectrumStats: Record<string, AxisStats> = {};
    let maxSpectrumDelta = 0;

    for (const axis of axes) {
      const values = validRuns.map(
        (r) => r.archetype!.vibeSpectrum[axis],
      );
      const stats = computeAxisStats(values);
      spectrumStats[axis] = stats;
      if (stats.maxDelta > maxSpectrumDelta) {
        maxSpectrumDelta = stats.maxDelta;
      }
    }

    const addressResult: AddressResult = {
      label: addr.label,
      address: addr.address,
      runs,
      labelFrequency,
      mostCommonLabel,
      mostCommonCount,
      spectrumStats,
      maxSpectrumDelta,
      validCount: validRuns.length,
      failedCount: failedRuns.length,
    };

    allResults.push(addressResult);

    // Write detailed results to file
    const outputPath = path.join(OUTPUT_DIR, `${addr.label}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(addressResult, null, 2), "utf-8");
  }

  // --- Summary table ---

  console.log("\n\n=== Archetype Consistency Results ===\n");

  const col1Width = 32;
  const col2Width = 30;
  const col3Width = 18;

  const header = [
    "Address".padEnd(col1Width),
    "Label Consistency".padEnd(col2Width),
    "Max D (spectrum)",
  ].join(" | ");

  const separator = [
    "-".repeat(col1Width),
    "-".repeat(col2Width),
    "-".repeat(col3Width),
  ].join("-|-");

  console.log(header);
  console.log(separator);

  let highConsistencyCount = 0;

  for (const result of allResults) {
    const labelCell =
      result.validCount > 0
        ? `${result.mostCommonLabel} (${result.mostCommonCount}/${RUNS_PER_ADDRESS})`
        : "ALL FAILED";

    const spectrumCell =
      result.validCount > 0 ? `+/-${result.maxSpectrumDelta}` : "N/A";

    const consistency = result.mostCommonCount / RUNS_PER_ADDRESS;
    if (consistency > 0.9) {
      highConsistencyCount++;
    }

    console.log(
      [
        result.label.padEnd(col1Width),
        labelCell.padEnd(col2Width),
        spectrumCell.padEnd(col3Width),
      ].join(" | "),
    );
  }

  console.log(
    `\nOverall: ${highConsistencyCount}/${allResults.length} addresses have >90% label consistency`,
  );
  console.log(`Detailed results written to: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

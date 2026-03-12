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
import { goldenAddresses } from "./golden-addresses";
import { buildReportData } from "./mock-data";

// We import the prompt builders from the source code directly.
// This requires the path alias to resolve, which tsx + tsconfig handles.
import { buildSystemPrompt, buildUserPrompt } from "../src/lib/report/narrative";
import { buildArchetypeSystemPrompt, validateArchetypeResult } from "../src/lib/report/archetype";
import type { ArchetypeResult } from "../src/lib/report/generate";

// --- CLI args ----------------------------------------------------------------

const isLive = process.argv.includes("--live");

// --- Load .env.local for --live mode -----------------------------------------
// tsx doesn't load Next.js env files automatically. Parse .env.local so that
// ANTHROPIC_API_KEY is available when making live AI calls.

if (isLive) {
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
}

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

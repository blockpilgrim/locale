// ---------------------------------------------------------------------------
// POST /api/report/[slug]/archetype
// ---------------------------------------------------------------------------
// Triggers archetype classification for a report in "generating" status.
// Called by the ArchetypeTrigger client component on the report page.
//
// Key difference from the narrative route: this route does NOT set report
// status to "failed" on error. Archetype classification is optional —
// the report renders without it if classification fails.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reports } from "@/lib/db/schema";
import { classifyArchetype } from "@/lib/report/archetype";
import { createRateLimiter } from "@/lib/rate-limit";
import type { ReportData } from "@/lib/report/generate";

// Rate limit: same as report generation (10 req/hour per IP).
const limiter = createRateLimiter({ limit: 10 });

const SLUG_RE = /^[a-z0-9-]{1,80}$/;

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function POST(
  request: Request,
  { params }: RouteParams,
): Promise<Response> {
  // Rate limit check — archetype calls the paid Anthropic API.
  const rl = limiter.check(request);
  if (!rl.success) return limiter.createLimitResponse(rl);

  const { slug } = await params;

  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Invalid report slug." }, { status: 400 });
  }

  const db = getDb();
  const [report] = await db
    .select({
      id: reports.id,
      status: reports.status,
      data: reports.data,
    })
    .from(reports)
    .where(eq(reports.slug, slug))
    .limit(1);

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // Only classify reports that are actively generating and have data.
  if (report.status !== "generating" || !report.data) {
    return NextResponse.json({ status: report.status });
  }

  try {
    const archetype = await classifyArchetype(
      report.id,
      report.data as ReportData,
    );

    if (archetype) {
      return NextResponse.json({ status: "classified", archetype });
    }

    // Classification returned null — non-fatal, report continues without it.
    return NextResponse.json({ status: "skipped" });
  } catch (err) {
    console.error("[archetype] Route handler failed:", err);

    // Distinguish configuration errors (missing API key) from runtime failures.
    // Config errors get 500 so they surface in monitoring. Runtime failures
    // are non-fatal and return 200 with "skipped" status.
    const isConfigError =
      err instanceof Error && err.message.includes("ANTHROPIC_API_KEY");
    if (isConfigError) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    // Do NOT mark report as failed — archetype is optional.
    return NextResponse.json({ status: "skipped" }, { status: 200 });
  }
}

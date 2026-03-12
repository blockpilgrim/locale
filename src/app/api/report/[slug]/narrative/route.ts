// ---------------------------------------------------------------------------
// POST /api/report/[slug]/narrative
// ---------------------------------------------------------------------------
// Generates the AI narrative for a report that is in "generating" status.
// Called by the NarrativeTrigger client component on the report page. The
// client keeps the connection alive while the narrative streams from the
// Anthropic API, making this reliable without fire-and-forget promises.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reports } from "@/lib/db/schema";
import { generateNarrative } from "@/lib/report/narrative";
import { createRateLimiter } from "@/lib/rate-limit";
import type { ReportData } from "@/lib/report/generate";

// Rate limit: 10 req/hour per IP — matches other AI-calling routes.
const narrativeLimiter = createRateLimiter({ limit: 10 });

const SLUG_RE = /^[a-z0-9-]{1,80}$/;

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function POST(
  request: Request,
  { params }: RouteParams,
): Promise<Response> {
  const rl = narrativeLimiter.check(request);
  if (!rl.success) return narrativeLimiter.createLimitResponse(rl);

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

  // Already complete or failed — nothing to do.
  if (report.status !== "generating" || !report.data) {
    return NextResponse.json({ status: report.status });
  }

  try {
    await generateNarrative(report.id, report.data as ReportData);
    return NextResponse.json({ status: "complete" });
  } catch (err) {
    console.error("[narrative] Generation failed:", err);
    try {
      await db
        .update(reports)
        .set({ status: "failed" })
        .where(eq(reports.id, report.id));
    } catch (dbErr) {
      console.error("[narrative] Failed to mark report as failed:", dbErr);
    }
    return NextResponse.json({ status: "failed" }, { status: 500 });
  }
}

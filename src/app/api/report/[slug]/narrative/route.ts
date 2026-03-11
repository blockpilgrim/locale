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
import type { ReportData } from "@/lib/report/generate";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function POST(
  _request: Request,
  { params }: RouteParams,
): Promise<Response> {
  const { slug } = await params;

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

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
    // Do NOT mark report as failed — archetype is optional.
    return NextResponse.json({ status: "skipped" }, { status: 200 });
  }
}

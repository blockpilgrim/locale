// ---------------------------------------------------------------------------
// POST /api/report/[slug]/retry
// ---------------------------------------------------------------------------
// Resets a failed report back to "generating" status so the client-side
// GenerationOrchestrator can re-trigger the AI calls. Only works on reports
// with status "failed" — all other statuses are no-ops.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reports } from "@/lib/db/schema";

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
    })
    .from(reports)
    .where(eq(reports.slug, slug))
    .limit(1);

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  if (report.status !== "failed") {
    return NextResponse.json({ status: report.status });
  }

  await db
    .update(reports)
    .set({ status: "generating", narrative: null })
    .where(eq(reports.id, report.id));

  return NextResponse.json({ status: "generating" });
}

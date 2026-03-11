// ---------------------------------------------------------------------------
// GET /api/report/[slug]/card — Social card image generation
// ---------------------------------------------------------------------------
// Generates PNG social card images via @vercel/og (Satori + Resvg).
//
// Query params:
//   format=og    → 1200x630px (Open Graph, default)
//   format=story → 1080x1920px (Instagram Stories / vertical share)
//
// Cache-Control: public, s-maxage=31536000, immutable
// Cards are deterministic for a given report — aggressive caching is safe.
// ---------------------------------------------------------------------------

import { ImageResponse } from "@vercel/og";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reports, locations } from "@/lib/db/schema";
import type { ReportData, ArchetypeResult } from "@/lib/report/generate";

// --- Route config ------------------------------------------------------------

export const runtime = "nodejs";

// --- Types -------------------------------------------------------------------

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// --- Pentagon geometry (shared with VibeSpectrum.tsx) -------------------------

const AXES: { key: keyof ArchetypeResult["vibeSpectrum"]; label: string }[] = [
  { key: "walkable", label: "Walkable" },
  { key: "buzzing", label: "Buzzing" },
  { key: "settled", label: "Settled" },
  { key: "accessible", label: "Accessible" },
  { key: "diverse", label: "Diverse" },
];

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  index: number,
): { x: number; y: number } {
  const angleDeg = -90 + index * 72;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function toPointsString(points: { x: number; y: number }[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

// --- Satori Pentagon component -----------------------------------------------

function SatoriPentagon({
  scores,
  size,
}: {
  scores: ArchetypeResult["vibeSpectrum"];
  size: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;

  const bgPoints = AXES.map((_, i) => polarToCartesian(cx, cy, radius, i));
  const dataPoints = AXES.map((axis, i) => {
    const score = Math.max(0, Math.min(100, scores[axis.key]));
    return polarToCartesian(cx, cy, (score / 100) * radius, i);
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Axis lines */}
      {bgPoints.map((pt, i) => (
        <line
          key={`a${i}`}
          x1={cx}
          y1={cy}
          x2={pt.x}
          y2={pt.y}
          stroke="#E7E0D6"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
      ))}
      {/* Background pentagon */}
      <polygon
        points={toPointsString(bgPoints)}
        fill="none"
        stroke="#E7E0D6"
        strokeWidth="1.5"
      />
      {/* Data pentagon */}
      <polygon
        points={toPointsString(dataPoints)}
        fill="rgba(45, 90, 61, 0.15)"
        stroke="#2D5A3D"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Dots */}
      {dataPoints.map((pt, i) => (
        <circle key={`d${i}`} cx={pt.x} cy={pt.y} r="4" fill="#2D5A3D" />
      ))}
    </svg>
  );
}

// --- OG Card layout (1200x630) -----------------------------------------------

function OgCard({
  archetype,
  address,
  cityState,
}: {
  archetype: ArchetypeResult;
  address: string;
  cityState: string;
}) {
  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px 56px",
        backgroundColor: "#FAF7F2" /* --color-cream */,
        fontFamily: "Inter",
        color: "#1C1917" /* --color-ink */,
      }}
    >
      {/* Top: branding + address */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "14px",
            fontWeight: 500,
            letterSpacing: "0.15em",
            textTransform: "uppercase" as const,
            color: "#2D5A3D" /* --color-accent */,
          }}
        >
          <span>Locale</span>
          <span style={{ color: "#78716C" }}>{"  "}Neighborhood Intelligence</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "12px",
          }}
        >
          <span
            style={{
              fontSize: "22px",
              fontWeight: 500,
              color: "#1C1917",
              lineHeight: 1.3,
            }}
          >
            {address}
          </span>
          {cityState && (
            <span
              style={{
                fontSize: "18px",
                color: "#78716C" /* --color-ink-muted */,
                marginTop: "4px",
              }}
            >
              {cityState}
            </span>
          )}
        </div>
      </div>

      {/* Middle: pentagon + archetype info */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "48px",
          flex: 1,
          marginTop: "16px",
          marginBottom: "16px",
        }}
      >
        <SatoriPentagon scores={archetype.vibeSpectrum} size={240} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
          }}
        >
          <span
            style={{
              fontFamily: "Playfair Display",
              fontSize: "40px",
              fontWeight: 700,
              color: "#1C1917",
              lineHeight: 1.15,
            }}
          >
            {archetype.archetype}
          </span>
          <span
            style={{
              fontSize: "18px",
              fontStyle: "italic",
              color: "#78716C",
              marginTop: "10px",
              lineHeight: 1.5,
            }}
          >
            {archetype.tagline}
          </span>
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "16px",
              fontSize: "15px",
              color: "#44403C" /* --color-ink-light */,
              fontWeight: 500,
            }}
          >
            {archetype.definingTraits.map((trait, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {i > 0 && <span style={{ color: "#78716C" }}>{"  \u00B7  "}</span>}
                <span>{trait}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom: branding */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "8px",
          fontSize: "14px",
          color: "#78716C",
          fontWeight: 500,
        }}
      >
        <span>locale.leroi.ai</span>
      </div>
    </div>
  );
}

// --- Story Card layout (1080x1920) -------------------------------------------

function StoryCard({
  archetype,
  address,
  cityState,
}: {
  archetype: ArchetypeResult;
  address: string;
  cityState: string;
}) {
  return (
    <div
      style={{
        width: "1080px",
        height: "1920px",
        display: "flex",
        flexDirection: "column",
        padding: "72px 64px",
        backgroundColor: "#FAF7F2" /* --color-cream */,
        fontFamily: "Inter",
        color: "#1C1917" /* --color-ink */,
      }}
    >
      {/* Top: branding + address */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "16px",
            fontWeight: 600,
            letterSpacing: "0.15em",
            textTransform: "uppercase" as const,
            color: "#2D5A3D" /* --color-accent */,
          }}
        >
          <span>Locale</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "24px",
          }}
        >
          <span
            style={{
              fontSize: "28px",
              fontWeight: 500,
              color: "#1C1917",
              lineHeight: 1.3,
            }}
          >
            {address}
          </span>
          {cityState && (
            <span
              style={{
                fontSize: "22px",
                color: "#78716C",
                marginTop: "6px",
              }}
            >
              {cityState}
            </span>
          )}
        </div>
      </div>

      {/* Pentagon + scores */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: "64px",
        }}
      >
        <SatoriPentagon scores={archetype.vibeSpectrum} size={360} />

        {/* Score rows */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            maxWidth: "480px",
            marginTop: "40px",
            gap: "12px",
          }}
        >
          {AXES.map((axis) => (
            <div
              key={axis.key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "20px",
              }}
            >
              <span style={{ color: "#78716C", fontWeight: 500 }}>
                {axis.label}
              </span>
              <span style={{ fontWeight: 600, color: "#1C1917" }}>
                {archetype.vibeSpectrum[axis.key]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Archetype label + tagline */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: "72px",
          flex: 1,
        }}
      >
        <span
          style={{
            fontFamily: "Playfair Display",
            fontSize: "52px",
            fontWeight: 700,
            color: "#1C1917",
            lineHeight: 1.15,
          }}
        >
          {archetype.archetype}
        </span>
        <span
          style={{
            fontSize: "22px",
            fontStyle: "italic",
            color: "#78716C",
            marginTop: "16px",
            lineHeight: 1.5,
          }}
        >
          {archetype.tagline}
        </span>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            marginTop: "32px",
            marginBottom: "24px",
            height: "1px",
            backgroundColor: "#E7E0D6" /* --color-border */,
          }}
        />

        {/* Defining traits */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {archetype.definingTraits.map((trait, i) => (
            <span
              key={i}
              style={{
                fontSize: "20px",
                fontWeight: 500,
                color: "#44403C" /* --color-ink-light */,
              }}
            >
              {trait}
            </span>
          ))}
        </div>

        {/* Bottom divider */}
        <div
          style={{
            display: "flex",
            marginTop: "24px",
            height: "1px",
            backgroundColor: "#E7E0D6",
          }}
        />
      </div>

      {/* CTA + branding */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: "auto",
          gap: "8px",
        }}
      >
        <span
          style={{
            fontSize: "22px",
            fontWeight: 600,
            color: "#1C1917",
          }}
        >
          {"What's your neighborhood?"}
        </span>
        <span
          style={{
            fontSize: "18px",
            color: "#2D5A3D",
            fontWeight: 500,
          }}
        >
          locale.leroi.ai
        </span>
      </div>
    </div>
  );
}

// --- Fallback card (no archetype) --------------------------------------------

function FallbackOgCard({
  address,
  cityState,
}: {
  address: string;
  cityState: string;
}) {
  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "48px 56px",
        backgroundColor: "#FAF7F2",
        fontFamily: "Inter",
        color: "#1C1917",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "14px",
          fontWeight: 500,
          letterSpacing: "0.15em",
          textTransform: "uppercase" as const,
          color: "#2D5A3D",
          marginBottom: "24px",
        }}
      >
        <span>Locale</span>
        <span style={{ color: "#78716C" }}>{"  "}Neighborhood Intelligence</span>
      </div>
      <span
        style={{
          fontFamily: "Playfair Display",
          fontSize: "44px",
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.2,
          maxWidth: "800px",
        }}
      >
        {address}
      </span>
      {cityState && (
        <span
          style={{
            fontSize: "24px",
            color: "#78716C",
            marginTop: "12px",
          }}
        >
          {cityState}
        </span>
      )}
      <span
        style={{
          fontSize: "18px",
          color: "#78716C",
          marginTop: "32px",
          fontStyle: "italic",
        }}
      >
        AI-powered neighborhood intelligence
      </span>
    </div>
  );
}

// --- Font loading ------------------------------------------------------------

async function loadFonts() {
  const [playfairBold, interRegular, interMedium] = await Promise.all([
    fetch(new URL("/fonts/PlayfairDisplay-Bold.ttf", getBaseUrl())).then(
      (res) => res.arrayBuffer(),
    ),
    fetch(new URL("/fonts/Inter-Regular.ttf", getBaseUrl())).then((res) =>
      res.arrayBuffer(),
    ),
    fetch(new URL("/fonts/Inter-Medium.ttf", getBaseUrl())).then((res) =>
      res.arrayBuffer(),
    ),
  ]);

  return [
    { name: "Playfair Display", data: playfairBold, weight: 700 as const, style: "normal" as const },
    { name: "Inter", data: interRegular, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: interMedium, weight: 500 as const, style: "normal" as const },
  ];
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

// --- Route handler -----------------------------------------------------------

export async function GET(
  request: Request,
  { params }: RouteParams,
): Promise<Response> {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "story" ? "story" : "og";

  // Fetch report from DB
  const db = getDb();
  const results = await db
    .select({
      data: reports.data,
      address: locations.address,
      city: locations.city,
      state: locations.state,
    })
    .from(reports)
    .innerJoin(locations, eq(reports.locationId, locations.id))
    .where(eq(reports.slug, slug))
    .limit(1);

  if (results.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  const row = results[0];
  const reportData = row.data as ReportData | null;
  const archetype = reportData?.archetype ?? null;
  const cityState = [row.city, row.state].filter(Boolean).join(", ");

  const dimensions =
    format === "story"
      ? { width: 1080, height: 1920 }
      : { width: 1200, height: 630 };

  let fonts;
  try {
    fonts = await loadFonts();
  } catch (err) {
    console.error("[card] Font loading failed:", err);
    return new Response("Font loading failed", { status: 500 });
  }

  // Choose the appropriate card layout
  let element: React.ReactElement;
  if (archetype && format === "story") {
    element = (
      <StoryCard
        archetype={archetype}
        address={row.address}
        cityState={cityState}
      />
    );
  } else if (archetype) {
    element = (
      <OgCard
        archetype={archetype}
        address={row.address}
        cityState={cityState}
      />
    );
  } else {
    // Fallback for reports without archetype data
    element = (
      <FallbackOgCard address={row.address} cityState={cityState} />
    );
  }

  const response = new ImageResponse(element, {
    ...dimensions,
    fonts,
  });

  // Aggressive caching — cards are deterministic for a given report.
  response.headers.set(
    "Cache-Control",
    "public, s-maxage=31536000, immutable",
  );

  return response;
}

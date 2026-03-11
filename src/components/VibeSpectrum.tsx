// ---------------------------------------------------------------------------
// VibeSpectrum — Pentagon/radar chart for neighborhood vibe scores
// ---------------------------------------------------------------------------
// Pure SVG component rendering a 5-axis radar chart. Works in both React
// DOM and Satori (for social card image generation).
//
// Uses only inline styles and basic SVG elements — no Tailwind classes,
// no Framer Motion — to ensure Satori compatibility.
//
// Axis order (clockwise from top): Walkable, Buzzing, Settled, Accessible, Diverse
// ---------------------------------------------------------------------------

interface VibeSpectrumProps {
  scores: {
    walkable: number;
    buzzing: number;
    settled: number;
    accessible: number;
    diverse: number;
  };
  /** SVG width/height in pixels. Default 240. */
  size?: number;
  /** Show axis labels outside the pentagon. Default true. */
  showLabels?: boolean;
  /** Show numeric scores next to labels. Default true. */
  showScores?: boolean;
  /** Additional CSS class on the wrapper. */
  className?: string;
}

// --- Geometry helpers --------------------------------------------------------

/** Axes in clockwise order starting from top (12 o'clock). */
const AXES: { key: keyof VibeSpectrumProps["scores"]; label: string }[] = [
  { key: "walkable", label: "Walkable" },
  { key: "buzzing", label: "Buzzing" },
  { key: "settled", label: "Settled" },
  { key: "accessible", label: "Accessible" },
  { key: "diverse", label: "Diverse" },
];

/**
 * Convert an axis index (0-4) and a normalized radius (0-1) to SVG (x, y).
 * Index 0 points straight up (12 o'clock), subsequent indices go clockwise.
 */
function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  index: number,
): { x: number; y: number } {
  // -90° offset so index 0 starts at top; 72° per axis (360/5)
  const angleDeg = -90 + index * 72;
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

/** Build an SVG polygon points string from an array of {x, y}. */
function toPointsString(points: { x: number; y: number }[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

// --- Component ---------------------------------------------------------------

export function VibeSpectrum({
  scores,
  size = 240,
  showLabels = true,
  showScores = true,
  className,
}: VibeSpectrumProps) {
  const cx = size / 2;
  const cy = size / 2;
  // Leave room for labels outside the pentagon
  const radius = showLabels ? size * 0.32 : size * 0.42;

  // Background pentagon vertices (full radius)
  const bgPoints = AXES.map((_, i) => polarToCartesian(cx, cy, radius, i));

  // Data pentagon vertices (score-based radius)
  const dataPoints = AXES.map((axis, i) => {
    const score = Math.max(0, Math.min(100, scores[axis.key]));
    const r = (score / 100) * radius;
    return polarToCartesian(cx, cy, r, i);
  });

  // Axis lines from center to each vertex
  const axisLines = bgPoints.map((pt) => ({ x1: cx, y1: cy, x2: pt.x, y2: pt.y }));

  // Label positions — pushed further out from the pentagon
  const labelRadius = radius + (showScores ? size * 0.16 : size * 0.12);
  const labelPoints = AXES.map((_, i) =>
    polarToCartesian(cx, cy, labelRadius, i),
  );

  // Build aria-label for accessibility
  const ariaLabel = AXES.map(
    (axis) => `${axis.label}: ${scores[axis.key]}`,
  ).join(", ");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={`Vibe Spectrum: ${ariaLabel}`}
      style={{ display: "block" }}
    >
      {/* Axis lines — subtle guides from center to vertices */}
      {axisLines.map((line, i) => (
        <line
          key={`axis-${i}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="#E7E0D6" /* --color-border */
          strokeWidth="1"
          strokeDasharray="2,2"
        />
      ))}

      {/* Background pentagon — full radius outline */}
      <polygon
        points={toPointsString(bgPoints)}
        fill="none"
        stroke="#E7E0D6" /* --color-border */
        strokeWidth="1.5"
      />

      {/* Data pentagon — filled with accent color at low opacity */}
      <polygon
        points={toPointsString(dataPoints)}
        fill="rgba(45, 90, 61, 0.15)" /* --color-accent at 15% */
        stroke="#2D5A3D" /* --color-accent */
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Score dots on each data vertex */}
      {dataPoints.map((pt, i) => (
        <circle
          key={`dot-${i}`}
          cx={pt.x}
          cy={pt.y}
          r="3"
          fill="#2D5A3D" /* --color-accent */
        />
      ))}

      {/* Axis labels + optional scores */}
      {showLabels &&
        labelPoints.map((pt, i) => {
          const axis = AXES[i];
          const score = scores[axis.key];

          // Determine text-anchor based on position relative to center
          let textAnchor: "start" | "middle" | "end" = "middle";
          if (pt.x < cx - 5) textAnchor = "end";
          else if (pt.x > cx + 5) textAnchor = "start";

          // Vertical alignment tweak for top/bottom labels
          const dy = pt.y < cy - 5 ? -4 : pt.y > cy + 5 ? 12 : 4;

          return (
            <text
              key={`label-${i}`}
              x={pt.x}
              y={pt.y + dy}
              textAnchor={textAnchor}
              style={{
                fontSize: size * 0.048,
                fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
                fill: "#78716C", /* --color-ink-muted */
                fontWeight: 500,
              }}
            >
              {axis.label}
              {showScores && (
                <tspan
                  style={{
                    fontWeight: 600,
                    fill: "#1C1917", /* --color-ink */
                  }}
                >
                  {" "}{score}
                </tspan>
              )}
            </text>
          );
        })}
    </svg>
  );
}

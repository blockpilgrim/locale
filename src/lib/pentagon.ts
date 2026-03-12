// ---------------------------------------------------------------------------
// Shared pentagon geometry helpers
// ---------------------------------------------------------------------------
// Used by both the VibeSpectrum React component and the Satori social card
// renderer. Pure math — no React, no styles, no DOM.
// ---------------------------------------------------------------------------

import type { ArchetypeResult } from "@/lib/report/generate";

/** Axes in clockwise order starting from top (12 o'clock). */
export const PENTAGON_AXES: {
  key: keyof ArchetypeResult["vibeSpectrum"];
  label: string;
}[] = [
  { key: "walkable", label: "Walkable" },
  { key: "buzzing", label: "Buzzing" },
  { key: "settled", label: "Settled" },
  { key: "accessible", label: "Accessible" },
  { key: "diverse", label: "Diverse" },
];

/**
 * Convert an axis index (0-4) and a radius to SVG (x, y) coordinates.
 * Index 0 points straight up (12 o'clock), subsequent indices go clockwise.
 */
export function polarToCartesian(
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
export function toPointsString(
  points: { x: number; y: number }[],
): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

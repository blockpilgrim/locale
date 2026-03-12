// ---------------------------------------------------------------------------
// Tests for pentagon geometry utilities (src/lib/pentagon.ts)
// ---------------------------------------------------------------------------
// These functions are shared between VibeSpectrum (React DOM) and the social
// card Satori renderer. Consolidated here to prevent test duplication.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { polarToCartesian, toPointsString, PENTAGON_AXES } from "@/lib/pentagon";

// =============================================================================
// polarToCartesian — vertex coordinate calculation
// =============================================================================

describe("polarToCartesian", () => {
  const cx = 120;
  const cy = 120;
  const radius = 76.8; // 240 * 0.32 (default size with labels)

  it("index 0 points straight up (12 o'clock)", () => {
    const pt = polarToCartesian(cx, cy, radius, 0);

    // At -90 degrees: cos(-90) = 0, sin(-90) = -1
    expect(pt.x).toBeCloseTo(cx, 5);
    expect(pt.y).toBeCloseTo(cy - radius, 5);
  });

  it("index 1 (72 degrees clockwise from top) computes correct coordinates", () => {
    // At -90 + 72 = -18 degrees
    const pt = polarToCartesian(cx, cy, radius, 1);

    const expectedX = cx + radius * Math.cos((-18 * Math.PI) / 180);
    const expectedY = cy + radius * Math.sin((-18 * Math.PI) / 180);

    expect(pt.x).toBeCloseTo(expectedX, 10);
    expect(pt.y).toBeCloseTo(expectedY, 10);
  });

  it("index 2 (144 degrees clockwise from top) computes correct coordinates", () => {
    // At -90 + 144 = 54 degrees
    const pt = polarToCartesian(cx, cy, radius, 2);

    const expectedX = cx + radius * Math.cos((54 * Math.PI) / 180);
    const expectedY = cy + radius * Math.sin((54 * Math.PI) / 180);

    expect(pt.x).toBeCloseTo(expectedX, 10);
    expect(pt.y).toBeCloseTo(expectedY, 10);
  });

  it("index 3 (216 degrees clockwise from top) computes correct coordinates", () => {
    // At -90 + 216 = 126 degrees
    const pt = polarToCartesian(cx, cy, radius, 3);

    const expectedX = cx + radius * Math.cos((126 * Math.PI) / 180);
    const expectedY = cy + radius * Math.sin((126 * Math.PI) / 180);

    expect(pt.x).toBeCloseTo(expectedX, 10);
    expect(pt.y).toBeCloseTo(expectedY, 10);
  });

  it("index 4 (288 degrees clockwise from top) computes correct coordinates", () => {
    // At -90 + 288 = 198 degrees
    const pt = polarToCartesian(cx, cy, radius, 4);

    const expectedX = cx + radius * Math.cos((198 * Math.PI) / 180);
    const expectedY = cy + radius * Math.sin((198 * Math.PI) / 180);

    expect(pt.x).toBeCloseTo(expectedX, 10);
    expect(pt.y).toBeCloseTo(expectedY, 10);
  });

  it("all 5 vertices are equidistant from center at full radius", () => {
    for (let i = 0; i < 5; i++) {
      const pt = polarToCartesian(cx, cy, radius, i);
      const dist = Math.sqrt((pt.x - cx) ** 2 + (pt.y - cy) ** 2);
      expect(dist).toBeCloseTo(radius, 5);
    }
  });

  it("radius 0 always returns center regardless of index", () => {
    for (let i = 0; i < 5; i++) {
      const pt = polarToCartesian(cx, cy, 0, i);
      expect(pt.x).toBeCloseTo(cx, 10);
      expect(pt.y).toBeCloseTo(cy, 10);
    }
  });

  it("full-radius scores produce a regular pentagon (all sides equal)", () => {
    const points = Array.from({ length: 5 }, (_, i) =>
      polarToCartesian(cx, cy, radius, i),
    );

    const sideLength = Math.sqrt(
      (points[0].x - points[1].x) ** 2 + (points[0].y - points[1].y) ** 2,
    );

    for (let i = 0; i < 5; i++) {
      const j = (i + 1) % 5;
      const len = Math.sqrt(
        (points[i].x - points[j].x) ** 2 + (points[i].y - points[j].y) ** 2,
      );
      expect(len).toBeCloseTo(sideLength, 5);
    }
  });

  it("half-radius vertex is halfway between center and full vertex", () => {
    const halfPt = polarToCartesian(cx, cy, radius * 0.5, 2);
    const fullPt = polarToCartesian(cx, cy, radius, 2);

    expect(halfPt.x).toBeCloseTo((cx + fullPt.x) / 2, 5);
    expect(halfPt.y).toBeCloseTo((cy + fullPt.y) / 2, 5);
  });

  it("different center coordinates translate correctly", () => {
    const pt = polarToCartesian(200, 300, 50, 0);

    // Index 0 at -90 degrees: cos(-90)=0, sin(-90)=-1
    expect(pt.x).toBeCloseTo(200, 5);
    expect(pt.y).toBeCloseTo(250, 5); // 300 - 50
  });

  it("vertices are arranged clockwise (convex polygon)", () => {
    const points = Array.from({ length: 5 }, (_, i) =>
      polarToCartesian(cx, cy, radius, i),
    );

    // Cross products of consecutive edges should all have the same sign
    const signs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const a = points[i];
      const b = points[(i + 1) % 5];
      const c = points[(i + 2) % 5];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      signs.push(Math.sign(cross));
    }

    for (let i = 1; i < signs.length; i++) {
      expect(signs[i]).toBe(signs[0]);
    }
  });

  it("card-sized pentagon (size=240) top vertex is correct", () => {
    const cardRadius = 240 * 0.38;
    const top = polarToCartesian(cx, cy, cardRadius, 0);
    expect(top.x).toBeCloseTo(cx, 5);
    expect(top.y).toBeCloseTo(cy - cardRadius, 5);
  });

  it("story-sized pentagon (size=360) top vertex is correct", () => {
    const storyCx = 180;
    const storyCy = 180;
    const storyRadius = 360 * 0.38;

    const top = polarToCartesian(storyCx, storyCy, storyRadius, 0);
    expect(top.x).toBeCloseTo(storyCx, 5);
    expect(top.y).toBeCloseTo(storyCy - storyRadius, 5);
  });
});

// =============================================================================
// toPointsString — SVG polygon points serialization
// =============================================================================

describe("toPointsString", () => {
  it("serializes points to SVG polygon points format", () => {
    const points = [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
    ];

    expect(toPointsString(points)).toBe("10,20 30,40 50,60");
  });

  it("handles empty array", () => {
    expect(toPointsString([])).toBe("");
  });

  it("handles single point", () => {
    expect(toPointsString([{ x: 100, y: 200 }])).toBe("100,200");
  });

  it("preserves decimal precision", () => {
    const points = [{ x: 10.123456, y: 20.789012 }];

    expect(toPointsString(points)).toBe("10.123456,20.789012");
  });
});

// =============================================================================
// PENTAGON_AXES — axis configuration
// =============================================================================

describe("PENTAGON_AXES", () => {
  it("has exactly 5 axes", () => {
    expect(PENTAGON_AXES).toHaveLength(5);
  });

  it("has the correct axis keys in order", () => {
    const keys = PENTAGON_AXES.map((a) => a.key);
    expect(keys).toEqual(["walkable", "buzzing", "settled", "accessible", "diverse"]);
  });

  it("has human-readable labels for each axis", () => {
    for (const axis of PENTAGON_AXES) {
      expect(axis.label).toBeTruthy();
      expect(typeof axis.label).toBe("string");
    }
  });
});

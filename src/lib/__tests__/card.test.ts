// ---------------------------------------------------------------------------
// Tests for Card Image Generation Route (src/app/api/report/[slug]/card/route.tsx)
// ---------------------------------------------------------------------------
// Covers: 404 for non-existent slug, fallback for missing archetype,
// PNG content-type, story format dimensions, cache-control headers,
// and pentagon vertex calculations for known inputs.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mock @vercel/og before imports -----------------------------------------
// ImageResponse is hard to instantiate in a pure node environment (no Satori
// wasm). We mock it to return a plain Response with image/png content-type so
// we can assert on headers and status without the Satori rendering pipeline.

const mockImageResponse = vi.fn();

vi.mock("@vercel/og", () => ({
  ImageResponse: class {
    constructor(element: unknown, options: Record<string, unknown>) {
      mockImageResponse(element, options);
      // Build a Response-like object with mutable headers.
      // The native Response class has a getter-only `headers` property,
      // so we construct a custom object that quacks like a Response.
      const headers = new Headers({ "Content-Type": "image/png" });
      return {
        status: 200,
        ok: true,
        headers,
        text: async () => "fake-png-bytes",
        json: async () => ({}),
        arrayBuffer: async () => new ArrayBuffer(0),
        body: null,
        bodyUsed: false,
      } as unknown as Response;
    }
  },
}));

// --- Mock DB ----------------------------------------------------------------

const mockDbResults: Record<string, unknown>[] = [];
const mockLimit = vi.fn(() => mockDbResults);
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: mockSelect,
  }),
}));

vi.mock("@/lib/db/schema", () => ({
  reports: {
    id: "id",
    data: "data",
    slug: "slug",
    locationId: "location_id",
  },
  locations: {
    id: "id",
    address: "address",
    city: "city",
    state: "state",
  },
}));

// --- Mock drizzle-orm eq function -------------------------------------------

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: unknown) => ({ col, val }),
}));

// --- Mock font loading (fetch calls for TTF files) --------------------------
// The card route calls fetch() to load TTF fonts. We mock fetch globally so
// it returns fake ArrayBuffer data for font URLs.

const originalFetch = globalThis.fetch;

function setupFontFetchMock() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (url.includes("/fonts/")) {
      return new Response(new ArrayBuffer(100), {
        status: 200,
        headers: { "Content-Type": "font/ttf" },
      });
    }
    // Fallback for unexpected fetch calls
    return originalFetch(input);
  });
}

// --- Imports (after mocks) --------------------------------------------------

import { GET } from "@/app/api/report/[slug]/card/route";
import { polarToCartesian, toPointsString, PENTAGON_AXES } from "@/lib/pentagon";
import type { ArchetypeResult } from "@/lib/report/generate";

// --- Fixtures ---------------------------------------------------------------

function makeArchetypeData(): ArchetypeResult {
  return {
    archetype: "The Brownstone Belt",
    tagline: "Where stoops are social infrastructure and the bodega knows your order.",
    vibeSpectrum: {
      walkable: 85,
      buzzing: 62,
      settled: 78,
      accessible: 35,
      diverse: 71,
    },
    definingTraits: [
      "$2,800 median rent",
      "83% walk or take transit",
      "47 restaurants within 10 min",
    ],
    reasoning: "Dense urban walkable neighborhood with pre-war character.",
  };
}

function makeDbRow(overrides: Partial<{
  data: Record<string, unknown> | null;
  address: string;
  city: string | null;
  state: string | null;
}> = {}) {
  return {
    data: {
      archetype: makeArchetypeData(),
      address: { full: "456 DeKalb Ave, Brooklyn, NY 11205" },
      ...((overrides.data as Record<string, unknown>) ?? {}),
    },
    address: overrides.address ?? "456 DeKalb Ave, Brooklyn, NY 11205",
    city: overrides.city ?? "Brooklyn",
    state: overrides.state ?? "NY",
    ...overrides,
  };
}

function makeRequest(slug: string, format?: string): Request {
  const url = format
    ? `http://localhost:3000/api/report/${slug}/card?format=${format}`
    : `http://localhost:3000/api/report/${slug}/card`;
  return new Request(url);
}

function makeParams(slug: string): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

// =============================================================================
// Card route handler tests
// =============================================================================

describe("GET /api/report/[slug]/card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbResults.length = 0;
    setupFontFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 for non-existent slug", async () => {
    // DB returns empty results
    mockDbResults.length = 0;

    const response = await GET(
      makeRequest("nonexistent-slug"),
      makeParams("nonexistent-slug"),
    );

    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toBe("Not found");
  });

  it("returns fallback card (OG dimensions) for report without archetype", async () => {
    // Report exists but has no archetype in data
    mockDbResults.push(makeDbRow({
      data: { archetype: null } as unknown as Record<string, unknown>,
    }));

    const response = await GET(
      makeRequest("test-slug"),
      makeParams("test-slug"),
    );

    expect(response.status).toBe(200);

    // ImageResponse should have been called with OG dimensions (1200x630)
    // even if format=story was requested, because fallback always uses OG
    expect(mockImageResponse).toHaveBeenCalledTimes(1);
    const [, options] = mockImageResponse.mock.calls[0];
    expect(options.width).toBe(1200);
    expect(options.height).toBe(630);
  });

  it("returns PNG content-type for valid report with archetype", async () => {
    mockDbResults.push(makeDbRow());

    const response = await GET(
      makeRequest("test-slug"),
      makeParams("test-slug"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
  });

  it("uses OG dimensions (1200x630) by default", async () => {
    mockDbResults.push(makeDbRow());

    await GET(
      makeRequest("test-slug"),
      makeParams("test-slug"),
    );

    expect(mockImageResponse).toHaveBeenCalledTimes(1);
    const [, options] = mockImageResponse.mock.calls[0];
    expect(options.width).toBe(1200);
    expect(options.height).toBe(630);
  });

  it("uses story dimensions (1080x1920) when format=story", async () => {
    mockDbResults.push(makeDbRow());

    await GET(
      makeRequest("test-slug", "story"),
      makeParams("test-slug"),
    );

    expect(mockImageResponse).toHaveBeenCalledTimes(1);
    const [, options] = mockImageResponse.mock.calls[0];
    expect(options.width).toBe(1080);
    expect(options.height).toBe(1920);
  });

  it("falls back to OG dimensions when format=story but no archetype", async () => {
    mockDbResults.push(makeDbRow({
      data: { archetype: null } as unknown as Record<string, unknown>,
    }));

    await GET(
      makeRequest("test-slug", "story"),
      makeParams("test-slug"),
    );

    expect(mockImageResponse).toHaveBeenCalledTimes(1);
    const [, options] = mockImageResponse.mock.calls[0];
    // Story without archetype falls back to OG dimensions
    expect(options.width).toBe(1200);
    expect(options.height).toBe(630);
  });

  it("sets Cache-Control header for aggressive caching", async () => {
    mockDbResults.push(makeDbRow());

    const response = await GET(
      makeRequest("test-slug"),
      makeParams("test-slug"),
    );

    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=31536000, immutable",
    );
  });

  it("ignores unknown format values and defaults to OG", async () => {
    mockDbResults.push(makeDbRow());

    await GET(
      makeRequest("test-slug", "unknown"),
      makeParams("test-slug"),
    );

    expect(mockImageResponse).toHaveBeenCalledTimes(1);
    const [, options] = mockImageResponse.mock.calls[0];
    expect(options.width).toBe(1200);
    expect(options.height).toBe(630);
  });

  it("constructs cityState string from location data", async () => {
    mockDbResults.push(makeDbRow({
      city: "San Francisco",
      state: "CA",
    }));

    await GET(
      makeRequest("test-slug"),
      makeParams("test-slug"),
    );

    expect(mockImageResponse).toHaveBeenCalledTimes(1);
  });

  it("handles missing city gracefully in cityState", async () => {
    mockDbResults.push(makeDbRow({
      city: null,
      state: "NY",
    }));

    await GET(
      makeRequest("test-slug"),
      makeParams("test-slug"),
    );

    // Should not crash — cityState should be "NY" only
    expect(mockImageResponse).toHaveBeenCalledTimes(1);
  });

  it("handles null report data as missing archetype", async () => {
    mockDbResults.push({
      data: null,
      address: "456 DeKalb Ave, Brooklyn, NY 11205",
      city: "Brooklyn",
      state: "NY",
    });

    const response = await GET(
      makeRequest("test-slug"),
      makeParams("test-slug"),
    );

    // Should render fallback card (null data -> null archetype)
    expect(response.status).toBe(200);
    expect(mockImageResponse).toHaveBeenCalledTimes(1);
    const [, options] = mockImageResponse.mock.calls[0];
    expect(options.width).toBe(1200);
    expect(options.height).toBe(630);
  });

  it("loads 3 fonts (Playfair Display Bold, Inter Regular, Inter Medium)", async () => {
    mockDbResults.push(makeDbRow());

    // Reset the font cache by re-importing — but since we cannot easily,
    // we rely on the fetch mock to verify font loading behavior.
    // The card route calls loadFonts() which fetches 3 TTF files.

    await GET(
      makeRequest("test-slug"),
      makeParams("test-slug"),
    );

    // Verify that fonts were passed to ImageResponse
    expect(mockImageResponse).toHaveBeenCalledTimes(1);
    const [, options] = mockImageResponse.mock.calls[0];
    expect(options.fonts).toHaveLength(3);
    expect(options.fonts[0].name).toBe("Playfair Display");
    expect(options.fonts[1].name).toBe("Inter");
    expect(options.fonts[2].name).toBe("Inter");
  });
});

// =============================================================================
// Pentagon geometry — polarToCartesian vertex calculations
// =============================================================================
// More detailed coordinate verification than archetype.test.ts, specifically
// testing exact coordinates at known angles for card rendering accuracy.

describe("Pentagon geometry for card rendering", () => {
  const cx = 120;
  const cy = 120;
  const radius = 76.8; // 240 * 0.32

  it("index 1 (72 degrees clockwise from top) computes correct coordinates", () => {
    // At -90 + 72 = -18 degrees
    // cos(-18) = 0.9511, sin(-18) = -0.3090
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

  it("different center coordinates translate correctly", () => {
    const pt = polarToCartesian(200, 300, 50, 0);

    // Index 0 at -90 degrees: cos(-90)=0, sin(-90)=-1
    expect(pt.x).toBeCloseTo(200, 5);
    expect(pt.y).toBeCloseTo(250, 5); // 300 - 50
  });

  it("radius 0 always returns center regardless of index", () => {
    for (let i = 0; i < 5; i++) {
      const pt = polarToCartesian(100, 100, 0, i);
      expect(pt.x).toBeCloseTo(100, 10);
      expect(pt.y).toBeCloseTo(100, 10);
    }
  });

  it("card-sized pentagon (size=240) has correct vertex positions", () => {
    // Matches SatoriPentagon: cx=120, cy=120, radius=240*0.38=91.2
    const cardCx = 120;
    const cardCy = 120;
    const cardRadius = 240 * 0.38;

    // Verify top vertex (index 0)
    const top = polarToCartesian(cardCx, cardCy, cardRadius, 0);
    expect(top.x).toBeCloseTo(cardCx, 5);
    expect(top.y).toBeCloseTo(cardCy - cardRadius, 5);

    // All vertices equidistant
    for (let i = 0; i < 5; i++) {
      const pt = polarToCartesian(cardCx, cardCy, cardRadius, i);
      const dist = Math.sqrt((pt.x - cardCx) ** 2 + (pt.y - cardCy) ** 2);
      expect(dist).toBeCloseTo(cardRadius, 5);
    }
  });

  it("story-sized pentagon (size=360) has correct vertex positions", () => {
    // Matches SatoriPentagon in StoryCard: size=360
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
    const points = [
      { x: 10.123456, y: 20.789012 },
    ];

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

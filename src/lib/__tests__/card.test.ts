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

// --- Mock font loading (fs.readFile for woff files) -------------------------
// The card route reads font files from disk via node:fs/promises. We mock
// readFile to return fake ArrayBuffer data for font paths.
// NOTE: The card route's module-level fontCache persists across tests (it is
// populated on the first test run and reused thereafter). This mirrors
// production behavior but means only the first test exercises font loading.

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => Buffer.alloc(100)),
}));

// --- Imports (after mocks) --------------------------------------------------

import { GET } from "@/app/api/report/[slug]/card/route";
import type { ArchetypeResult } from "@/lib/report/generate";

// Pentagon geometry tests are consolidated in src/lib/__tests__/pentagon.test.ts

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
    const [element] = mockImageResponse.mock.calls[0] as [{ props: { cityState: string } }];
    expect(element.props.cityState).toBe("San Francisco, CA");
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

    expect(mockImageResponse).toHaveBeenCalledTimes(1);
    const [element] = mockImageResponse.mock.calls[0] as [{ props: { cityState: string } }];
    expect(element.props.cityState).toBe("NY");
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

// Pentagon geometry, toPointsString, and PENTAGON_AXES tests are consolidated
// in src/lib/__tests__/pentagon.test.ts

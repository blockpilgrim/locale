import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks -------------------------------------------------------------------

// Mock the database module.
const mockSelectLimit = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockSelectLimit,
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/db/schema", () => ({
  locations: { id: "id", address: "address" },
  reports: { id: "id", slug: "slug", locationId: "location_id", status: "status" },
}));

// Mock rate limiter to always allow.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: {
    check: () => ({
      success: true,
      remaining: 9,
      reset: Math.ceil(Date.now() / 1000) + 3600,
    }),
    headers: () => ({
      "X-RateLimit-Limit": "10",
      "X-RateLimit-Remaining": "9",
      "X-RateLimit-Reset": String(Math.ceil(Date.now() / 1000) + 3600),
    }),
    createLimitResponse: () =>
      new Response(JSON.stringify({ error: "Too many requests." }), {
        status: 429,
      }),
  },
}));

// Mock the report generator.
vi.mock("@/lib/report/generate", () => ({
  generateReport: vi.fn(),
}));

// Mock the narrative generator.
vi.mock("@/lib/report/narrative", () => ({
  generateNarrative: vi.fn(),
}));

import { POST } from "@/app/api/report/generate/route";
import { generateReport } from "@/lib/report/generate";
import { generateNarrative } from "@/lib/report/narrative";

// --- Helpers -----------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/report/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Tests -------------------------------------------------------------------

describe("POST /api/report/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    // Override the rate limiter mock for this test.
    const { rateLimit: rl } = await import("@/lib/rate-limit");
    vi.spyOn(rl, "check").mockReturnValueOnce({
      success: false,
      remaining: 0,
      reset: Math.ceil(Date.now() / 1000) + 3600,
    });

    const response = await POST(
      makeRequest({
        address: "123 Main St",
        latitude: 39.78,
        longitude: -89.65,
      }),
    );

    expect(response.status).toBe(429);
  });

  it("returns 500 when the report orchestrator throws", async () => {
    mockSelectLimit.mockResolvedValueOnce([]); // no cached location

    vi.mocked(generateReport).mockRejectedValueOnce(
      new Error("DB insert failed"),
    );

    const response = await POST(
      makeRequest({
        address: "500 Crash Ave, Bugtown, NJ",
        latitude: 40.0,
        longitude: -74.0,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("Report generation failed");
  });

  it("returns 400 for address exceeding 500 characters", async () => {
    const longAddress = "a".repeat(501);
    const response = await POST(
      makeRequest({ address: longAddress, latitude: 39.78, longitude: -89.65 }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("address");
  });

  it("returns 400 for missing address", async () => {
    const response = await POST(
      makeRequest({ latitude: 39.78, longitude: -89.65 }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("address");
  });

  it("returns 400 for missing latitude", async () => {
    const response = await POST(
      makeRequest({ address: "123 Main St", longitude: -89.65 }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("latitude");
  });

  it("returns 400 for missing longitude", async () => {
    const response = await POST(
      makeRequest({ address: "123 Main St", latitude: 39.78 }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("longitude");
  });

  it("returns 400 for latitude out of range", async () => {
    const response = await POST(
      makeRequest({
        address: "123 Main St",
        latitude: 100,
        longitude: -89.65,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("latitude");
  });

  it("returns 400 for longitude out of range", async () => {
    const response = await POST(
      makeRequest({
        address: "123 Main St",
        latitude: 39.78,
        longitude: -200,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("longitude");
  });

  it("returns 400 for empty address string", async () => {
    const response = await POST(
      makeRequest({ address: "   ", latitude: 39.78, longitude: -89.65 }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("address");
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = new Request("http://localhost/api/report/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Invalid JSON");
  });

  it("returns cached report when address already exists", async () => {
    // First call: location exists.
    mockSelectLimit
      .mockResolvedValueOnce([{ id: 42 }]) // location found
      .mockResolvedValueOnce([{ slug: "123-main-st-springfield-il", status: "complete" }]); // report found

    const response = await POST(
      makeRequest({
        address: "123 Main St, Springfield, IL",
        latitude: 39.78,
        longitude: -89.65,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cached).toBe(true);
    expect(body.slug).toBe("123-main-st-springfield-il");

    // Should NOT have called generateReport.
    expect(generateReport).not.toHaveBeenCalled();
  });

  it("returns 502 when report is not viable (all data sources failed)", async () => {
    mockSelectLimit.mockResolvedValue([]); // No cached report

    vi.mocked(generateReport).mockResolvedValueOnce({
      slug: "789-elm-st-nowhere-tx",
      reportId: 1,
      locationId: 1,
      data: {
        address: { full: "789 Elm St, Nowhere, TX" },
        coordinates: { latitude: 30.0, longitude: -97.0 },
        census: null,
        isochrone: null,
        poi: null,
        availableSections: { census: false, isochrone: false, poi: false },
        fetchedAt: new Date().toISOString(),
      },
      isViable: false,
    });

    const response = await POST(
      makeRequest({
        address: "789 Elm St, Nowhere, TX",
        latitude: 30.0,
        longitude: -97.0,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toContain("All data sources failed");
    expect(body.slug).toBe("789-elm-st-nowhere-tx");
  });

  it("starts narrative generation and returns streaming response for viable reports", async () => {
    mockSelectLimit.mockResolvedValue([]); // No cached report

    vi.mocked(generateReport).mockResolvedValueOnce({
      slug: "123-main-st-springfield-il",
      reportId: 1,
      locationId: 1,
      data: {
        address: { full: "123 Main St, Springfield, IL" },
        coordinates: { latitude: 39.78, longitude: -89.65 },
        census: null, // Simplified for test
        isochrone: null,
        poi: null,
        availableSections: { census: true, isochrone: false, poi: false },
        fetchedAt: new Date().toISOString(),
      },
      isViable: true,
    });

    // Mock the narrative stream.
    const mockStreamResponse = new Response("streaming narrative text", {
      headers: { "Content-Type": "text/plain" },
    });
    vi.mocked(generateNarrative).mockResolvedValueOnce({
      toTextStreamResponse: () => mockStreamResponse,
    } as ReturnType<typeof generateNarrative> extends Promise<infer T> ? T : never);

    const response = await POST(
      makeRequest({
        address: "123 Main St, Springfield, IL",
        latitude: 39.78,
        longitude: -89.65,
      }),
    );

    // The response should be the stream response.
    expect(generateReport).toHaveBeenCalled();
    expect(generateNarrative).toHaveBeenCalledWith(1, expect.any(Object));
    expect(response).toBe(mockStreamResponse);
  });

  it("returns JSON fallback when narrative generation fails", async () => {
    mockSelectLimit.mockResolvedValue([]);

    vi.mocked(generateReport).mockResolvedValueOnce({
      slug: "test-slug",
      reportId: 1,
      locationId: 1,
      data: {
        address: { full: "Test" },
        coordinates: { latitude: 40, longitude: -74 },
        census: null,
        isochrone: null,
        poi: null,
        availableSections: { census: true, isochrone: false, poi: false },
        fetchedAt: new Date().toISOString(),
      },
      isViable: true,
    });

    vi.mocked(generateNarrative).mockRejectedValueOnce(
      new Error("ANTHROPIC_API_KEY is not set"),
    );

    const response = await POST(
      makeRequest({
        address: "Test",
        latitude: 40,
        longitude: -74,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.slug).toBe("test-slug");
    expect(body.narrativeError).toBe(true);
  });
});

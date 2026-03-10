import { describe, it, expect, vi, afterEach } from "vitest";

// Mock the geocoding module before importing the route handler.
vi.mock("@/lib/mapbox/geocoding", () => ({
  forwardGeocode: vi.fn(),
}));

// Mock the rate limiter to always allow requests (tested separately).
vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({
    check: () => ({ success: true, remaining: 59, reset: Math.ceil(Date.now() / 1000) + 3600 }),
    headers: () => ({
      "X-RateLimit-Limit": "60",
      "X-RateLimit-Remaining": "59",
      "X-RateLimit-Reset": String(Math.ceil(Date.now() / 1000) + 3600),
    }),
    createLimitResponse: () =>
      new Response(JSON.stringify({ error: "Too many requests." }), { status: 429 }),
  }),
}));

import { GET } from "@/app/api/geocode/route";
import { forwardGeocode } from "@/lib/mapbox/geocoding";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/geocode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when query is shorter than 3 characters", async () => {
    const request = new Request("http://localhost/api/geocode?q=ab");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/at least 3 characters/);
  });

  it("returns 400 when query is missing", async () => {
    const request = new Request("http://localhost/api/geocode");
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 when query is only whitespace", async () => {
    const request = new Request("http://localhost/api/geocode?q=  ");
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it("returns 400 when query exceeds 200 characters", async () => {
    const longQuery = "a".repeat(201);
    const request = new Request(`http://localhost/api/geocode?q=${longQuery}`);
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/at most 200 characters/);
  });

  it("proxies valid queries to forwardGeocode and returns results", async () => {
    const mockResult = {
      suggestions: [
        {
          id: "abc123",
          fullAddress: "123 Main St, Springfield, IL",
          name: "123 Main St",
          longitude: -89.65,
          latitude: 39.78,
          city: "Springfield",
          state: "Illinois",
          zip: "62701",
        },
      ],
    };

    vi.mocked(forwardGeocode).mockResolvedValueOnce(mockResult);

    const request = new Request("http://localhost/api/geocode?q=123+Main+St");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].fullAddress).toBe(
      "123 Main St, Springfield, IL",
    );

    expect(forwardGeocode).toHaveBeenCalledWith("123 Main St");
  });

  it("returns 500 when forwardGeocode throws", async () => {
    vi.mocked(forwardGeocode).mockRejectedValueOnce(
      new Error("MAPBOX_ACCESS_TOKEN is not set"),
    );

    const request = new Request("http://localhost/api/geocode?q=123+Main+St");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/unavailable/i);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { forwardGeocode } from "@/lib/mapbox/geocoding";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function makeMapboxResponse(features: unknown[]) {
  return {
    type: "FeatureCollection",
    features,
  };
}

function makeFeature(overrides: Record<string, unknown> = {}) {
  return {
    id: "address.123",
    type: "Feature",
    properties: {
      mapbox_id: "dXJuOm1ieGFkcjo...",
      feature_type: "address",
      name: "123 Main St",
      full_address: "123 Main St, Springfield, IL 62701",
      context: {
        place: { name: "Springfield" },
        region: { name: "Illinois", region_code: "IL" },
        postcode: { name: "62701" },
        country: { name: "United States", country_code: "US" },
      },
      ...overrides,
    },
    geometry: {
      type: "Point",
      coordinates: [-89.6501, 39.7817],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("forwardGeocode", () => {
  beforeEach(() => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns structured suggestions from Mapbox API response", async () => {
    const mockResponse = makeMapboxResponse([makeFeature()]);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await forwardGeocode("123 Main St");

    expect(result.suggestions).toHaveLength(1);
    const s = result.suggestions[0];
    expect(s.id).toBe("dXJuOm1ieGFkcjo...");
    expect(s.fullAddress).toBe("123 Main St, Springfield, IL 62701");
    expect(s.name).toBe("123 Main St");
    expect(s.longitude).toBe(-89.6501);
    expect(s.latitude).toBe(39.7817);
    expect(s.city).toBe("Springfield");
    expect(s.state).toBe("Illinois");
    expect(s.zip).toBe("62701");
  });

  it("sends US-only filter and correct parameters", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeMapboxResponse([])), { status: 200 }),
    );

    await forwardGeocode("test query", { limit: 3 });

    const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("q")).toBe("test query");
    expect(calledUrl.searchParams.get("country")).toBe("us");
    expect(calledUrl.searchParams.get("limit")).toBe("3");
    expect(calledUrl.searchParams.get("types")).toBe("address,place");
    expect(calledUrl.searchParams.get("access_token")).toBe("test-token");
  });

  it("returns empty suggestions on API error (non-200)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }),
    );

    const result = await forwardGeocode("test");
    expect(result.suggestions).toEqual([]);
  });

  it("returns empty suggestions on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    const result = await forwardGeocode("test");
    expect(result.suggestions).toEqual([]);
  });

  it("throws when MAPBOX_ACCESS_TOKEN is missing", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(forwardGeocode("test")).rejects.toThrow(
      "MAPBOX_ACCESS_TOKEN is not set",
    );
  });

  it("handles features with missing context fields", async () => {
    const feature = makeFeature({ context: undefined, full_address: undefined });
    const mockResponse = makeMapboxResponse([feature]);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await forwardGeocode("test");
    const s = result.suggestions[0];
    expect(s.city).toBeNull();
    expect(s.state).toBeNull();
    expect(s.zip).toBeNull();
    expect(s.fullAddress).toBe("123 Main St"); // falls back to name
  });
});

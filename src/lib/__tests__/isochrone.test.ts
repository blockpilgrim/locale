import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchIsochrone } from "@/lib/mapbox/isochrone";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function makeIsochroneResponse() {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { contour: 5, color: "#6706ce", opacity: 0.33, metric: "contour" },
        geometry: {
          type: "Polygon",
          coordinates: [[[-73.99, 40.73], [-73.98, 40.73], [-73.98, 40.74], [-73.99, 40.73]]],
        },
      },
      {
        type: "Feature",
        properties: { contour: 10, color: "#41a6f0", opacity: 0.33, metric: "contour" },
        geometry: {
          type: "Polygon",
          coordinates: [[[-73.995, 40.725], [-73.975, 40.725], [-73.975, 40.745], [-73.995, 40.725]]],
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchIsochrone", () => {
  beforeEach(() => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns a typed FeatureCollection from Mapbox isochrone API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeIsochroneResponse()), { status: 200 }),
    );

    const result = await fetchIsochrone(-73.985, 40.735);

    expect(result).not.toBeNull();
    expect(result!.type).toBe("FeatureCollection");
    expect(result!.features).toHaveLength(2);

    const first = result!.features[0];
    expect(first.type).toBe("Feature");
    expect(first.properties.contour).toBe(5);
    expect(first.properties.color).toBe("#6706ce");
    expect(first.geometry.type).toBe("Polygon");
    expect(first.geometry.coordinates).toHaveLength(1);
  });

  it("builds the correct URL with default contour minutes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeIsochroneResponse()), { status: 200 }),
    );

    await fetchIsochrone(-73.985, 40.735);

    const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(calledUrl.pathname).toContain("walking/-73.985,40.735");
    expect(calledUrl.searchParams.get("contours_minutes")).toBe("5,10,15");
    expect(calledUrl.searchParams.get("polygons")).toBe("true");
  });

  it("accepts custom contour minutes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeIsochroneResponse()), { status: 200 }),
    );

    await fetchIsochrone(-73.985, 40.735, { contourMinutes: [10, 20] });

    const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("contours_minutes")).toBe("10,20");
  });

  it("returns null on API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Server Error", { status: 500, statusText: "Server Error" }),
    );

    const result = await fetchIsochrone(-73.985, 40.735);
    expect(result).toBeNull();
  });

  it("returns null on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error"),
    );

    const result = await fetchIsochrone(-73.985, 40.735);
    expect(result).toBeNull();
  });

  it("throws when MAPBOX_ACCESS_TOKEN is missing", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(fetchIsochrone(-73.985, 40.735)).rejects.toThrow(
      "MAPBOX_ACCESS_TOKEN is not set",
    );
  });
});

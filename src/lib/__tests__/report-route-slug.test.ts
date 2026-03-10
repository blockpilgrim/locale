import { describe, it, expect, vi, afterEach } from "vitest";

// --- Mocks -------------------------------------------------------------------

const mockSelectLimit = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: mockSelectLimit,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/db/schema", () => ({
  locations: { id: "id" },
  reports: { id: "id", slug: "slug", locationId: "location_id" },
}));

import { GET } from "@/app/api/report/[slug]/route";

// --- Helpers -----------------------------------------------------------------

function makeRequest(slug: string): [Request, { params: Promise<{ slug: string }> }] {
  return [
    new Request(`http://localhost/api/report/${slug}`),
    { params: Promise.resolve({ slug }) },
  ];
}

// --- Tests -------------------------------------------------------------------

describe("GET /api/report/[slug]", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 when slug is not found", async () => {
    mockSelectLimit.mockResolvedValueOnce([]);

    const response = await GET(...makeRequest("nonexistent-slug"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("not found");
  });

  it("returns full report data when slug is found", async () => {
    const mockRow = {
      reportId: 1,
      slug: "123-main-st-springfield-il",
      status: "complete",
      data: { address: { full: "123 Main St" } },
      narrative: "This is a wonderful area...",
      reportCreatedAt: new Date("2026-03-10"),
      reportUpdatedAt: new Date("2026-03-10"),
      locationId: 42,
      address: "123 Main St, Springfield, IL",
      latitude: 39.78,
      longitude: -89.65,
      city: "Springfield",
      state: "IL",
      zip: "62701",
    };

    mockSelectLimit.mockResolvedValueOnce([mockRow]);

    const response = await GET(...makeRequest("123-main-st-springfield-il"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.slug).toBe("123-main-st-springfield-il");
    expect(body.report.status).toBe("complete");
    expect(body.report.narrative).toBe("This is a wonderful area...");
    expect(body.location.address).toBe("123 Main St, Springfield, IL");
    expect(body.location.latitude).toBe(39.78);
    expect(body.location.longitude).toBe(-89.65);
  });

  it("returns 400 for empty slug", async () => {
    const response = await GET(
      new Request("http://localhost/api/report/"),
      { params: Promise.resolve({ slug: "" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Invalid slug");
  });

  it("returns 400 for slug exceeding max length", async () => {
    const longSlug = "a".repeat(81);
    const response = await GET(...makeRequest(longSlug));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Invalid slug");
  });

  it("returns 500 when database query fails", async () => {
    mockSelectLimit.mockRejectedValueOnce(new Error("DB connection failed"));

    const response = await GET(...makeRequest("some-slug"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("Failed to fetch report");
  });
});

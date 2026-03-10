import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(ip?: string): Request {
  const headers: Record<string, string> = {};
  if (ip) {
    headers["x-forwarded-for"] = ip;
  }
  return new Request("http://localhost/api/test", { headers });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const req = makeRequest("1.2.3.4");

    const r1 = limiter.check(req);
    expect(r1.success).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limiter.check(req);
    expect(r2.success).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check(req);
    expect(r3.success).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("rejects requests exceeding the limit", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    const req = makeRequest("1.2.3.4");

    limiter.check(req); // 1
    limiter.check(req); // 2

    const r3 = limiter.check(req); // 3 -> over limit
    expect(r3.success).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("resets the window after the configured duration", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const req = makeRequest("1.2.3.4");

    const r1 = limiter.check(req);
    expect(r1.success).toBe(true);

    const r2 = limiter.check(req);
    expect(r2.success).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(60_001);

    const r3 = limiter.check(req);
    expect(r3.success).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("tracks different IPs independently", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    const r1 = limiter.check(makeRequest("1.1.1.1"));
    expect(r1.success).toBe(true);

    const r2 = limiter.check(makeRequest("2.2.2.2"));
    expect(r2.success).toBe(true);

    // First IP is now exhausted
    const r3 = limiter.check(makeRequest("1.1.1.1"));
    expect(r3.success).toBe(false);
  });

  it("uses first IP from comma-separated x-forwarded-for", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    const req = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "10.0.0.1, 192.168.1.1" },
    });

    const r1 = limiter.check(req);
    expect(r1.success).toBe(true);

    // Same first IP should be rate-limited
    const r2 = limiter.check(req);
    expect(r2.success).toBe(false);
  });

  it("falls back to 'unknown' key when no x-forwarded-for header", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    const r1 = limiter.check(makeRequest()); // no IP
    expect(r1.success).toBe(true);

    const r2 = limiter.check(makeRequest()); // no IP
    expect(r2.success).toBe(false);
  });

  it("createLimitResponse returns a 429 response with proper headers", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const req = makeRequest("1.2.3.4");

    limiter.check(req);
    const result = limiter.check(req); // over limit

    const response = limiter.createLimitResponse(result);
    expect(response.status).toBe(429);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("1");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("X-RateLimit-Reset")).toBeTruthy();
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  it("headers() returns correct rate-limit headers", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });
    const req = makeRequest("1.2.3.4");

    const result = limiter.check(req);
    const h = limiter.headers(result);

    expect(h).toHaveProperty("X-RateLimit-Limit", "5");
    expect(h).toHaveProperty("X-RateLimit-Remaining", "4");
    expect(h).toHaveProperty("X-RateLimit-Reset");
  });
});

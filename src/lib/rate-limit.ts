// ---------------------------------------------------------------------------
// In-memory rate limiter
// ---------------------------------------------------------------------------
// Simple token-bucket rate limiter backed by a Map. Suitable for
// single-process deployments (dev / MVP). Replace with Redis-backed
// implementation (e.g. @upstash/ratelimit) for multi-instance production.
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  /** Maximum requests allowed per window. @default 10 */
  limit?: number;
  /** Window duration in milliseconds. @default 3_600_000 (1 hour) */
  windowMs?: number;
}

interface RateLimitResult {
  /** Whether the request is allowed. */
  success: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
  /** Unix timestamp (seconds) when the window resets. */
  reset: number;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 3_600_000; // 1 hour

// Interval between automatic cleanup sweeps (5 minutes).
const CLEANUP_INTERVAL_MS = 300_000;

/**
 * Create a rate limiter instance with the given configuration.
 *
 * ```ts
 * const limiter = createRateLimiter({ limit: 10, windowMs: 3_600_000 });
 *
 * export async function POST(req: Request) {
 *   const result = limiter.check(req);
 *   if (!result.success) return limiter.createLimitResponse(result);
 *   // … handle request
 * }
 * ```
 */
export function createRateLimiter(config: RateLimitConfig = {}) {
  const limit = config.limit ?? DEFAULT_LIMIT;
  const windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;

  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup of expired entries to prevent unbounded memory growth.
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  function ensureCleanup() {
    if (cleanupTimer !== null) return;
    cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store) {
        if (entry.resetTime <= now) {
          store.delete(key);
        }
      }
      // If the store is empty after cleanup, stop the timer.
      if (store.size === 0 && cleanupTimer !== null) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
    }, CLEANUP_INTERVAL_MS);

    // Allow the Node.js process to exit even if the timer is still running.
    if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
      cleanupTimer.unref();
    }
  }

  /**
   * Derive a rate-limit key from the incoming request.
   * Uses the `x-forwarded-for` header (common behind proxies / Vercel) and
   * falls back to a static key when the IP cannot be determined.
   */
  function getKey(request: Request): string {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      // x-forwarded-for can be a comma-separated list; take the first entry.
      return forwarded.split(",")[0].trim();
    }
    // Fallback — in serverless environments the IP is typically available via
    // x-forwarded-for. If not, we use a static key (all traffic shares one
    // bucket). This is acceptable for dev / low-traffic MVP.
    return "unknown";
  }

  /**
   * Check rate limit for the given request.
   */
  function check(request: Request): RateLimitResult {
    ensureCleanup();

    const key = getKey(request);
    const now = Date.now();

    const existing = store.get(key);

    // If there is an existing entry whose window has not yet expired…
    if (existing && existing.resetTime > now) {
      existing.count += 1;
      const remaining = Math.max(limit - existing.count, 0);
      const resetSec = Math.ceil(existing.resetTime / 1000);

      if (existing.count > limit) {
        return { success: false, remaining: 0, reset: resetSec };
      }
      return { success: true, remaining, reset: resetSec };
    }

    // First request or window expired — create a new entry.
    const resetTime = now + windowMs;
    store.set(key, { count: 1, resetTime });
    return {
      success: true,
      remaining: limit - 1,
      reset: Math.ceil(resetTime / 1000),
    };
  }

  /**
   * Build rate-limit headers to attach to any response.
   */
  function headers(result: RateLimitResult): HeadersInit {
    return {
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(result.reset),
    };
  }

  /**
   * Create a 429 Too Many Requests response with appropriate headers.
   */
  function createLimitResponse(result: RateLimitResult): Response {
    return new Response(
      JSON.stringify({
        error: "Too many requests. Please try again later.",
        retryAfter: result.reset,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          ...headers(result),
        },
      },
    );
  }

  return { check, headers, createLimitResponse };
}

// ---------------------------------------------------------------------------
// Default singleton — 10 requests per hour. Import and use directly for the
// most common case.
// ---------------------------------------------------------------------------

/** Default rate limiter: 10 requests per hour per IP. */
export const rateLimit = createRateLimiter();

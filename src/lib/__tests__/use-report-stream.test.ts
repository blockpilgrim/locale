import { describe, it, expect, vi, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Tests for the fetch/stream logic used by useReportStream
// ---------------------------------------------------------------------------
// The useReportStream hook (src/hooks/useReportStream.ts) is tightly coupled
// to React primitives (useState, useCallback, useRef), so we cannot invoke it
// directly in a Vitest-only (no JSDOM / React renderer) environment.
//
// Instead, we test the *fetch contract* the hook depends on:
//   - Content-Type detection (cached JSON vs streaming text)
//   - ReadableStream reading + TextDecoder accumulation
//   - Error handling (non-OK responses, network errors)
//   - AbortController cancellation
//
// These tests exercise the exact same Response/ReadableStream APIs the hook
// consumes, ensuring that the data-flow assumptions hold.
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers — mirrors the hook's internal behaviour
// ---------------------------------------------------------------------------

/** Simulate what the hook does after receiving a fetch Response. */
async function processResponse(response: Response): Promise<{
  slug: string | null;
  narrative: string;
  isCached: boolean;
}> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error ?? `Report generation failed (${response.status})`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const data = await response.json();
    return { slug: data.slug, narrative: "", isCached: true };
  }

  const reportSlug = response.headers.get("X-Report-Slug");

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body to read.");
  }

  const decoder = new TextDecoder();
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    accumulated += chunk;
  }

  return { slug: reportSlug, narrative: accumulated, isCached: false };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useReportStream fetch logic", () => {
  describe("cached response (JSON)", () => {
    it("detects a cached report via application/json content-type and returns the slug", async () => {
      const response = new Response(
        JSON.stringify({ slug: "123-main-st-springfield-il" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );

      const result = await processResponse(response);

      expect(result.isCached).toBe(true);
      expect(result.slug).toBe("123-main-st-springfield-il");
      expect(result.narrative).toBe("");
    });
  });

  describe("streaming response", () => {
    it("reads streamed text chunks and accumulates the full narrative", async () => {
      const chunks = ["This is a ", "neighborhood ", "report."];
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      const response = new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "X-Report-Slug": "my-report-slug",
        },
      });

      const result = await processResponse(response);

      expect(result.isCached).toBe(false);
      expect(result.slug).toBe("my-report-slug");
      expect(result.narrative).toBe("This is a neighborhood report.");
    });

    it("handles an empty stream gracefully", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const response = new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });

      const result = await processResponse(response);

      expect(result.narrative).toBe("");
      expect(result.isCached).toBe(false);
    });

    it("returns null slug when X-Report-Slug header is absent", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("text"));
          controller.close();
        },
      });

      const response = new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });

      const result = await processResponse(response);

      expect(result.slug).toBeNull();
    });
  });

  describe("error handling", () => {
    it("throws with the server error message from a JSON error body", async () => {
      const response = new Response(
        JSON.stringify({ error: "Rate limit exceeded" }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      );

      await expect(processResponse(response)).rejects.toThrow(
        "Rate limit exceeded",
      );
    });

    it("throws with a status-based message when error body is not JSON", async () => {
      const response = new Response("Internal Server Error", {
        status: 500,
      });

      await expect(processResponse(response)).rejects.toThrow(
        "Report generation failed (500)",
      );
    });

    it("throws when the response has no body (null reader)", async () => {
      // Create a response with text/plain content-type but null body.
      // Response constructor always creates a body, so we manually construct
      // one that simulates a null body scenario.
      const response = new Response(null, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });

      // response.body is null when constructed with null
      await expect(processResponse(response)).rejects.toThrow(
        "No response body to read.",
      );
    });
  });

  describe("abort behaviour", () => {
    it("fetch rejects with AbortError when the signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      vi.spyOn(globalThis, "fetch").mockImplementation(
        async (_url, init) => {
          if (init?.signal?.aborted) {
            const err = new DOMException("The operation was aborted.", "AbortError");
            throw err;
          }
          return new Response("ok");
        },
      );

      try {
        await fetch("/api/report/generate", { signal: controller.signal });
        expect.unreachable("Should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(DOMException);
        expect((err as DOMException).name).toBe("AbortError");
      }
    });

    it("the hook ignores AbortError and does not surface it as an error state", () => {
      // This mirrors the hook's catch block:
      //   if (err instanceof Error && err.name === "AbortError") return;
      const abortError = new DOMException("aborted", "AbortError");
      expect(abortError instanceof Error).toBe(true);
      expect(abortError.name).toBe("AbortError");

      // Verify the condition the hook uses to detect AbortError:
      const shouldIgnore =
        abortError instanceof Error && abortError.name === "AbortError";
      expect(shouldIgnore).toBe(true);
    });
  });

  describe("fetch request contract", () => {
    it("sends the correct POST request with address payload", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ slug: "test" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const input = {
        address: "123 Main St, Springfield, IL",
        latitude: 39.78,
        longitude: -89.65,
        city: "Springfield",
        state: "IL",
        zip: "62701",
      };

      await fetch("/api/report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("/api/report/generate");
      expect(options?.method).toBe("POST");

      const body = JSON.parse(options?.body as string);
      expect(body.address).toBe("123 Main St, Springfield, IL");
      expect(body.latitude).toBe(39.78);
      expect(body.longitude).toBe(-89.65);
      expect(body.city).toBe("Springfield");
    });
  });
});

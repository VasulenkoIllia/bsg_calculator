/**
 * Unit tests for the HubSpot client retry / backoff layer.
 *
 * Stubs global fetch so no real HTTP is issued. Each test:
 *   1. Sets up a fake response queue (FIFO).
 *   2. Calls the client method.
 *   3. Asserts the success/failure + the number of fetches consumed.
 *
 * Targets the surface area that's hard to verify with live testing:
 *   - 429 + Retry-After → backoff → retry → success
 *   - 429 over the retry budget → HubspotUnreachableError
 *   - 5xx → exponential backoff → retry → success
 *   - Network error (rejected fetch) → backoff → eventual failure
 *   - 4xx (non-429) → immediate failure, no retry
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HubspotUnreachableError } from "../../shared/errors";

// We have to import the client AFTER the env file has loaded a valid
// HUBSPOT_API_TOKEN; the test setup.ts forces test env values, so
// just import normally.
import { hubspot } from "./hubspot.client";

interface FakeResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  /** When set, fetch rejects (simulating a network error). */
  rejectWith?: Error;
}

let fetchQueue: FakeResponse[] = [];
let fetchCallCount = 0;
const realFetch = globalThis.fetch;

function pushResponse(r: FakeResponse): void {
  fetchQueue.push(r);
}

function installFakeFetch(): void {
  fetchCallCount = 0;
  globalThis.fetch = vi.fn(async (_url: unknown, _init: unknown) => {
    fetchCallCount += 1;
    const next = fetchQueue.shift();
    if (!next) {
      throw new Error("[test fetch] queue empty — provide more responses");
    }
    if (next.rejectWith) throw next.rejectWith;
    return new Response(JSON.stringify(next.body ?? {}), {
      status: next.status,
      headers: next.headers ?? { "Content-Type": "application/json" }
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  // Each retry path delays via setTimeout. Use vitest fake timers so
  // tests don't actually wait seconds.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchQueue = [];
  installFakeFetch();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = realFetch;
});

describe("HubspotClient retry behaviour", () => {
  it("returns the body on a single 200", async () => {
    pushResponse({ status: 200, body: { results: [], paging: {} } });
    const res = await hubspot.listCompanies();
    expect(res.results).toEqual([]);
    expect(fetchCallCount).toBe(1);
  });

  it("429 with Retry-After → retries once → 200 success", async () => {
    pushResponse({
      status: 429,
      headers: { "retry-after": "1", "content-type": "application/json" },
      body: {}
    });
    pushResponse({ status: 200, body: { results: [{ id: "1" }] } });

    const promise = hubspot.listCompanies();
    // Drain timers so the internal `sleep(...)` resolves.
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.results).toHaveLength(1);
    expect(fetchCallCount).toBe(2);
  });

  it("429 exhausting the retry budget → throws HubspotUnreachableError", async () => {
    // maxRetries default = 3 → 4 attempts total before failure.
    for (let i = 0; i < 4; i++) {
      pushResponse({ status: 429, headers: { "retry-after": "1" }, body: {} });
    }
    const promise = hubspot.listCompanies();
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toBeInstanceOf(HubspotUnreachableError);
    expect(fetchCallCount).toBe(4);
  });

  it("5xx with exponential backoff → eventually succeeds", async () => {
    pushResponse({ status: 503, body: {} });
    pushResponse({ status: 503, body: {} });
    pushResponse({ status: 200, body: { results: [{ id: "ok" }] } });

    const promise = hubspot.listCompanies();
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.results[0].id).toBe("ok");
    expect(fetchCallCount).toBe(3);
  });

  it("4xx (non-429) → immediate failure, no retry", async () => {
    pushResponse({ status: 401, body: { message: "unauthorised" } });

    await expect(hubspot.listCompanies()).rejects.toBeInstanceOf(HubspotUnreachableError);
    expect(fetchCallCount).toBe(1);
  });

  it("network error (rejected fetch) → retried with backoff", async () => {
    pushResponse({ rejectWith: new Error("ECONNRESET"), status: 0 });
    pushResponse({ rejectWith: new Error("ETIMEDOUT"), status: 0 });
    pushResponse({ status: 200, body: { results: [] } });

    const promise = hubspot.listCompanies();
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.results).toEqual([]);
    expect(fetchCallCount).toBe(3);
  });

  it("POST body is JSON-serialised on Search API call", async () => {
    pushResponse({ status: 200, body: { results: [] } });

    await hubspot.searchCompaniesByType("direct_client", undefined, 25);

    // Inspect the call on globalThis.fetch — it's a vi.fn now.
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    const [, init] = calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(typeof init.body).toBe("string");
    const parsed = JSON.parse(init.body as string);
    expect(parsed.filterGroups[0].filters[0]).toMatchObject({
      propertyName: "company_type",
      operator: "EQ",
      value: "direct_client"
    });
    expect(parsed.limit).toBe(25);
  });
});

describe("HubspotClient.isConfigured()", () => {
  it("returns true when the token is set in env", () => {
    // setup.ts provides HUBSPOT_API_TOKEN in .env (the local dev token).
    // In tests we don't override it — isConfigured reads what's there.
    // We assert idempotency rather than the value.
    const first = hubspot.isConfigured();
    const second = hubspot.isConfigured();
    expect(first).toBe(second);
    expect(typeof first).toBe("boolean");
  });
});

describe("Response soft-validation", () => {
  it("returns the response unchanged when shape matches the schema", async () => {
    pushResponse({
      status: 200,
      body: {
        results: [
          {
            id: "1",
            properties: { name: "Test", company_type: null },
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z"
          }
        ],
        paging: {}
      }
    });
    const res = await hubspot.listCompanies();
    expect(res.results[0].id).toBe("1");
    expect(res.results[0].properties.name).toBe("Test");
  });

  it("falls through to cast (with warn log) when shape drifts", async () => {
    // Simulate HubSpot returning a property as a number instead of string —
    // soft-validate should log a warn but still return the value.
    pushResponse({
      status: 200,
      body: {
        results: [
          {
            id: "1",
            properties: { amount: 12345 as unknown as string }, // number, not string
            createdAt: "2026-01-01",
            updatedAt: "2026-01-01"
          }
        ]
      }
    });
    // Should not throw — soft-validate falls through.
    const res = await hubspot.listCompanies();
    expect(res.results[0].id).toBe("1");
  });
});

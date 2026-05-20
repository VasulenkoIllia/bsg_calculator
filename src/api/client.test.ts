/**
 * API client interceptor tests.
 *
 * Verifies the cross-cutting concerns in `client.ts` that are
 * fiendish to get right by inspection:
 *   1. Bearer token gets attached when set
 *   2. No Bearer when token cleared
 *   3. 401 → refresh-once → replay original
 *   4. Single-flight refresh: N parallel 401s ⇒ ONE refresh call
 *   5. Refresh failure → setSessionLostHandler fires + ApiError surfaces
 *
 * Approach: stub axios's adapter so we can deterministically replay
 * any HTTP status without spinning up a server.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import {
  apiClient,
  ApiError,
  getAccessToken,
  setAccessToken,
  setSessionLostHandler
} from "./client.js";

// ─── Helpers ───────────────────────────────────────────────────────
type AdapterCall = {
  url?: string;
  method?: string;
  authorization?: string | undefined;
};

interface AdapterResponse {
  status: number;
  data?: unknown;
}

/**
 * Replace axios's adapter with a programmable mock. Each call records
 * what was sent; the script (array of responses) replies in order.
 */
function installMockAdapter(script: AdapterResponse[]): AdapterCall[] {
  const calls: AdapterCall[] = [];
  let i = 0;
  apiClient.defaults.adapter = async (
    config: InternalAxiosRequestConfig
  ): Promise<AxiosResponse> => {
    const auth = (config.headers?.Authorization ?? config.headers?.authorization) as
      | string
      | undefined;
    calls.push({
      url: config.url,
      method: config.method?.toUpperCase(),
      authorization: auth
    });
    const next = script[i++] ?? { status: 200, data: { ok: true } };
    if (next.status >= 400) {
      const err = new Error(`mock ${next.status}`) as Error & {
        response: unknown;
        config: InternalAxiosRequestConfig;
        isAxiosError: boolean;
      };
      err.isAxiosError = true;
      err.config = config;
      err.response = {
        status: next.status,
        data: next.data ?? { error: { code: "MOCK", message: `mock ${next.status}` } },
        headers: {},
        config,
        statusText: ""
      };
      throw err;
    }
    return {
      status: next.status,
      data: next.data ?? { ok: true },
      headers: {},
      config,
      statusText: "OK"
    };
  };
  return calls;
}

beforeEach(() => {
  setAccessToken(null);
  setSessionLostHandler(null);
});

afterEach(() => {
  // Reset the adapter so other test files aren't affected.
  apiClient.defaults.adapter = undefined as never;
});

describe("apiClient — Bearer token attachment", () => {
  it("attaches Authorization when token is set", async () => {
    setAccessToken("test-token");
    const calls = installMockAdapter([{ status: 200, data: { ok: true } }]);

    await apiClient.get("/ping");

    expect(calls).toHaveLength(1);
    expect(calls[0].authorization).toBe("Bearer test-token");
  });

  it("omits Authorization when token is cleared", async () => {
    setAccessToken(null);
    const calls = installMockAdapter([{ status: 200, data: { ok: true } }]);

    await apiClient.get("/ping");

    expect(calls[0].authorization).toBeUndefined();
  });
});

describe("apiClient — refresh-on-401", () => {
  it("retries the original request after a 401 + successful refresh", async () => {
    setAccessToken("old-token");
    const calls = installMockAdapter([
      { status: 401 }, // original /me
      { status: 200, data: { accessToken: "new-token" } }, // /auth/refresh
      { status: 200, data: { id: "u1" } } // retried /me
    ]);

    const { data } = await apiClient.get("/me");

    expect(data).toEqual({ id: "u1" });
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toBe("/me");
    expect(calls[1].url).toBe("/auth/refresh");
    expect(calls[2].url).toBe("/me");
    // Retry carries the FRESH token, not the stale one.
    expect(calls[2].authorization).toBe("Bearer new-token");
    expect(getAccessToken()).toBe("new-token");
  });

  it("single-flights parallel 401 requests to ONE refresh call", async () => {
    setAccessToken("old");
    // 3 parallel calls, each hits 401, then ONE shared refresh
    // resolves them all. Script: 401, 401, 401, REFRESH-OK, retry1,
    // retry2, retry3.
    const calls = installMockAdapter([
      { status: 401 },
      { status: 401 },
      { status: 401 },
      { status: 200, data: { accessToken: "fresh" } },
      { status: 200, data: { which: 1 } },
      { status: 200, data: { which: 2 } },
      { status: 200, data: { which: 3 } }
    ]);

    const results = await Promise.all([
      apiClient.get("/a"),
      apiClient.get("/b"),
      apiClient.get("/c")
    ]);

    expect(results.map((r: AxiosResponse) => r.data)).toEqual([
      { which: 1 },
      { which: 2 },
      { which: 3 }
    ]);
    // Exactly ONE /auth/refresh, despite 3 simultaneous 401s.
    const refreshCalls = calls.filter(c => c.url === "/auth/refresh");
    expect(refreshCalls).toHaveLength(1);
  });

  it("calls session-lost handler when refresh itself fails", async () => {
    setAccessToken("old");
    const lost = vi.fn();
    setSessionLostHandler(lost);

    installMockAdapter([
      { status: 401 }, // original
      { status: 401 } // refresh fails too
    ]);

    await expect(apiClient.get("/me")).rejects.toBeInstanceOf(ApiError);
    expect(lost).toHaveBeenCalledOnce();
    // Access token cleared as a side effect.
    expect(getAccessToken()).toBeNull();
  });

  it("does not infinite-loop when /auth/refresh itself 401s", async () => {
    // If the response interceptor wasn't guarding `_isRefresh`, this
    // test would hang forever as refresh tries to refresh-on-401 itself.
    installMockAdapter([{ status: 401 }]);

    await expect(apiClient.post("/auth/refresh")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("apiClient — error envelope mapping", () => {
  it("wraps backend envelope into ApiError with code + status", async () => {
    installMockAdapter([
      {
        status: 422,
        data: { error: { code: "VALIDATION", message: "Bad input", details: { field: "x" } } }
      }
    ]);

    try {
      await apiClient.post("/whatever", {});
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const e = err as ApiError;
      expect(e.code).toBe("VALIDATION");
      expect(e.status).toBe(422);
      expect(e.details).toEqual({ field: "x" });
    }
  });

  it("falls back to NETWORK_ERROR when no envelope present", async () => {
    // Install the throwing adapter via the same helper used by every
    // other test so the afterEach cleanup applies uniformly. Passing
    // an empty script lets the helper's default-fallthrough behaviour
    // run, but we override the adapter immediately below with a
    // throwing implementation.
    installMockAdapter([]);
    apiClient.defaults.adapter = async () => {
      throw new Error("ECONNREFUSED");
    };

    try {
      await apiClient.get("/ping");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("NETWORK_ERROR");
    }
  });
});

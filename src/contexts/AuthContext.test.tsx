/**
 * AuthContext lifecycle tests.
 *
 * Covers the four state transitions that matter:
 *   1. Cold-boot refresh succeeds → user hydrated
 *   2. Cold-boot refresh fails (401) → logged-out state
 *   3. login() updates state + sets token
 *   4. logout() clears state even when server call fails
 */

import { act, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./AuthContext.js";
import * as clientModule from "../api/client.js";
import * as authApi from "../api/auth.js";

const fixtureUser = {
  id: "u-1",
  login: "alice",
  displayName: "Alice",
  role: "operator" as const,
  active: true,
  createdAt: "2026-05-01T00:00:00.000Z"
};

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  clientModule.setAccessToken(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthContext — cold-boot refresh", () => {
  it("hydrates user when refresh succeeds", async () => {
    vi.spyOn(authApi, "refresh").mockResolvedValue({ accessToken: "boot-token" });
    vi.spyOn(authApi, "me").mockResolvedValue(fixtureUser);

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isBooting).toBe(true);
    await waitFor(() => {
      expect(result.current.isBooting).toBe(false);
    });
    expect(result.current.user).toEqual(fixtureUser);
    expect(clientModule.getAccessToken()).toBe("boot-token");
  });

  it("lands on logged-out state when refresh 401s (no warn spam)", async () => {
    const apiError = new clientModule.ApiError("AUTH_INVALID", "no", 401);
    vi.spyOn(authApi, "refresh").mockRejectedValue(apiError);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isBooting).toBe(false);
    });
    expect(result.current.user).toBeNull();
    // 401 is the "you are not logged in" signal — shouldn't be
    // logged as a warning. Any other error type would warn.
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when refresh fails for a non-401 reason", async () => {
    const networkError = new clientModule.ApiError("NETWORK_ERROR", "boom", 0);
    vi.spyOn(authApi, "refresh").mockRejectedValue(networkError);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isBooting).toBe(false);
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("AuthContext — login + logout", () => {
  beforeEach(() => {
    // Default cold-boot path → "not logged in" so we can drive
    // login/logout from a known empty state.
    vi.spyOn(authApi, "refresh").mockRejectedValue(
      new clientModule.ApiError("AUTH_INVALID", "no", 401)
    );
  });

  it("login() stores token + user, propagates ApiError on failure", async () => {
    const loginSpy = vi.spyOn(authApi, "login").mockResolvedValue({
      accessToken: "login-token",
      user: fixtureUser
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.isBooting).toBe(false);
    });

    await act(async () => {
      await result.current.login("alice", "pw");
    });

    expect(loginSpy).toHaveBeenCalledWith({ identifier: "alice", password: "pw" });
    expect(result.current.user).toEqual(fixtureUser);
    expect(clientModule.getAccessToken()).toBe("login-token");
  });

  it("login() does NOT swallow failures (caller handles UI)", async () => {
    const apiError = new clientModule.ApiError("AUTH_INVALID_CREDENTIALS", "bad", 401);
    vi.spyOn(authApi, "login").mockRejectedValue(apiError);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.isBooting).toBe(false);
    });

    await expect(result.current.login("alice", "wrong")).rejects.toBe(apiError);
    expect(result.current.user).toBeNull();
  });

  it("logout() clears state even if server call rejects", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue({
      accessToken: "login-token",
      user: fixtureUser
    });
    vi.spyOn(authApi, "logout").mockRejectedValue(
      new clientModule.ApiError("NETWORK_ERROR", "offline", 0)
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.isBooting).toBe(false);
    });

    await act(async () => {
      await result.current.login("alice", "pw");
    });
    expect(result.current.user).not.toBeNull();

    await act(async () => {
      await result.current.logout();
    });
    expect(result.current.user).toBeNull();
    expect(clientModule.getAccessToken()).toBeNull();
  });
});

describe("AuthContext — wrong usage", () => {
  it("useAuth() outside provider throws a clear error", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        // No <AuthProvider> wrapper on purpose.
        <Consumer />
      )
    ).toThrow(/useAuth must be used inside <AuthProvider>/);
    err.mockRestore();
  });
});

function Consumer() {
  useAuth();
  return <div />;
}

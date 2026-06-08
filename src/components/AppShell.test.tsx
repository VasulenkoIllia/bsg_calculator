/**
 * AppShell IdentityStrip tests.
 *
 * Covers the signed-in label + the Sign out button behaviour — the
 * full app smoke tests in renderApp pass through AppShell without
 * targeting this specific surface.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setAccessToken, setSessionLostHandler } from "../api/client.js";
import * as authApi from "../api/auth.js";
import { AuthProvider } from "../contexts/AuthContext.js";
import { AppShell } from "./AppShell.js";

const fixtureUser = {
  id: "u-1",
  email: "alice@bsg.test",
  login: "alice",
  displayName: "Alice Doe",
  role: "user" as const,
  isActive: true, twoFactorEnabled: false
};

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/calculator"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login screen</div>} />
          <Route element={<AppShell />}>
            <Route path="/calculator" element={<div>Calc content</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  setAccessToken(null);
  setSessionLostHandler(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AppShell IdentityStrip", () => {
  it("shows the signed-in name + sign-out button when authenticated", async () => {
    vi.spyOn(authApi, "refresh").mockResolvedValue({ accessToken: "tok" });
    vi.spyOn(authApi, "me").mockResolvedValue(fixtureUser);

    renderShell();

    await waitFor(() => {
      // Sprint 7.1: hero header is gone; only the AppHeader's
      // identity slot carries the signed-in label.
      expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
      expect(screen.getByText(/alice doe/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /sign out/i })
      ).toBeInTheDocument();
    });
  });

  it("logs out + redirects to /login on sign-out click", async () => {
    vi.spyOn(authApi, "refresh").mockResolvedValue({ accessToken: "tok" });
    vi.spyOn(authApi, "me").mockResolvedValue(fixtureUser);
    const logoutSpy = vi.spyOn(authApi, "logout").mockResolvedValue();

    renderShell();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(logoutSpy).toHaveBeenCalledOnce();
      expect(screen.getByText(/login screen/i)).toBeInTheDocument();
    });
  });
});

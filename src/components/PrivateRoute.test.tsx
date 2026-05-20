/**
 * PrivateRoute gate tests.
 *
 * Covers the three observable states that are otherwise only
 * indirectly tested via LoginPage's redirect tests:
 *   1. isBooting = true → "Loading session…" splash
 *   2. isBooting = false, user = null → Navigate to /login
 *   3. isBooting = false, user = present → children render
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError, setAccessToken, setSessionLostHandler } from "../api/client.js";
import * as authApi from "../api/auth.js";
import { AuthProvider } from "../contexts/AuthContext.js";
import { PrivateRoute } from "./PrivateRoute.js";

function renderGuarded(initialEntries: string[] = ["/secret"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login screen</div>} />
          <Route element={<PrivateRoute />}>
            <Route path="/secret" element={<div>Secret content</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

const fixtureUser = {
  id: "u-1",
  email: "alice@bsg.test",
  login: "alice",
  displayName: "Alice",
  isAdmin: false,
  isActive: true
};

beforeEach(() => {
  setAccessToken(null);
  setSessionLostHandler(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PrivateRoute", () => {
  it("renders the 'Loading session…' splash while booting", () => {
    // Make refresh hang forever so isBooting stays true. The Promise
    // never resolves, so React's tree stays in the booting state.
    vi.spyOn(authApi, "refresh").mockReturnValue(new Promise(() => {}));

    renderGuarded();

    expect(screen.getByText(/loading session/i)).toBeInTheDocument();
    expect(screen.queryByText(/secret content/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/login screen/i)).not.toBeInTheDocument();
  });

  it("redirects to /login when boot resolves with no session", async () => {
    vi.spyOn(authApi, "refresh").mockRejectedValue(
      new ApiError("AUTH_INVALID", "no", 401)
    );

    renderGuarded(["/secret"]);

    await waitFor(() => {
      expect(screen.getByText(/login screen/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/secret content/i)).not.toBeInTheDocument();
  });

  it("renders the protected outlet when authenticated", async () => {
    vi.spyOn(authApi, "refresh").mockResolvedValue({ accessToken: "tok" });
    vi.spyOn(authApi, "me").mockResolvedValue(fixtureUser);

    renderGuarded(["/secret"]);

    await waitFor(() => {
      expect(screen.getByText(/secret content/i)).toBeInTheDocument();
    });
  });
});

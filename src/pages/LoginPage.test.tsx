/**
 * LoginPage integration tests.
 *
 * Covers the user-visible behaviour, not the React internals:
 *   - empty submit shows validation errors
 *   - happy path calls AuthContext.login + navigates away
 *   - 401 from backend → human-readable error
 *   - already-logged-in user gets bounced to the redirect target
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError, setAccessToken } from "../api/client.js";
import * as authApi from "../api/auth.js";
import { AuthProvider } from "../contexts/AuthContext.js";
import { LoginPage } from "./LoginPage.js";

function renderLogin(initialEntries: string[] = ["/login"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/companies" element={<div>Companies landing</div>} />
          <Route path="/deep" element={<div>Deep page</div>} />
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
  // Default the cold-boot refresh to "no session" so login page renders.
  vi.spyOn(authApi, "refresh").mockRejectedValue(
    new ApiError("AUTH_INVALID", "no", 401)
  );
  setAccessToken(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LoginPage — validation", () => {
  it("shows inline errors for empty submit", async () => {
    renderLogin();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/enter your login or email/i)).toBeInTheDocument();
      expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
    });
  });
});

describe("LoginPage — happy path", () => {
  it("calls login + navigates to /companies on success", async () => {
    const loginSpy = vi
      .spyOn(authApi, "login")
      .mockResolvedValue({ accessToken: "tok", user: fixtureUser });

    renderLogin();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    });

    fireEvent.input(screen.getByLabelText(/login or email/i), {
      target: { value: "alice" }
    });
    fireEvent.input(screen.getByLabelText(/password/i), {
      target: { value: "pw" }
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith({ identifier: "alice", password: "pw" });
    });
    await waitFor(() => {
      expect(screen.getByText(/companies landing/i)).toBeInTheDocument();
    });
  });

  it("redirects to PrivateRoute.from when set", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue({
      accessToken: "tok",
      user: fixtureUser
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: "/login", state: { from: "/deep" } }]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/deep" element={<div>Deep page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    });
    fireEvent.input(screen.getByLabelText(/login or email/i), { target: { value: "alice" } });
    fireEvent.input(screen.getByLabelText(/password/i), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/deep page/i)).toBeInTheDocument();
    });
  });
});

describe("LoginPage — error mapping", () => {
  it("maps AUTH_INVALID_CREDENTIALS to a friendly message", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(
      new ApiError("AUTH_INVALID_CREDENTIALS", "bad", 401)
    );

    renderLogin();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    });

    fireEvent.input(screen.getByLabelText(/login or email/i), { target: { value: "alice" } });
    fireEvent.input(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/invalid login or password/i);
    });
  });

  it("maps RATE_LIMITED to its specific message", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(
      new ApiError("RATE_LIMITED", "slow", 429)
    );

    renderLogin();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    });

    fireEvent.input(screen.getByLabelText(/login or email/i), { target: { value: "alice" } });
    fireEvent.input(screen.getByLabelText(/password/i), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/too many login attempts/i);
    });
  });
});

describe("LoginPage — already-logged-in", () => {
  it("bounces a logged-in user to /companies", async () => {
    // Make cold-boot refresh succeed → user starts logged in.
    vi.spyOn(authApi, "refresh").mockResolvedValue({ accessToken: "tok" });
    vi.spyOn(authApi, "me").mockResolvedValue(fixtureUser);

    renderLogin();

    await waitFor(() => {
      expect(screen.getByText(/companies landing/i)).toBeInTheDocument();
    });
  });
});

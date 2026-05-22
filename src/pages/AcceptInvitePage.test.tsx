/**
 * AcceptInvitePage tests.
 *
 * Public, no-auth page mounted at /accept-invite?token=<raw>. The page:
 *   1. previews the invite on mount (role + expiresAt)
 *   2. renders the email/login/displayName/password form
 *   3. POSTs accept on submit, hydrates AuthContext, navigates /companies
 *   4. surfaces friendly errors for 404 / 409 / generic failures
 *
 * The auth side-effect is verified via the redirect: after successful
 * accept, PrivateRoute would let the user through to /companies, and
 * the page reaches that route. We mock the API calls directly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError, setAccessToken } from "../api/client.js";
import * as authApi from "../api/auth.js";
import * as invitesApi from "../api/invites.js";
import { AuthProvider } from "../contexts/AuthContext.js";
import { AcceptInvitePage } from "./AcceptInvitePage.js";

function renderAt(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/accept-invite?token=${token}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/companies" element={<div>Companies landing</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  // No session by default — auth cold-boot 401s.
  vi.spyOn(authApi, "refresh").mockRejectedValue(
    new ApiError("AUTH_INVALID", "no", 401)
  );
  setAccessToken(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AcceptInvitePage — already-logged-in guard", () => {
  it("shows the sign-out warning when an operator is already logged in", async () => {
    // Sprint 9.O follow-up — if the browser already has a session
    // (e.g. a super_admin clicking the invite link in the same tab
    // they're admin'ing the system from), DON'T silently overwrite
    // the cookie with the new user's tokens. Show a warning + an
    // explicit "Sign out and continue" step.
    vi.spyOn(authApi, "refresh").mockResolvedValue({ accessToken: "tok" });
    vi.spyOn(authApi, "me").mockResolvedValue({
      id: "u-sa",
      email: "sa@bsg.test",
      login: "sa",
      displayName: "Super Admin",
      role: "super_admin",
      isActive: true
    });

    renderAt("good-token");

    await waitFor(() => {
      expect(screen.getByText(/you're currently signed in as/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/sa@bsg\.test/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out and continue/i })).toBeInTheDocument();
    // The form should NOT render while the warning is up.
    expect(screen.queryByLabelText(/^email/i)).not.toBeInTheDocument();
  });
});

describe("AcceptInvitePage — preview states", () => {
  it("shows a friendly error for a 404 preview (unknown/used/expired)", async () => {
    vi.spyOn(invitesApi, "previewInvite").mockRejectedValue(
      new ApiError("RESOURCE_NOT_FOUND", "Invite not found.", 404)
    );

    renderAt("bad-token");

    await waitFor(() => {
      expect(
        screen.getByText(/this invite link is no longer valid/i)
      ).toBeInTheDocument();
    });
    // Form must NOT render.
    expect(screen.queryByLabelText(/^email/i)).not.toBeInTheDocument();
  });

  it("renders the form with the role label for a valid invite", async () => {
    vi.spyOn(invitesApi, "previewInvite").mockResolvedValue({
      role: "admin",
      expiresAt: "2026-12-31T23:59:59.000Z"
    });

    renderAt("good-token");

    await waitFor(() => {
      expect(screen.getByText(/you're invited as/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/admin — manage documents/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
  });
});

describe("AcceptInvitePage — submit", () => {
  it("calls acceptInvite and navigates to /companies on success", async () => {
    vi.spyOn(invitesApi, "previewInvite").mockResolvedValue({
      role: "user",
      expiresAt: "2026-12-31T23:59:59.000Z"
    });
    const acceptSpy = vi.spyOn(invitesApi, "acceptInvite").mockResolvedValue({
      accessToken: "fresh-token",
      user: {
        id: "u-new",
        email: "new@bsg.test",
        login: null,
        displayName: "Newbie",
        role: "user",
        isActive: true
      }
    });

    renderAt("good-token");
    await waitFor(() => {
      expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^email/i), {
      target: { value: "new@bsg.test" }
    });
    fireEvent.change(screen.getByLabelText(/^display name/i), {
      target: { value: "Newbie" }
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: "longEnoughPw1" }
    });
    fireEvent.click(screen.getByRole("button", { name: /accept invitation/i }));

    await waitFor(() => {
      expect(acceptSpy).toHaveBeenCalledWith("good-token", {
        email: "new@bsg.test",
        login: undefined,
        displayName: "Newbie",
        password: "longEnoughPw1"
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/companies landing/i)).toBeInTheDocument();
    });
  });

  it("surfaces CONFLICT_USER_EXISTS as a duplicate-account message", async () => {
    vi.spyOn(invitesApi, "previewInvite").mockResolvedValue({
      role: "user",
      expiresAt: "2026-12-31T23:59:59.000Z"
    });
    vi.spyOn(invitesApi, "acceptInvite").mockRejectedValue(
      new ApiError("CONFLICT_USER_EXISTS", "duplicate", 409)
    );

    renderAt("good-token");
    await waitFor(() => {
      expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^email/i), {
      target: { value: "taken@bsg.test" }
    });
    fireEvent.change(screen.getByLabelText(/^display name/i), {
      target: { value: "X" }
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: "longEnoughPw1" }
    });
    fireEvent.click(screen.getByRole("button", { name: /accept invitation/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /a user with this email or login already exists/i
      );
    });
  });
});

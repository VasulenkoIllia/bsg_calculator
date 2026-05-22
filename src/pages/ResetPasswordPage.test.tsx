/**
 * ResetPasswordPage tests — mirror of AcceptInvitePage tests.
 *
 * Public, no-auth page mounted at /reset-password?token=<raw>. Tests
 * cover preview success/404, mismatched-password validation, happy
 * submit + auto-login + navigation, and a 404-on-submit fallback
 * (the token was consumed by another tab between preview and submit).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError, setAccessToken } from "../api/client.js";
import * as authApi from "../api/auth.js";
import * as resetsApi from "../api/password-resets.js";
import { AuthProvider } from "../contexts/AuthContext.js";
import { ResetPasswordPage } from "./ResetPasswordPage.js";

function renderAt(token: string) {
  return render(
    <MemoryRouter initialEntries={[`/reset-password?token=${token}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/companies" element={<div>Companies landing</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.spyOn(authApi, "refresh").mockRejectedValue(
    new ApiError("AUTH_INVALID", "no", 401)
  );
  setAccessToken(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ResetPasswordPage — already-logged-in guard", () => {
  it("shows the sign-out warning when an operator is already logged in", async () => {
    // Sprint 9.O follow-up — see the matching test in
    // AcceptInvitePage.test.tsx for rationale. Consuming the reset
    // token auto-logs the user in, which would overwrite an
    // existing session cookie. Block that with an explicit step.
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
    expect(screen.queryByLabelText(/^new password/i)).not.toBeInTheDocument();
  });
});

describe("ResetPasswordPage — preview", () => {
  it("renders friendly error on 404 preview", async () => {
    vi.spyOn(resetsApi, "previewReset").mockRejectedValue(
      new ApiError("RESOURCE_NOT_FOUND", "Reset not found.", 404)
    );

    renderAt("bad-token");

    await waitFor(() => {
      expect(
        screen.getByText(/this reset link is no longer valid/i)
      ).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  });

  it("renders the form with the target user identifier", async () => {
    vi.spyOn(resetsApi, "previewReset").mockResolvedValue({
      email: "target@bsg.test",
      displayName: "Target User",
      expiresAt: "2026-12-31T23:59:59.000Z"
    });

    renderAt("good-token");

    await waitFor(() => {
      expect(screen.getByText(/setting a new password for/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Target User/)).toBeInTheDocument();
    expect(screen.getByText(/\(target@bsg\.test\)/)).toBeInTheDocument();
  });
});

describe("ResetPasswordPage — submit", () => {
  it("rejects mismatched confirmation client-side", async () => {
    vi.spyOn(resetsApi, "previewReset").mockResolvedValue({
      email: "target@bsg.test",
      displayName: "Target",
      expiresAt: "2026-12-31T23:59:59.000Z"
    });

    renderAt("good-token");
    await waitFor(() => {
      expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "longEnoughPw1" }
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: "differentPw99" }
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /passwords do not match/i
      );
    });
  });

  it("calls consumeReset and navigates to /companies on success", async () => {
    vi.spyOn(resetsApi, "previewReset").mockResolvedValue({
      email: "target@bsg.test",
      displayName: "Target",
      expiresAt: "2026-12-31T23:59:59.000Z"
    });
    const consumeSpy = vi.spyOn(resetsApi, "consumeReset").mockResolvedValue({
      accessToken: "fresh-token",
      user: {
        id: "u-1",
        email: "target@bsg.test",
        login: null,
        displayName: "Target",
        role: "user",
        isActive: true
      }
    });

    renderAt("good-token");
    await waitFor(() => {
      expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "longEnoughPw1" }
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: "longEnoughPw1" }
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(consumeSpy).toHaveBeenCalledWith("good-token", "longEnoughPw1");
    });
    await waitFor(() => {
      expect(screen.getByText(/companies landing/i)).toBeInTheDocument();
    });
  });

  it("surfaces 404-on-submit with the expired-link message", async () => {
    vi.spyOn(resetsApi, "previewReset").mockResolvedValue({
      email: "target@bsg.test",
      displayName: "Target",
      expiresAt: "2026-12-31T23:59:59.000Z"
    });
    vi.spyOn(resetsApi, "consumeReset").mockRejectedValue(
      new ApiError("RESOURCE_NOT_FOUND", "gone", 404)
    );

    renderAt("good-token");
    await waitFor(() => {
      expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "longEnoughPw1" }
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: "longEnoughPw1" }
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /this reset link is no longer valid/i
      );
    });
  });
});

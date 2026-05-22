/**
 * Sprint 9.O — public /reset-password page.
 *
 * URL: `${APP_PUBLIC_URL}/reset-password?token=<raw>`
 *
 * Flow:
 *   1. Read token from `?token=` query string.
 *   2. GET /auth/password-reset/:token → preview (email + displayName +
 *      expiresAt). 404 on any "not pending" state — render a friendly
 *      "This reset link is no longer valid" without leaking why.
 *   3. Render a "New password" + "Confirm new password" form. Show the
 *      account we're resetting (email + displayName) so the user has
 *      full context before committing.
 *   4. POST /auth/password-reset/:token → server updates password,
 *      revokes all sessions, and issues a fresh access+refresh token
 *      pair (refresh in cookie). FE hydrates AuthContext + redirects
 *      to /companies.
 *
 * The page is OUTSIDE PrivateRoute (no auth required to view).
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  consumeReset,
  previewReset,
  type ResetPreview
} from "../api/password-resets.js";
import { useAuth } from "../contexts/AuthContext.js";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [preview, setPreview] = useState<ResetPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 1. Preview on mount (or on token change).
  useEffect(() => {
    if (!token) {
      setPreviewError("No reset token in the URL.");
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    previewReset(token)
      .then(p => {
        if (cancelled) return;
        setPreview(p);
        setPreviewLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        // Generic message — backend deliberately doesn't tell us
        // which "not pending" state the token is in.
        setPreviewError(
          err instanceof ApiError && err.status === 404
            ? "This reset link is no longer valid. Ask the super-admin who sent it for a fresh link."
            : "Failed to load the reset link. Try refreshing the page."
        );
        setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitError(null);

    if (newPassword !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setSubmitError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await consumeReset(token, newPassword);
      // Server bulk-revoked any existing refresh tokens for this user
      // and minted a fresh pair (refresh cookie + access token below).
      // Hydrate AuthContext directly — no /auth/me round-trip needed.
      auth.hydrate({ accessToken: result.accessToken, user: result.user });
      navigate("/companies", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setSubmitError(
            "This reset link is no longer valid. Ask the super-admin for a fresh one."
          );
        } else {
          setSubmitError(err.message);
        }
      } else {
        setSubmitError("Something went wrong. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Sprint 9.O follow-up — same logged-in guard as AcceptInvitePage.
  // Consuming a reset token auto-logs the user in (the server bulk-
  // revokes their refresh tokens + issues a fresh pair), which
  // replaces whatever session was already in the browser cookie.
  // For a super_admin testing the flow in the same tab, this
  // silently swaps their identity — surface an explicit step instead.
  if (!auth.isBooting && auth.user) {
    return (
      <div className="mx-auto mt-12 max-w-md px-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">
            Reset your password
          </h1>
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            You're currently signed in as <strong>{auth.user.email}</strong>.
            Resetting this password will sign you out of your current
            session and sign you in as the reset's target account.
            Sign out first if that's not what you want.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => auth.logout()}
              className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Sign out and continue
            </button>
            <button
              type="button"
              onClick={() => navigate("/companies", { replace: true })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel — keep current session
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-12 max-w-md px-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Reset your password
        </h1>

        {previewLoading ? (
          <p className="mt-3 text-sm text-slate-500">Validating link…</p>
        ) : previewError ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {previewError}
          </p>
        ) : preview ? (
          <>
            <p className="mt-2 text-sm text-slate-600">
              Setting a new password for{" "}
              <strong>{preview.displayName}</strong>{" "}
              <span className="text-slate-500">({preview.email})</span>.
              <br />
              Link expires{" "}
              <span className="text-slate-500">
                {new Date(preview.expiresAt).toLocaleString()}
              </span>
              .
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  New password <span className="text-red-500">*</span>
                </span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoFocus
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <span className="block text-xs text-slate-500">
                  Minimum 8 characters.
                </span>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Confirm new password <span className="text-red-500">*</span>
                </span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>

              {submitError ? (
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {submitError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg border border-blue-500 bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Resetting password…" : "Reset password"}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}

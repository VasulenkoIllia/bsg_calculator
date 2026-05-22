/**
 * Sprint 9.O — public /accept-invite page.
 *
 * URL: `${APP_PUBLIC_URL}/accept-invite?token=<raw>`
 *
 * Flow:
 *   1. Read token from `?token=` query string.
 *   2. GET /auth/invite/:token → preview (role + expiresAt).
 *      404 on any "not pending" state — render a friendly
 *      "This invite is no longer valid" without leaking why.
 *   3. Render the form: email * / login (optional) / display name *
 *      / password *. Show the role we're being invited as so the
 *      user has full context before committing.
 *   4. POST /auth/invite/:token/accept → server creates user +
 *      issues access+refresh token pair (refresh in cookie). FE
 *      drops accessToken into AuthContext via the existing
 *      session-rehydration path and redirects to /companies.
 *
 * The page is OUTSIDE PrivateRoute (no auth required to view).
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import {
  acceptInvite,
  previewInvite,
  type InvitePreview
} from "../api/invites.js";
import { useAuth } from "../contexts/AuthContext.js";
import type { UserRole } from "../api/types.js";

function humanRole(role: UserRole): string {
  switch (role) {
    case "user":
      return "User — read-only access";
    case "admin":
      return "Admin — manage documents & calculators";
    case "super_admin":
      return "Super-admin — full access incl. user management";
    default: {
      const _exhaustive: never = role;
      return String(_exhaustive);
    }
  }
}

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [login, setLogin] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 1. Preview on mount (or on token change).
  useEffect(() => {
    if (!token) {
      setPreviewError("No invite token in the URL.");
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    previewInvite(token)
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
            ? "This invite link is no longer valid. Ask the super-admin who sent it for a fresh link."
            : "Failed to load the invite. Try refreshing the page."
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

    // Sprint 9.O audit fix L4 — mirror the length check from
    // ResetPasswordPage so both sibling pages enforce the same
    // client-side rule before hitting the server (the server's Zod
    // schema rejects <8 chars too — this is defence in depth for
    // tests/scripted submissions that bypass `<input minLength>`).
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await acceptInvite(token, {
        email: email.trim(),
        login: login.trim() === "" ? undefined : login.trim(),
        displayName: displayName.trim(),
        password
      });
      // Mirror AuthContext.login(): drop access token + user into the
      // shared API client + AuthProvider state so the navbar renders
      // signed-in immediately. The refresh cookie was already set by
      // the server response, so cold-boot refresh on a future page
      // load will continue working.
      auth.hydrate({ accessToken: result.accessToken, user: result.user });
      navigate("/companies", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "CONFLICT_USER_EXISTS") {
          setSubmitError(
            "A user with this email or login already exists. Sign in instead, or choose a different email."
          );
        } else if (err.code === "INVITE_ALREADY_USED") {
          setSubmitError(
            "This invite was just used by someone else. Ask the super-admin for a fresh one."
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

  // Sprint 9.O follow-up — block the accept flow if the operator
  // is ALREADY logged in. Without this guard, submitting the form
  // would silently overwrite their current session with the newly-
  // created user's tokens (the server's auto-login response sets a
  // fresh refresh cookie, which replaces the existing one). Most
  // commonly hits a super_admin who clicks an invite link in the
  // same browser tab they're using to admin the system — they
  // didn't intend to "log out + log in as new user", but that's
  // what happens. Force an explicit logout step.
  if (!auth.isBooting && auth.user) {
    return (
      <div className="mx-auto mt-12 max-w-md px-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">
            Accept invitation
          </h1>
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            You're currently signed in as <strong>{auth.user.email}</strong>.
            Accepting this invite will create a new account and replace
            your current session. Sign out first if you want to keep
            your existing one.
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
          Accept invitation
        </h1>

        {previewLoading ? (
          <p className="mt-3 text-sm text-slate-500">Validating invite…</p>
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
              You're invited as <strong>{humanRole(preview.role)}</strong>.
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
                  Email <span className="text-red-500">*</span>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Login (optional)
                </span>
                <input
                  type="text"
                  value={login}
                  onChange={e => setLogin(e.target.value)}
                  placeholder="short.handle"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Display name <span className="text-red-500">*</span>
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={120}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Password <span className="text-red-500">*</span>
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <span className="block text-xs text-slate-500">
                  Minimum 8 characters.
                </span>
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
                {submitting ? "Creating account…" : "Accept invitation"}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}

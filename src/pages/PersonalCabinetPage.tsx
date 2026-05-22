/**
 * Sprint 9.T — Personal cabinet (`/me`).
 *
 * Phase 8 Stage 2 partial — 2FA explicitly DEFERRED. Today's surface:
 *   - Profile section: email + displayName + role badge (all read-only).
 *   - Change password: currentPassword + newPassword + confirm. On
 *     success the server bulk-revokes every refresh token; we then
 *     flush AuthContext + redirect to /login.
 *   - Sign out everywhere: same flush + redirect, but the
 *     `currentPassword` step is skipped (it's the access token that
 *     authorises the action — convenient on a phone where the user
 *     can't remember their password). The trade-off is that an XSS
 *     could trigger an unwanted "log me out everywhere" — annoying
 *     but not exploitable for impersonation.
 *   - 2FA section: placeholder "Coming soon" so the operator brief
 *     ("/me має бути сторінка для 2FA") has the right slot waiting.
 *
 * Auth gating: lives behind PrivateRoute, so `useAuth().user` is
 * always non-null here. The cold-boot guard is handled at the
 * router layer.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, setAccessToken } from "../api/client.js";
import * as authApi from "../api/auth.js";
import { useAuth } from "../contexts/AuthContext.js";

export function PersonalCabinetPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    // PrivateRoute should make this branch unreachable; defensive.
    return null;
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">My account</h1>
        <p className="text-sm text-slate-500">
          Manage your personal profile and security settings.
        </p>
      </header>

      <ProfileSection
        email={user.email}
        login={user.login}
        displayName={user.displayName}
        role={user.role}
      />

      <ChangePasswordSection />

      <SignOutEverywhereSection onDone={() => void handlePostSecurityAction({ logout, navigate })} />

      <TwoFactorPlaceholderSection />
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────
// Profile (read-only)
// ────────────────────────────────────────────────────────────────────

function ProfileSection({
  email,
  login,
  displayName,
  role
}: {
  email: string;
  login: string | null;
  displayName: string;
  role: "user" | "admin" | "super_admin";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Profile</h2>
      <p className="mt-1 text-xs text-slate-500">
        Profile fields are managed by a super-admin. Ask one if any of these
        need to change.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <ProfileRow label="Email" value={email} />
        <ProfileRow label="Login" value={login ?? "—"} />
        <ProfileRow label="Display name" value={displayName} />
        <ProfileRow label="Role" value={role} />
      </dl>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value}</dd>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Change password
// ────────────────────────────────────────────────────────────────────

function ChangePasswordSection() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await authApi.changeOwnPassword({ currentPassword, newPassword });
      // Server bulk-revoked every refresh token (incl. this session's).
      // Flush AuthContext + send to /login so the operator notices.
      await handlePostSecurityAction({ logout, navigate });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.code === "AUTH_INVALID_CREDENTIALS"
            ? "Current password is incorrect."
            : err.message
        );
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Change password</h2>
      <p className="mt-1 text-xs text-slate-500">
        Enter your current password to confirm it's really you, then set a new
        one. All your other sessions will be signed out for safety.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <Field label="Current password" required>
          <input
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </Field>
        <Field label="New password" required>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <span className="block text-xs text-slate-500">
            Minimum 8 characters.
          </span>
        </Field>
        <Field label="Confirm new password" required>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </Field>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Changing…" : "Change password"}
        </button>
      </form>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sign out everywhere
// ────────────────────────────────────────────────────────────────────

function SignOutEverywhereSection({ onDone }: { onDone: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    // Operator-confirm step: the action is destructive (kicks every
    // device including this one) so a one-click slip would be
    // annoying. window.confirm is sufficient — no need for a full
    // modal.
    if (!window.confirm("Sign out of ALL your sessions on every device?")) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await authApi.signOutEverywhere();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">
        Sign out everywhere
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Revokes every active session on every device. Useful if you suspect
        someone has access to your account, or after losing a device.
      </p>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="mt-3 rounded-lg border border-red-500 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Signing out…" : "Sign out everywhere"}
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// 2FA — placeholder
// ────────────────────────────────────────────────────────────────────

function TwoFactorPlaceholderSection() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
      <h2 className="text-base font-semibold text-slate-900">
        Two-factor authentication{" "}
        <span className="ml-2 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
          Coming soon
        </span>
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        TOTP-based 2FA (Google Authenticator, 1Password, Authy) is planned for
        the next security pass. When enabled, you'll be prompted for a 6-digit
        code on every login from an untrusted browser.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function Field({
  label,
  required = false,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}

/**
 * After a destructive auth-side action (password change or
 * sign-out-everywhere), the local session is dead on the server but
 * the FE still holds an in-memory access token. Flush both, then
 * navigate to /login so the operator notices.
 *
 * The `auth.logout()` call also tries to revoke server-side, but
 * the cookie was already cleared by the server's clearCookie in the
 * response — that's fine, the call is best-effort and idempotent.
 */
async function handlePostSecurityAction({
  logout,
  navigate
}: {
  logout: () => Promise<void>;
  navigate: ReturnType<typeof useNavigate>;
}): Promise<void> {
  setAccessToken(null);
  try {
    await logout();
  } catch {
    // Ignore — the cookie is already gone.
  }
  navigate("/login", { replace: true });
}

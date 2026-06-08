/**
 * Sprint 9.T / Phase 8 Stage 2 — Personal cabinet (`/me`).
 *
 * Surface:
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
 *   - Two-factor authentication (TOTP) — shipped 2026-06-08: status
 *     badge; Enable (QR + manual key → confirm code → one-time backup
 *     codes); Disable + Regenerate backup codes (password + code
 *     re-auth). Compatible with Google Authenticator / 1Password / Authy.
 *
 * Auth gating: lives behind PrivateRoute, so `useAuth().user` is
 * always non-null here. The cold-boot guard is handled at the
 * router layer.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, setAccessToken } from "../api/client.js";
import * as authApi from "../api/auth.js";
import { useAuth } from "../contexts/AuthContext.js";
import type { TwoFactorStatusResponse } from "../api/types.js";

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

      <TwoFactorSection />
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
// 2FA — Phase 8 Stage 2
// ────────────────────────────────────────────────────────────────────

function errMsg(err: unknown, wrongCode: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Current password is incorrect.";
    if (err.status === 400) return wrongCode;
    if (err.status === 429) return "Too many attempts. Wait a minute.";
    return err.message;
  }
  return "Something went wrong. Try again.";
}

function BackupCodesPanel({
  codes,
  onDone
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-xs font-semibold text-amber-800">
        Save these backup codes somewhere safe. Each works ONCE if you lose your
        authenticator. They will NOT be shown again.
      </p>
      <ul className="grid grid-cols-2 gap-1 font-mono text-sm text-slate-800">
        {codes.map(c => (
          <li key={c} className="rounded bg-white px-2 py-1 text-center">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(codes.join("\n"));
            setCopied(true);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {copied ? "Copied!" : "Copy codes"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          I've saved them — done
        </button>
      </div>
    </div>
  );
}

function TwoFactorSection() {
  const [status, setStatus] = useState<TwoFactorStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Enrolment: the QR + manual key while the user scans + confirms.
  const [enroll, setEnroll] = useState<{ qrCode: string; manualKey: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  // Backup codes shown after enable / regenerate (one-time reveal).
  const [shownCodes, setShownCodes] = useState<string[] | null>(null);
  // Re-auth form for disable / regenerate.
  const [reauthMode, setReauthMode] = useState<null | "disable" | "regenerate">(null);
  const [password, setPassword] = useState("");
  const [reauthCode, setReauthCode] = useState("");

  async function reload(): Promise<void> {
    try {
      setStatus(await authApi.get2faStatus());
    } catch {
      setError("Could not load 2FA status.");
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  function resetForms(): void {
    setEnroll(null);
    setConfirmCode("");
    setShownCodes(null);
    setReauthMode(null);
    setPassword("");
    setReauthCode("");
    setError(null);
  }

  async function startEnroll(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      setEnroll(await authApi.setup2fa());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start setup.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { backupCodes } = await authApi.confirm2fa(confirmCode.trim());
      setEnroll(null);
      setConfirmCode("");
      setShownCodes(backupCodes);
      await reload();
    } catch (err) {
      setError(errMsg(err, "Invalid 6-digit code. Check your authenticator app."));
    } finally {
      setBusy(false);
    }
  }

  async function submitReauth(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (reauthMode === "disable") {
        await authApi.disable2fa({ password, code: reauthCode.trim() });
        resetForms();
        await reload();
      } else {
        const { backupCodes } = await authApi.regenerateBackupCodes({
          password,
          code: reauthCode.trim()
        });
        setReauthMode(null);
        setPassword("");
        setReauthCode("");
        setShownCodes(backupCodes);
        await reload();
      }
    } catch (err) {
      setError(errMsg(err, "Invalid code."));
      // 409 = 2FA was already disabled elsewhere (another tab / admin
      // force-disable). Re-sync the badge + buttons to the true state.
      if (err instanceof ApiError && err.status === 409) {
        await reload();
      }
    } finally {
      setBusy(false);
    }
  }

  const enabled = status?.enabled ?? false;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        Two-factor authentication
        {status ? (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
              enabled
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-200 text-slate-600"
            }`}
          >
            {enabled ? "Enabled" : "Disabled"}
          </span>
        ) : null}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Use an authenticator app (Google Authenticator, 1Password, Authy). When
        enabled, you'll enter a 6-digit code on every login from an untrusted
        browser.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      {/* One-time backup-codes reveal (after enable or regenerate). */}
      {shownCodes ? (
        <BackupCodesPanel codes={shownCodes} onDone={resetForms} />
      ) : enroll ? (
        /* Enrolment: scan QR + confirm a code. */
        <form onSubmit={confirmEnroll} className="mt-4 space-y-3">
          <p className="text-sm text-slate-700">
            Scan this QR code with your authenticator app, then enter the 6-digit
            code it shows.
          </p>
          <img
            src={enroll.qrCode}
            alt="2FA QR code"
            className="h-44 w-44 rounded-lg border border-slate-200"
          />
          <p className="text-xs text-slate-500">
            Can't scan? Enter this key manually:{" "}
            <code className="rounded bg-slate-100 px-1 font-mono">
              {enroll.manualKey}
            </code>
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={confirmCode}
            onChange={e => setConfirmCode(e.target.value)}
            className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy || confirmCode.trim().length === 0}
              className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Confirm & enable"}
            </button>
            <button
              type="button"
              onClick={resetForms}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : reauthMode ? (
        /* Re-auth form for disable / regenerate. */
        <form onSubmit={submitReauth} className="mt-4 space-y-3">
          <p className="text-sm text-slate-700">
            {reauthMode === "disable"
              ? "Confirm your password and a current code to disable 2FA."
              : "Confirm your password and a current code to generate new backup codes."}
          </p>
          <Field label="Password" required>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </Field>
          <Field label="Authenticator or backup code" required>
            <input
              type="text"
              value={reauthCode}
              onChange={e => setReauthCode(e.target.value)}
              autoComplete="one-time-code"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </Field>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy || password.length === 0 || reauthCode.trim().length === 0}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                reauthMode === "disable"
                  ? "border-red-600 bg-red-600 hover:bg-red-700"
                  : "border-blue-500 bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {busy
                ? "Working…"
                : reauthMode === "disable"
                  ? "Disable 2FA"
                  : "Regenerate codes"}
            </button>
            <button
              type="button"
              onClick={resetForms}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        /* Idle: enable, or (when enabled) manage. */
        <div className="mt-4 space-y-3">
          {enabled ? (
            <>
              <p className="text-xs text-slate-500">
                {status?.backupCodesRemaining ?? 0} backup code
                {(status?.backupCodesRemaining ?? 0) === 1 ? "" : "s"} remaining.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReauthMode("regenerate")}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Regenerate backup codes
                </button>
                <button
                  type="button"
                  onClick={() => setReauthMode("disable")}
                  className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  Disable 2FA
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void startEnroll()}
              disabled={busy || !status}
              className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Starting…" : "Enable 2FA"}
            </button>
          )}
        </div>
      )}
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

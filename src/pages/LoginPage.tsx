/**
 * Login form page.
 *
 * Form behaviour:
 *   - react-hook-form + zod for validation (one schema, one source
 *     of truth) — matches the backend's `loginRequestSchema` so a
 *     valid submit can never produce a 400 from validation alone.
 *   - On submit failure, surface the backend's `code` so the
 *     message stays user-friendly across i18n / wording changes.
 *   - Authed users hitting /login are bounced to / so deep-linking
 *     /login from a logged-in session doesn't look like a bug.
 *   - After success, redirect to `state.from` if PrivateRoute
 *     captured an attempted URL, else default to /companies.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { ApiError } from "../api/client.js";
import { useAuth } from "../contexts/AuthContext.js";

// Mirror server/modules/auth/auth.schemas.ts:loginRequestSchema.
// Keep these constraints aligned so a frontend-valid form is a
// backend-valid form.
const loginFormSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your login or email."),
  password: z.string().min(1, "Enter your password.")
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

/**
 * Read `state.from` set by PrivateRoute and return a safe path-relative
 * URL, or fall back to /companies.
 *
 * Defends against three classes of redirect abuse, even though
 * PrivateRoute is the only writer today:
 *   - non-string types → ignored
 *   - empty string → falls through to default (would no-op navigate)
 *   - protocol-relative URLs like `//evil.com` → rejected (could be
 *     interpreted as cross-origin in some browser quirks)
 *   - paths not starting with `/` → rejected (`navigate("javascript:…")`
 *     does NOT execute in BrowserRouter because react-router uses
 *     history.pushState, not location.href= — but defending explicitly
 *     guards against any future imperative redirect that bypasses
 *     the BrowserRouter sanitisation)
 */
function resolveSafeFromPath(state: unknown): string {
  if (state === null || typeof state !== "object") return "/companies";
  const raw = (state as { from?: unknown }).from;
  if (typeof raw !== "string") return "/companies";
  if (raw.length === 0) return "/companies";
  if (!raw.startsWith("/")) return "/companies";
  if (raw.startsWith("//")) return "/companies";
  return raw;
}

export function LoginPage() {
  const { user, isBooting, login, pendingTwoFactor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = resolveSafeFromPath(location.state);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { identifier: "", password: "" }
  });

  // Bounce logged-in users away from /login. useEffect (not a
  // render-time Navigate) avoids re-render thrash while the cold-
  // boot refresh resolves.
  useEffect(() => {
    if (!isBooting && user) {
      navigate(fromPath, { replace: true });
    }
  }, [isBooting, user, fromPath, navigate]);

  const onSubmit = async (values: LoginFormValues): Promise<void> => {
    try {
      const result = await login(values.identifier, values.password);
      // Phase 8 Stage 2 — if 2FA is required, DON'T navigate; the form
      // re-renders into the second-factor step (pendingTwoFactor). On a
      // full session we navigate (the AuthProvider effect also would).
      if (!result.twoFactorRequired) {
        navigate(fromPath, { replace: true });
      }
    } catch (err) {
      // ApiError surfaces the backend's `code`. Map the known auth
      // failure shapes to human messages; anything unexpected falls
      // back to the backend's `message` (which is also human-ish).
      const isApiError = err instanceof ApiError;
      const code = isApiError ? err.code : "";
      let message = "Something went wrong. Try again.";
      if (code === "AUTH_INVALID_CREDENTIALS") {
        message = "Invalid login or password.";
      } else if (code === "FORBIDDEN") {
        message = "Your account is disabled. Contact an administrator.";
      } else if (code === "RATE_LIMITED") {
        message = "Too many login attempts. Please wait a minute.";
      } else if (code === "NETWORK_ERROR") {
        message = "Cannot reach the server. Check your connection.";
      } else if (isApiError) {
        message = err.message;
      }
      form.setError("root", { type: "server", message });
    }
  };

  const isSubmitting = form.formState.isSubmitting;
  const rootError = form.formState.errors.root?.message;

  // Suppress the form during the cold-boot window. Without this guard,
  // a user with a valid refresh cookie who deep-links to /login sees
  // the login form for one frame before the AuthProvider's effect
  // redirects them — flicker that the previous test suite did not
  // catch because it only asserted post-redirect state.
  if (isBooting) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading session…
      </div>
    );
  }

  // Phase 8 Stage 2 — password OK but the account has 2FA: show the
  // second-factor step instead of the password form. A successful verify
  // sets `user`, and the useEffect above redirects.
  if (pendingTwoFactor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <TwoFactorStep />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        noValidate
      >
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
          <p className="text-sm text-slate-500">BSG Calculator workspace</p>
        </header>

        <div className="space-y-1">
          <label htmlFor="identifier" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Login or email
          </label>
          <input
            id="identifier"
            type="text"
            autoComplete="username"
            autoFocus
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            {...form.register("identifier")}
          />
          {form.formState.errors.identifier?.message ? (
            <p className="text-xs text-red-600">{form.formState.errors.identifier.message}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            {...form.register("password")}
          />
          {form.formState.errors.password?.message ? (
            <p className="text-xs text-red-600">{form.formState.errors.password.message}</p>
          ) : null}
        </div>

        {rootError ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {rootError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

/**
 * Phase 8 Stage 2 — the login second step. Shown after a correct password
 * when the account has 2FA enabled. Accepts a 6-digit authenticator code
 * OR a backup code; optionally registers the browser as trusted.
 */
function TwoFactorStep() {
  const { verifyTwoFactor, cancelTwoFactor } = useAuth();
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Success sets `user`; the LoginPage effect handles the redirect.
      await verifyTwoFactor(code.trim(), { trustDevice });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 401) {
        // The temp token expired — bounce back to the password form.
        setError("Your sign-in attempt expired. Please enter your password again.");
        setSubmitting(false);
        setTimeout(cancelTwoFactor, 1500);
      } else if (status === 400) {
        setError(
          useBackupCode
            ? "Invalid or already-used backup code."
            : "Invalid 6-digit code. Check your authenticator app."
        );
        setSubmitting(false);
      } else if (status === 429) {
        setError("Too many attempts. Please wait a minute and try again.");
        setSubmitting(false);
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong.");
        setSubmitting(false);
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      noValidate
    >
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Two-step verification</h1>
        <p className="text-sm text-slate-500">
          {useBackupCode
            ? "Enter one of your saved backup codes."
            : "Enter the 6-digit code from your authenticator app."}
        </p>
      </header>

      <div className="space-y-1">
        <label
          htmlFor="totp-code"
          className="text-xs font-semibold uppercase tracking-wide text-slate-600"
        >
          {useBackupCode ? "Backup code" : "Authentication code"}
        </label>
        <input
          id="totp-code"
          type="text"
          inputMode={useBackupCode ? "text" : "numeric"}
          autoComplete="one-time-code"
          autoFocus
          placeholder={useBackupCode ? "xxxxx-xxxxx" : "123456"}
          value={code}
          onChange={e => setCode(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={trustDevice}
          onChange={e => setTrustDevice(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Trust this browser for 30 days
      </label>

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
        disabled={submitting || code.trim().length === 0}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Verifying…" : "Verify"}
      </button>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => {
            setUseBackupCode(v => !v);
            setCode("");
            setError(null);
          }}
          className="font-semibold text-blue-700 hover:text-blue-900 hover:underline"
        >
          {useBackupCode ? "Use authenticator app" : "Use a backup code"}
        </button>
        <button
          type="button"
          onClick={cancelTwoFactor}
          className="font-semibold text-slate-500 hover:text-slate-700 hover:underline"
        >
          ← Back
        </button>
      </div>
    </form>
  );
}

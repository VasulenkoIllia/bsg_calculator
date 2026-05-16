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
import { useEffect } from "react";
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

export function LoginPage() {
  const { user, isBooting, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath =
    (location.state as { from?: string } | null)?.from && typeof (location.state as { from?: string }).from === "string"
      ? (location.state as { from?: string }).from!
      : "/companies";

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
      await login(values.identifier, values.password);
      navigate(fromPath, { replace: true });
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

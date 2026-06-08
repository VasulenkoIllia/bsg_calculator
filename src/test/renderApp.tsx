import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { vi } from "vitest";
import App from "../App.js";
import * as authApi from "../api/auth.js";
import { setAccessToken, setSessionLostHandler } from "../api/client.js";
import { AuthProvider } from "../contexts/AuthContext.js";
import { ToastProvider } from "../contexts/ToastContext.js";

/**
 * Test renderer for the full <App />.
 *
 * Sprint 2.8.C wrapped all the calculator / wizard routes behind a
 * <PrivateRoute /> gate. To keep the pre-auth tests (calculator UI,
 * wizard URL params, etc.) working unchanged, this helper:
 *
 *   1. Wraps the app in the same QueryClient + AuthProvider stack
 *      main.tsx uses in production.
 *   2. Mocks `authApi.refresh` + `authApi.me` so the cold-boot
 *      refresh inside AuthProvider succeeds — the gate lets through
 *      and tests render the actual destination route immediately.
 *
 * Auth-specific tests can still override these mocks per-suite via
 * `vi.spyOn(authApi, "refresh")` because vitest's spy reassignment
 * wins over the default mock here.
 */
/**
 * Render the app at a specific URL path.
 *
 * Defaults to `/calculator` so the pre-2.8 tests (calculator UI,
 * wizard URL params, …) keep working unchanged. After 2.8.C the
 * `/` route redirects to `/companies` — calculator-focused tests
 * either accept the redirect (and navigate to /calculator after)
 * or pass the path explicitly here.
 */
export async function renderApp(initialPath: string = "/calculator") {
  // Default authenticated cold-boot. Individual tests that want to
  // exercise the logged-out path can override these spies.
  vi.spyOn(authApi, "refresh").mockResolvedValue({ accessToken: "test-token" });
  vi.spyOn(authApi, "me").mockResolvedValue({
    id: "test-user",
    email: "tester@bsg.test",
    login: "tester",
    displayName: "Tester",
    role: "user" as const,
    isActive: true, twoFactorEnabled: false
  });
  setAccessToken("test-token");
  // Drop any session-lost handler left over from a previous test's
  // AuthProvider mount. Without this reset, a stale handler closing
  // over an unmounted provider could fire on the next render and
  // corrupt the new provider's state — or, more commonly, silently
  // overwrite a fresh handler's clear-effect.
  setSessionLostHandler(null);

  // App.tsx uses BrowserRouter (no `basename`), so seeding the URL
  // via the real History API is the lightweight way to choose where
  // the test renders without re-wiring routing for the test env.
  window.history.pushState({}, "", initialPath);

  // A fresh QueryClient per render avoids cross-test cache pollution
  // (one test's stale data leaking into the next).
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 }
    }
  });

  const user = userEvent.setup();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      {/* Sprint 6.3: ToastProvider must wrap any tree that may call
          useToast() — CalculatorPage, WizardPage and DocumentViewPage
          all do via the global notify path. Mirrors main.tsx's
          provider order. */}
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );

  // Block until cold-boot completes — otherwise the very first
  // synchronous assertions in tests would race the "Loading session…"
  // placeholder rendered by PrivateRoute.
  await waitFor(() => {
    const stillBooting = utils.container.textContent?.includes("Loading session…");
    if (stillBooting) {
      throw new Error("auth boot pending");
    }
  });

  return { user, ...utils };
}

/**
 * Auth provider — single source of truth for "am I logged in".
 *
 * Lifecycle:
 *   1. Mount: try a cold-boot refresh via the httpOnly cookie. If it
 *      succeeds, hydrate the user via /auth/me. If it fails, the user
 *      sees the login page.
 *   2. login() / logout() flip the state explicitly + push the
 *      access token into the api/client module-level store so the
 *      request interceptor can attach it as a Bearer.
 *   3. setSessionLostHandler is wired so the api client's
 *      refresh-on-401 path can notify us when a refresh dies (e.g.
 *      revoked session). We then drop state + the router redirects.
 *
 * Tokens live ONLY in memory + the httpOnly refresh cookie. There's
 * no localStorage / sessionStorage anywhere — XSS that can run JS
 * on our origin can't steal a long-lived auth credential.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode
} from "react";
import { ApiError, setAccessToken, setSessionLostHandler } from "../api/client.js";
import * as authApi from "../api/auth.js";
import type { PublicUser } from "../api/types.js";

interface AuthState {
  /** Public user object, or null when logged out. */
  user: PublicUser | null;
  /**
   * True while the cold-boot refresh is in flight. UI should render
   * a splash / loader instead of either the app shell or the login
   * page during this window so we don't flash unauthenticated UI
   * for users who actually have a valid cookie.
   */
  isBooting: boolean;
}

interface AuthContextValue extends AuthState {
  /** Submit credentials. Throws an `ApiError` on failure. */
  login: (identifier: string, password: string) => Promise<void>;
  /** Server-side revoke + client-side state clear. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState<AuthState>({ user: null, isBooting: true });

  // ─── Cold-boot refresh ──────────────────────────────────────────
  // Runs ONCE on mount. If the user has a valid refresh cookie we
  // upgrade it into an access token + load their profile. If not
  // (no cookie / expired / revoked), we silently land on logged-out
  // state — the router will show /login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { accessToken } = await authApi.refresh();
        if (cancelled) return;
        setAccessToken(accessToken);
        const user = await authApi.me();
        if (cancelled) return;
        setState({ user, isBooting: false });
      } catch (err) {
        // 401 from refresh is the normal "not logged in" path —
        // don't log it as an error. Anything else is unexpected
        // and worth surfacing in dev.
        if (!(err instanceof ApiError && err.isUnauthenticated)) {
          // eslint-disable-next-line no-console
          console.warn("[auth] cold-boot refresh failed unexpectedly", err);
        }
        if (!cancelled) setState({ user: null, isBooting: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Wire session-lost notification from the api client ─────────
  // When refresh-on-401 inside the api client fails, it calls this
  // handler so we can clear UI state. We re-register every mount;
  // setSessionLostHandler(null) on unmount avoids dangling refs in
  // hot-module-reload scenarios.
  useEffect(() => {
    setSessionLostHandler(() => {
      setAccessToken(null);
      setState(prev => ({ ...prev, user: null }));
    });
    return () => {
      setSessionLostHandler(null);
    };
  }, []);

  const login = useCallback(async (identifier: string, password: string): Promise<void> => {
    const { accessToken, user } = await authApi.login({ identifier, password });
    setAccessToken(accessToken);
    setState({ user, isBooting: false });
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch (err) {
      // Best-effort: even if the server call fails (network down,
      // already-revoked, …) we still want to clear local state so
      // the user can't accidentally keep using the UI as if logged
      // in. The next request would 401 anyway.
      // eslint-disable-next-line no-console
      console.warn("[auth] logout server call failed; clearing local state", err);
    } finally {
      setAccessToken(null);
      setState({ user: null, isBooting: false });
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user: state.user, isBooting: state.isBooting, login, logout }),
    [state.user, state.isBooting, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook for consuming the auth state. Throws if used outside of
 * `<AuthProvider>` so a missing provider fails loudly at the call
 * site rather than silently returning null.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}

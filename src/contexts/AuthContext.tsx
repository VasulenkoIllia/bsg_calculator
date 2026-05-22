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
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from "react";
import { ApiError, setAccessToken, setSessionLostHandler } from "../api/client.js";
import * as authApi from "../api/auth.js";
import type { PublicUser, UserRole } from "../api/types.js";
// Sprint 9.L D6 — hierarchical tier table extracted to src/shared/roles.ts
// so the frontend and backend stop independently maintaining the same
// `{ user: 0, admin: 1, super_admin: 2 }` literal. The helper guarantees
// `hasRole('admin')` returns true for both admins AND super_admins.
import { hasRoleAtLeast } from "../shared/roles.js";

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
  /**
   * Sprint 9.O — hydrate state from an already-issued token pair.
   * Used by flows that authenticate the user via a side channel (the
   * accept-invite + consume-reset endpoints) and end up holding the
   * same `{ accessToken, user }` shape the login endpoint returns.
   * The refresh cookie is set by the server in the same response.
   */
  hydrate: (params: { accessToken: string; user: PublicUser }) => void;
  /** Server-side revoke + client-side state clear. */
  logout: () => Promise<void>;
  /**
   * Phase 8 Stage 1: hierarchical role check. `hasRole('admin')`
   * returns true for both admins AND super-admins (admins are a
   * subset of super-admins' capabilities, not a sibling). Returns
   * false when logged out.
   *
   * Components that previously did `user?.isAdmin` should now use
   * `hasRole('admin')` — both correctness (catches super_admin too)
   * and forward-compat for any future Stage-3 super_admin gates.
   */
  hasRole: (min: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState<AuthState>({ user: null, isBooting: true });

  // ─── Cold-boot refresh ──────────────────────────────────────────
  // Runs ONCE per "fresh" page load. If the user has a valid refresh
  // cookie we upgrade it into an access token + load their profile.
  // If not (no cookie / expired / revoked), we silently land on
  // logged-out state — the router will show /login.
  //
  // The `bootedRef` latch survives React 19 StrictMode's
  // mount→cleanup→remount cycle so dev doesn't fire two parallel
  // /auth/refresh calls on every page load.
  //
  // CRITICAL: we do NOT use a `cancelled` flag inside the IIFE.
  // StrictMode's cleanup runs SYNCHRONOUSLY between mount and remount,
  // but the latch blocks the remount from re-entering the effect.
  // Adding a `cancelled` flag here would mean the only invocation
  // ever made (the first mount's IIFE) sees `cancelled = true` from
  // the StrictMode cleanup and skips its setState — leaving the UI
  // stuck on "Loading session…" forever. (Regression from F.2; the
  // fix is to trust that setState on an unmounted component is a
  // no-op + non-fatal in React 19.)
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    (async () => {
      try {
        const { accessToken } = await authApi.refresh();
        setAccessToken(accessToken);
        const user = await authApi.me();
        setState({ user, isBooting: false });
      } catch (err) {
        // 401 from refresh is the normal "not logged in" path —
        // don't log it as an error. Anything else is unexpected
        // and worth surfacing in dev (logged with code+status only,
        // not the full error object, to avoid potential field leakage).
        if (!(err instanceof ApiError && err.isUnauthenticated)) {
          // eslint-disable-next-line no-console
          console.warn("[auth] cold-boot refresh failed unexpectedly", {
            code: err instanceof ApiError ? err.code : "UNKNOWN",
            status: err instanceof ApiError ? err.status : 0
          });
        }
        setState({ user: null, isBooting: false });
      }
    })();
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

  const hydrate = useCallback(
    ({ accessToken, user }: { accessToken: string; user: PublicUser }): void => {
      setAccessToken(accessToken);
      setState({ user, isBooting: false });
    },
    []
  );

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

  const hasRole = useCallback(
    (min: UserRole): boolean => {
      if (!state.user) return false;
      return hasRoleAtLeast(state.user.role, min);
    },
    [state.user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      isBooting: state.isBooting,
      login,
      hydrate,
      logout,
      hasRole
    }),
    [state.user, state.isBooting, login, hydrate, logout, hasRole]
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

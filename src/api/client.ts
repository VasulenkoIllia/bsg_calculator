/**
 * Single axios instance + cross-cutting concerns.
 *
 * Responsibilities:
 *   1. baseURL — dev hits Vite's proxy at `/api`, prod hits same origin.
 *   2. Bearer-token injection from the in-memory access-token store.
 *   3. Cookie-based refresh on 401, with single-flight de-duplication
 *      so a burst of parallel requests only fires ONE /auth/refresh.
 *   4. Mapping the backend error envelope into a typed `ApiError` so
 *      UI code can branch on `error.code` without unwrapping axios.
 *
 * Access token storage is in-memory only (NOT localStorage) to keep
 * an XSS payload from exfiltrating it. The refresh cookie is httpOnly
 * + SameSite=Strict so the page can't read it either — only the
 * server can pair it with a refresh-token row.
 */

import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig
} from "axios";
import type { ApiErrorEnvelope, RefreshResponse } from "./types.js";

// ─── Access-token store (module-level, in-memory) ─────────────────
// AuthContext is the source of truth for "am I logged in"; it
// publishes the token here so the request interceptor can pick it up
// without re-rendering on every request.
//
// Reading and writing are intentionally functions (not a mutable
// export) so we don't accidentally end up with stale captured values
// in closures during HMR / re-mount.
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// ─── Typed API error ──────────────────────────────────────────────
/**
 * Thrown from any api/*.ts call when the backend returns 4xx/5xx.
 * Keeps the structured envelope (`code`, `message`, `details`) +
 * the HTTP `status` so UI code can branch on either.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** True when re-authentication is required (token expired / revoked / missing). */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

// ─── Refresh hook (set by AuthContext) ────────────────────────────
/**
 * AuthContext registers a callback here so the request interceptor
 * can notify it after a failed refresh (e.g. revoked session) — then
 * the context can drop client-side state + redirect to /login.
 *
 * Passing the callback through a setter avoids a circular dependency
 * between this file and `contexts/AuthContext.tsx`.
 */
type LogoutCallback = () => void;
let onSessionLost: LogoutCallback | null = null;
export function setSessionLostHandler(cb: LogoutCallback | null): void {
  onSessionLost = cb;
}

// ─── Single-flight refresh ────────────────────────────────────────
/**
 * If a burst of N requests get 401 simultaneously, we want exactly
 * ONE /auth/refresh call and N retries off the same new token —
 * not N parallel refresh calls (which would race each other through
 * the rotation grace window on the server).
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshOnce(client: AxiosInstance): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      // No Authorization header on refresh — the cookie is the credential.
      const { data } = await client.post<RefreshResponse>(
        "/auth/refresh",
        null,
        {
          // Tag the request so the response interceptor doesn't try
          // to refresh-on-401 the refresh call itself (infinite loop).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          _isRefresh: true
        } as unknown as InternalAxiosRequestConfig
      );
      setAccessToken(data.accessToken);
      return data.accessToken;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

// ─── Build the singleton client ───────────────────────────────────
/**
 * baseURL = `/api/v1` so dev (Vite proxy) and prod (same-origin SPA
 * + Express) both work without conditionals. The Vite proxy is
 * configured in `vite.config.ts` to forward `/api` → backend:8080.
 *
 * `withCredentials: true` lets the browser send the refresh cookie
 * (httpOnly, SameSite=Strict, path=/api/v1/auth). Required for the
 * refresh and logout flows to work.
 */
export function createApiClient(): AxiosInstance {
  const baseURL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

  const instance = axios.create({
    baseURL,
    withCredentials: true,
    headers: {
      "Content-Type": "application/json"
    }
  });

  // Request interceptor — attach Bearer token from the in-memory store.
  instance.interceptors.request.use(config => {
    const token = getAccessToken();
    if (token) {
      // AxiosHeaders ensures we don't accidentally clobber any
      // per-request headers the caller set.
      const headers =
        config.headers instanceof AxiosHeaders
          ? config.headers
          : new AxiosHeaders(config.headers ?? {});
      headers.set("Authorization", `Bearer ${token}`);
      config.headers = headers;
    }
    return config;
  });

  // Response interceptor — translate envelope + refresh-on-401.
  instance.interceptors.response.use(
    response => response,
    async (err: AxiosError<ApiErrorEnvelope>) => {
      const originalConfig = err.config as
        | (InternalAxiosRequestConfig & { _retry?: boolean; _isRefresh?: boolean })
        | undefined;
      const status = err.response?.status ?? 0;
      const envelope = err.response?.data?.error;

      // 401 → try refresh exactly once, then replay original request.
      // Guards (all must hold to attempt refresh):
      //   - originalConfig must exist (network error has no config)
      //   - not the refresh call itself, by marker OR by URL —
      //     marker catches the internal refreshOnce call, URL catches
      //     any external caller (e.g. AuthContext boot) that also
      //     hits /auth/refresh directly
      //   - haven't already retried this request
      const isRefreshUrl =
        originalConfig?.url === "/auth/refresh" ||
        originalConfig?.url?.endsWith("/auth/refresh") === true;
      if (
        status === 401 &&
        originalConfig &&
        !originalConfig._isRefresh &&
        !isRefreshUrl &&
        !originalConfig._retry
      ) {
        originalConfig._retry = true;
        try {
          const newToken = await refreshOnce(instance);
          // Replay original with the fresh token.
          const headers =
            originalConfig.headers instanceof AxiosHeaders
              ? originalConfig.headers
              : new AxiosHeaders(originalConfig.headers ?? {});
          headers.set("Authorization", `Bearer ${newToken}`);
          originalConfig.headers = headers;
          return instance.request(originalConfig);
        } catch (refreshErr) {
          // Refresh itself failed — session is gone. Notify the
          // AuthContext so it can clear UI state + send the user
          // to /login.
          setAccessToken(null);
          onSessionLost?.();
          // Fall through to the typed-error rethrow below using the
          // ORIGINAL 401 (not the refresh error) — UI shouldn't see
          // a misleading "refresh failed" when the real story is
          // "your session expired".
          // eslint-disable-next-line no-console
          console.warn("[api/client] refresh-on-401 failed", refreshErr);
        }
      }

      // Re-throw as a typed ApiError so callers can `if (e instanceof
      // ApiError)` without parsing axios shape.
      if (envelope) {
        throw new ApiError(envelope.code, envelope.message, status, envelope.details);
      }
      // No envelope (network failure, 502 from Traefik, ...) — surface
      // a generic code so the UI can render a "service unavailable"
      // state without crashing on undefined fields.
      throw new ApiError(
        "NETWORK_ERROR",
        err.message || "Unable to reach the server.",
        status,
        undefined
      );
    }
  );

  return instance;
}

/**
 * The shared client. Import this from `api/*.ts` endpoint modules.
 * Exporting it as a singleton (vs a hook-built per-render instance)
 * means interceptors register exactly once and the refresh
 * single-flight state survives across mounts/HMR.
 */
export const apiClient = createApiClient();

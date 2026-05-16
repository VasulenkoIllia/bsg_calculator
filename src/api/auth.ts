/**
 * Auth endpoint wrappers.
 *
 * Thin, typed functions over `apiClient`. AuthContext is the only
 * place that should call these directly — UI components consume the
 * context, not these helpers.
 */

import { apiClient } from "./client.js";
import type {
  LoginRequest,
  LoginResponse,
  PublicUser,
  RefreshResponse
} from "./types.js";

/**
 * POST /auth/login — bcrypt verify + issue tokens.
 *
 * Side-effects on success:
 *   - Server sets `bsg_refresh` httpOnly cookie (browser handles).
 *   - Caller (AuthContext) MUST call `setAccessToken(response.accessToken)`
 *     after this resolves so subsequent requests carry the Bearer.
 */
export async function login(body: LoginRequest): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>("/auth/login", body);
  return data;
}

/**
 * POST /auth/refresh — rotate refresh token + issue new access.
 *
 * Normally invoked transparently by the response interceptor on a
 * 401. The explicit export here is for app-boot ("am I still logged
 * in?") and for tests.
 */
export async function refresh(): Promise<RefreshResponse> {
  const { data } = await apiClient.post<RefreshResponse>("/auth/refresh");
  return data;
}

/**
 * POST /auth/logout — revoke server-side row + clear cookie.
 *
 * Always 204. Caller MUST call `setAccessToken(null)` afterwards to
 * drop the in-memory token; otherwise a stale token would survive
 * until expiry (15min) even though the refresh side is dead.
 */
export async function logout(): Promise<void> {
  await apiClient.post("/auth/logout");
}

/**
 * GET /auth/me — load the active user from the access token.
 *
 * Used by AuthContext after a successful refresh on cold boot to
 * hydrate the UI's user state.
 */
export async function me(): Promise<PublicUser> {
  const { data } = await apiClient.get<PublicUser>("/auth/me");
  return data;
}

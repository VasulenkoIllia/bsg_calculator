/**
 * Refresh-token cookie config.
 *
 * Centralised so the controller (Set-Cookie path) and the helpers
 * that read it stay in sync. Constants come from
 * `config/constants.ts` (name + path) so the router mount-point and
 * the cookie's `path` scope can't drift independently.
 */

import type { CookieOptions, Request } from "express";
import { isProd } from "../../config/env";
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from "../../config/constants";

/** Refresh-token cookie attributes. */
export const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  // SameSite=Strict: the cookie is only sent on same-site requests.
  // Safe because the cookie is path-scoped to /api/v1/auth — top-level
  // navigations (e.g. clicking a HubSpot Note link into our SPA) don't
  // include this path, so "lax" gave us no practical benefit while
  // leaving a wider cross-site surface. The SPA's bootstrap call to
  // /api/v1/auth/refresh is same-origin XHR and is unaffected by strict.
  sameSite: "strict",
  // HTTPS-only in prod (set by Traefik). Allowed in dev for localhost.
  secure: isProd,
  path: REFRESH_COOKIE_PATH,
  // 30-day expiry matches refresh-token TTL. The server is the source
  // of truth for revocation; the cookie just needs to outlive
  // the token by no margin.
  maxAge: 30 * 24 * 3600 * 1000
};

/**
 * Extract the raw refresh cookie value, or null if missing.
 *
 * Returning `null` (rather than `""`) makes the "missing cookie"
 * branch impossible to miss at call sites — passing an empty string
 * to `hashRefreshToken` would silently hash "" and DB-lookup it,
 * which is a class of bug the explicit-null contract prevents.
 */
export function readRefreshCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const value = cookies?.[REFRESH_COOKIE_NAME];
  return value && value.length > 0 ? value : null;
}

export { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH };

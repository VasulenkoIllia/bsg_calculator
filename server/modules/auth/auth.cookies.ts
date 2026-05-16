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
  // SameSite=Lax allows top-level navigation cookies (so following a
  // HubSpot Note link to /documents/:number still authenticates) while
  // blocking cross-site form posts that could trigger refresh.
  sameSite: "lax",
  // HTTPS-only in prod (set by Traefik). Allowed in dev for localhost.
  secure: isProd,
  path: REFRESH_COOKIE_PATH,
  // 30-day expiry matches refresh-token TTL. The server is the source
  // of truth for revocation; the cookie just needs to outlive
  // the token by no margin.
  maxAge: 30 * 24 * 3600 * 1000
};

/** Extract the raw refresh cookie value or empty string. */
export function readRefreshCookie(req: Request): string {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[REFRESH_COOKIE_NAME] ?? "";
}

export { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH };

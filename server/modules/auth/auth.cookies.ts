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
import { refreshTokenMaxAgeMs } from "./auth.tokens";

/**
 * Refresh-token cookie attributes.
 *
 * Sprint 9.P — `maxAge` is now derived from the same env-driven helper
 * (`refreshTokenMaxAgeMs`) that computes the DB `expires_at`, so the
 * two can't drift. Previously hardcoded to 30 days; now follows
 * `JWT_REFRESH_EXPIRES` (default 12h).
 */
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
  // Mirrors refresh_tokens.expires_at — single env knob, no drift.
  maxAge: refreshTokenMaxAgeMs()
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

// ─── Phase 8 Stage 2 — trusted-device cookie ─────────────────────────

/**
 * "Trust this browser for 30 days" cookie. Holds an opaque random token
 * (the sha256 hash is stored in `trusted_devices`); same path scope as
 * the refresh cookie so it's sent on /auth/login. 30-day max-age MUST
 * match the DB `expires_at` (see two-factor.service TRUSTED_DEVICE_TTL).
 */
export const TRUSTED_DEVICE_COOKIE_NAME = "bsg_td";
const TRUSTED_DEVICE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const trustedDeviceCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: isProd,
  path: REFRESH_COOKIE_PATH,
  maxAge: TRUSTED_DEVICE_MAX_AGE_MS
};

export function readTrustedDeviceCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const value = cookies?.[TRUSTED_DEVICE_COOKIE_NAME];
  return value && value.length > 0 ? value : null;
}

export { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH };

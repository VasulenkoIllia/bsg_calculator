/**
 * Auth HTTP controllers — thin request/response adapters.
 *
 * Business logic lives in `auth.service.ts`. Controllers only:
 *   - parse + validate the incoming shape (Zod)
 *   - call into the service
 *   - render the response (incl. Set-Cookie for refresh token)
 *   - delegate errors to the error middleware
 */

import type { Request, Response } from "express";
import { isProd } from "../../config/env";
import { findUserById } from "./auth.repository";
import { loginRequestSchema, type LoginResponse } from "./auth.schemas";
import { login, logout, refresh } from "./auth.service";
import { TokenInvalidError } from "../../shared/errors";

const REFRESH_COOKIE_NAME = "bsg_refresh";

const refreshCookieOptions = {
  httpOnly: true,
  // SameSite=Lax allows top-level navigation cookies (so following a
  // HubSpot note link to /documents/:number still authenticates) while
  // blocking cross-site form posts that could trigger refresh.
  sameSite: "lax" as const,
  secure: isProd,                    // HTTPS-only in prod
  path: "/api/v1/auth",              // cookie scoped to auth endpoints only
  // 30 days expiry matches refresh token TTL. Strictly speaking the
  // server is the source of truth; the cookie just needs to outlive
  // the token by no margin.
  maxAge: 30 * 24 * 3600 * 1000
};

/**
 * POST /api/v1/auth/login
 * Body: { identifier, password }
 * Response: { accessToken, user }
 * Side-effect: Set-Cookie bsg_refresh=<raw>
 */
export async function loginController(req: Request, res: Response): Promise<void> {
  const body = loginRequestSchema.parse(req.body);

  const { accessToken, refreshTokenRaw, user } = await login(body);

  res.cookie(REFRESH_COOKIE_NAME, refreshTokenRaw, refreshCookieOptions);
  const payload: LoginResponse = { accessToken, user };
  res.status(200).json(payload);
}

/**
 * POST /api/v1/auth/refresh
 * Cookie: bsg_refresh
 * Response: { accessToken }
 * Side-effect (rotation only): Set-Cookie bsg_refresh=<new>
 */
export async function refreshController(req: Request, res: Response): Promise<void> {
  const rawRefresh = readRefreshCookie(req);
  const outcome = await refresh(rawRefresh);

  if (outcome.kind === "rotated") {
    res.cookie(REFRESH_COOKIE_NAME, outcome.refreshTokenRaw, refreshCookieOptions);
  }
  // graced path: no new cookie — the existing one still in browser
  // is the live refresh token (issued by the rotating tab).

  res.status(200).json({ accessToken: outcome.accessToken });
}

/**
 * POST /api/v1/auth/logout
 * Cookie: bsg_refresh
 * Response: 204
 * Side-effect: clears the cookie + revokes the row.
 */
export async function logoutController(req: Request, res: Response): Promise<void> {
  const rawRefresh = readRefreshCookieOrEmpty(req);
  if (rawRefresh) {
    await logout(rawRefresh);
  }
  res.clearCookie(REFRESH_COOKIE_NAME, { path: refreshCookieOptions.path });
  res.status(204).end();
}

/**
 * GET /api/v1/auth/me
 * Header: Authorization: Bearer <access>
 * Response: user (public shape)
 *
 * The require-auth middleware has already set req.user; we re-fetch
 * the full row so the response carries displayName + login + active.
 */
export async function meController(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    // Should never happen — require-auth runs before this.
    throw new TokenInvalidError();
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    throw new TokenInvalidError("Authenticated user no longer exists.");
  }
  res.status(200).json({
    id: user.id,
    email: user.email,
    login: user.login,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    isActive: user.isActive
  });
}

// ─── Helpers ────────────────────────────────────────────────────────

function readRefreshCookie(req: Request): string {
  const raw = readRefreshCookieOrEmpty(req);
  if (!raw) {
    throw new TokenInvalidError("Missing refresh cookie.");
  }
  return raw;
}

function readRefreshCookieOrEmpty(req: Request): string {
  // cookie-parser middleware populates `req.cookies`. The type from
  // @types/cookie-parser augments Request.
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[REFRESH_COOKIE_NAME] ?? "";
}

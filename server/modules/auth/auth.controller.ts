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
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  readRefreshCookie,
  refreshCookieOptions
} from "./auth.cookies";
import {
  changeOwnPasswordRequestSchema,
  loginRequestSchema,
  type LoginResponse
} from "./auth.schemas";
import {
  changeOwnPassword,
  loadActiveUserPublic,
  login,
  logout,
  refresh,
  signOutEverywhere
} from "./auth.service";
import { TokenInvalidError } from "../../shared/errors";

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
  if (!rawRefresh) {
    throw new TokenInvalidError("Missing refresh cookie.");
  }
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
  const rawRefresh = readRefreshCookie(req);
  if (rawRefresh) {
    await logout(rawRefresh);
  }
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
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
  // Goes through the service per backend_conventions.md §1.
  const user = await loadActiveUserPublic(req.user.id);
  res.status(200).json(user);
}

// ─── Sprint 9.T — /me/password + /me/sign-out-everywhere ──────────────

/**
 * POST /api/v1/auth/me/password
 * Header: Authorization: Bearer <access>
 * Body:   { currentPassword, newPassword }
 * Response: 204
 * Side-effect: clears the local refresh cookie (current device must
 *   re-login) + revokes EVERY active refresh token for the user
 *   (all other devices forced out on their next refresh).
 *
 * The mandatory `currentPassword` check defends against XSS-driven
 * silent password changes — a stolen access token alone can't lock
 * the legitimate owner out.
 */
export async function changeOwnPasswordController(
  req: Request,
  res: Response
): Promise<void> {
  if (!req.user) throw new TokenInvalidError();
  const body = changeOwnPasswordRequestSchema.parse(req.body);
  await changeOwnPassword({
    userId: req.user.id,
    currentPassword: body.currentPassword,
    newPassword: body.newPassword
  });
  // The bulk-revoke killed the current session's refresh too. Clear
  // the cookie so the next request from this tab doesn't try to use
  // it (avoids a confusing 401 before the FE notices).
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.status(204).end();
}

/**
 * POST /api/v1/auth/me/sign-out-everywhere
 * Header: Authorization: Bearer <access>
 * Response: 204
 * Side-effect: revokes all refresh tokens (incl. this device's) +
 *   clears the local cookie. The current access token stays valid
 *   for up to ~15 min — the FE should call /auth/logout immediately
 *   after to invalidate the in-memory state.
 */
export async function signOutEverywhereController(
  req: Request,
  res: Response
): Promise<void> {
  if (!req.user) throw new TokenInvalidError();
  await signOutEverywhere(req.user.id);
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.status(204).end();
}

// Cookie read/write/options helpers live in ./auth.cookies.ts

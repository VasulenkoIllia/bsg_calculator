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
import { loginRequestSchema, type LoginResponse } from "./auth.schemas";
import { loadActiveUserPublic, login, logout, refresh } from "./auth.service";
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

// Cookie read/write/options helpers live in ./auth.cookies.ts

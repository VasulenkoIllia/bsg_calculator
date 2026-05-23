/**
 * Auth route registry — mounted under `/api/v1/auth` in app.ts.
 *
 * Auth posture per `phase_08_backend_plan.md` §4.0:
 *   POST   /login    no auth
 *   POST   /refresh  refresh cookie (no Bearer)
 *   POST   /logout   refresh cookie (no Bearer)
 *   GET    /me       Bearer access token (requireAuth)
 *
 * Sprint 9.T — Phase 8 Stage 2 (partial; 2FA deferred):
 *   POST   /me/password               Bearer + currentPassword re-auth
 *   POST   /me/sign-out-everywhere    Bearer
 */

import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler";
import {
  loginLimiter,
  refreshLimiter,
  selfServiceLimiter
} from "../../middleware/rate-limit";
import { requireAuth } from "../../middleware/require-auth";
import {
  changeOwnPasswordController,
  loginController,
  logoutController,
  meController,
  refreshController,
  signOutEverywhereController
} from "./auth.controller";

export const authRouter = Router();

// Per-route rate-limits stack on top of the API-wide 60/min in app.ts.
// loginLimiter (5/min) is the credential-stuffing defence.
// refreshLimiter (20/min) generously accommodates multi-tab refresh.
//
// Sprint 7.3.E: /logout previously had no per-route limit (global
// 60/min only). The logout handler reads the refresh cookie + does
// a bcrypt-cost-12 compare to invalidate the row — that's CPU-bound
// at 60/min. Mounted refreshLimiter (20/min) here too; legitimate
// multi-tab close patterns stay well under it.
authRouter.post("/login", loginLimiter, asyncHandler(loginController));
authRouter.post("/refresh", refreshLimiter, asyncHandler(refreshController));
authRouter.post("/logout", refreshLimiter, asyncHandler(logoutController));
authRouter.get("/me", requireAuth(), asyncHandler(meController));

// Sprint 9.T — self-service. Sprint 9.V audit fix M4 — use a
// dedicated `selfServiceLimiter` (separate counter pool from
// `loginLimiter`) so a burst of /me/password attempts from an
// operator can't eat into the unauthenticated /login budget.
authRouter.post(
  "/me/password",
  requireAuth(),
  selfServiceLimiter,
  asyncHandler(changeOwnPasswordController)
);
authRouter.post(
  "/me/sign-out-everywhere",
  requireAuth(),
  selfServiceLimiter,
  asyncHandler(signOutEverywhereController)
);

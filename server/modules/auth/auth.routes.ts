/**
 * Auth route registry — mounted under `/api/v1/auth` in app.ts.
 *
 * Auth posture per `phase_08_backend_plan.md` §4.0:
 *   POST   /login    no auth
 *   POST   /refresh  refresh cookie (no Bearer)
 *   POST   /logout   refresh cookie (no Bearer)
 *   GET    /me       Bearer access token (requireAuth)
 */

import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler";
import { loginLimiter, refreshLimiter } from "../../middleware/rate-limit";
import { requireAuth } from "../../middleware/require-auth";
import {
  loginController,
  logoutController,
  meController,
  refreshController
} from "./auth.controller";

export const authRouter = Router();

// Per-route rate-limits stack on top of the API-wide 60/min in app.ts.
// loginLimiter (5/min) is the credential-stuffing defence.
// refreshLimiter (20/min) generously accommodates multi-tab refresh.
authRouter.post("/login", loginLimiter, asyncHandler(loginController));
authRouter.post("/refresh", refreshLimiter, asyncHandler(refreshController));
authRouter.post("/logout", asyncHandler(logoutController));
authRouter.get("/me", requireAuth(), asyncHandler(meController));

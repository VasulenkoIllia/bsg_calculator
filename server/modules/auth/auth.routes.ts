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
import { requireAuth } from "../../middleware/require-auth";
import {
  loginController,
  logoutController,
  meController,
  refreshController
} from "./auth.controller";

export const authRouter = Router();

authRouter.post("/login", asyncHandler(loginController));
authRouter.post("/refresh", asyncHandler(refreshController));
authRouter.post("/logout", asyncHandler(logoutController));
authRouter.get("/me", requireAuth(), asyncHandler(meController));

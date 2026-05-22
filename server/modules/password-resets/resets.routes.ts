/**
 * Sprint 9.O — public password-reset-link routes.
 *
 * Mounted by app.ts at `/api/v1/auth/password-reset`. No auth gate
 * — the raw token IS the credential. Returns 404 on any "not
 * pending" reason so an attacker can't probe token state.
 *
 * The super_admin issue endpoint lives inside the users router
 * (POST /users/:id/password-reset-link) — that side is gated by
 * the existing requireRole('super_admin') middleware on that
 * router.
 */

import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler";
import {
  consumeResetController,
  previewResetController
} from "./resets.controller";

export const resetsPublicRouter = Router();
resetsPublicRouter.get("/:token", asyncHandler(previewResetController));
resetsPublicRouter.post("/:token", asyncHandler(consumeResetController));

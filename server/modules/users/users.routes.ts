/**
 * Users route registry — mounted at /api/v1/users in app.ts.
 *
 * ALL endpoints require Bearer access + super_admin role per the
 * Phase 8 capability matrix (docs/phase_8_security_admin_audit.md §2):
 * only super_admin can list / invite / block / reset password /
 * change roles of other users. A regular admin cannot see this
 * surface at all.
 *
 * Phase 8 Stage 3 — guard tightened from `admin` to `super_admin`
 * (was set during Stage 1 as a forward-compat placeholder; the
 * UI didn't exist yet and admin saw a no-op endpoint).
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { asyncHandler } from "../../shared/async-handler";
import {
  createController,
  getController,
  listController,
  patchController,
  resetPasswordController
} from "./users.controller";

export const usersRouter = Router();

// Apply both guards once on the router instead of repeating per route.
// Phase 8 Stage 3 — super_admin is the only tier that can manage
// other users. `requireRole('super_admin')` rejects regular admins
// AND regular users with `403 FORBIDDEN`.
usersRouter.use(requireAuth(), requireRole("super_admin"));

usersRouter.get("/", asyncHandler(listController));
usersRouter.post("/", asyncHandler(createController));
usersRouter.get("/:id", asyncHandler(getController));
usersRouter.patch("/:id", asyncHandler(patchController));
usersRouter.post("/:id/reset-password", asyncHandler(resetPasswordController));

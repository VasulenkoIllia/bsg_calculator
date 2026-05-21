/**
 * Users route registry — mounted at /api/v1/users in app.ts.
 *
 * ALL endpoints require Bearer access + admin role per
 * `phase_08_backend_plan.md` §4.0 auth matrix.
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
// Sprint 9.L D5 — call `requireRole('admin')` directly rather than
// the deleted `requireAdmin()` shim. Semantics are identical
// (admin OR super_admin; `requireRole` uses the hierarchical tier
// table).
usersRouter.use(requireAuth(), requireRole("admin"));

usersRouter.get("/", asyncHandler(listController));
usersRouter.post("/", asyncHandler(createController));
usersRouter.get("/:id", asyncHandler(getController));
usersRouter.patch("/:id", asyncHandler(patchController));
usersRouter.post("/:id/reset-password", asyncHandler(resetPasswordController));

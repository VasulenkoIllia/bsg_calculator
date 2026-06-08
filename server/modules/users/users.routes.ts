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
import { invitesAdminRouter } from "../invites/invites.routes";
import { createPasswordResetLinkController } from "../password-resets/resets.controller";
import {
  createController,
  forceDisable2faController,
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

// Sprint 9.O — invite-link admin endpoints sit UNDER /users/invites
// because conceptually they manage potential user accounts. The
// PUBLIC /accept-invite endpoints live separately under
// /auth/invite (no auth gate). Mount the sub-router BEFORE the
// /:id routes so /invites isn't shadowed by /:id parsing.
usersRouter.use("/invites", invitesAdminRouter);

usersRouter.get("/", asyncHandler(listController));
usersRouter.post("/", asyncHandler(createController));
usersRouter.get("/:id", asyncHandler(getController));
usersRouter.patch("/:id", asyncHandler(patchController));
usersRouter.post("/:id/reset-password", asyncHandler(resetPasswordController));
// Sprint 9.O — issue a one-time password-reset LINK. Distinct from
// the existing /:id/reset-password endpoint which sets the password
// directly. Both live so super_admin can pick the flow they need.
// The public /reset-password/:token endpoints are mounted under
// /api/v1/auth/password-reset in app.ts (no auth — the token is
// the credential).
usersRouter.post(
  "/:id/password-reset-link",
  asyncHandler(createPasswordResetLinkController)
);
// Phase 8 Stage 2 — super_admin force-disable a user's 2FA (recovery).
usersRouter.post("/:id/2fa/disable", asyncHandler(forceDisable2faController));

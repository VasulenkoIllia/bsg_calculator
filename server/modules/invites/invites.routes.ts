/**
 * Sprint 9.O — invite-link routes.
 *
 * Two routers exposed because the auth gate differs:
 *
 *   1. `invitesAdminRouter` mounts under `/api/v1/users/invites` and
 *      sits BEHIND `requireAuth + requireRole('super_admin')` (per
 *      the existing /api/v1/users router).
 *
 *   2. `invitesPublicRouter` mounts under `/api/v1/auth/invite` with
 *      NO auth — the raw token IS the credential. Returns 404 for
 *      any "not pending" reason so an attacker can't probe token
 *      state.
 *
 * Both groups are intentionally lightweight (no rate-limit beyond
 * the global IP-level limiter at app.ts). If the public accept
 * endpoint becomes a brute-force target we can add a per-token
 * limiter later — until then the 32-byte cryptorandom token's
 * search space (~10^57) is the primary defence.
 */

import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler";
import {
  acceptInviteController,
  createInviteController,
  listInvitesController,
  previewInviteController,
  reissueInviteController,
  revokeInviteController
} from "./invites.controller";

// Mounted by the existing /api/v1/users router (super_admin gated)
// — see server/modules/users/users.routes.ts for the gate stack.
export const invitesAdminRouter = Router();
invitesAdminRouter.post("/", asyncHandler(createInviteController));
invitesAdminRouter.get("/", asyncHandler(listInvitesController));
invitesAdminRouter.delete("/:id", asyncHandler(revokeInviteController));
// Re-issue: revoke the old token + mint a fresh copyable link (same role).
invitesAdminRouter.post("/:id/reissue", asyncHandler(reissueInviteController));

// Mounted by app.ts under /api/v1/auth/invite — PUBLIC.
export const invitesPublicRouter = Router();
invitesPublicRouter.get("/:token", asyncHandler(previewInviteController));
invitesPublicRouter.post("/:token/accept", asyncHandler(acceptInviteController));

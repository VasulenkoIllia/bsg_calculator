/**
 * Sprint 9.U — admin_actions audit log router.
 *
 * Mounted by app.ts at /api/v1/admin. Single endpoint today
 * (GET /audit-log) but the prefix is reserved for future
 * super_admin-only admin surfaces (Stage 6 may add more under here).
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { requireRole } from "../../middleware/require-role";
import { listingLimiter } from "../../middleware/rate-limit";
import { asyncHandler } from "../../shared/async-handler";
import { listAdminActionsController } from "./admin-actions.controller";

export const adminActionsRouter = Router();

// super_admin only — audit log surface.
adminActionsRouter.use(requireAuth(), requireRole("super_admin"));

adminActionsRouter.get(
  "/audit-log",
  listingLimiter,
  asyncHandler(listAdminActionsController)
);

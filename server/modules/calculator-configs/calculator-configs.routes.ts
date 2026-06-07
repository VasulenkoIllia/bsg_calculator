/**
 * Calculator-configs routes — mounted at /api/v1/calculator-configs
 * in app.ts.
 *
 * All endpoints require any active user (no admin gate). The list
 * endpoint sees the same `requireAuth` middleware as the rest — we
 * could later restrict deletion to admins (or to the creator only)
 * if BSG ops asks for it. For now the model is "operators trust
 * each other's drafts".
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { hubspotProxyLimiter, listingLimiter } from "../../middleware/rate-limit";
import { requireRole } from "../../middleware/require-role";
import { asyncHandler } from "../../shared/async-handler";
import {
  createController,
  deleteController,
  getController,
  listController,
  restoreController,
  syncController,
  updateController
} from "./calculator-configs.controller";
import { listCalcConfigEventsController } from "../events/events.controller";

export const calculatorConfigsRouter = Router();

calculatorConfigsRouter.use(requireAuth());

// Sprint 6.9 N4: tighter rate limit on the list path. See
// middleware/rate-limit.ts → listingLimiter (30/min/IP).
calculatorConfigsRouter.get("/", listingLimiter, asyncHandler(listController));
// Sprint 9.R — Phase 8 capability matrix tightened: only admin+
// can mutate calc-configs. `user` retains read access (GET / and
// GET /:id) but can't create / edit / delete drafts. Aligns with
// the "user = sales rep reading quotes" model.
calculatorConfigsRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(createController)
);
calculatorConfigsRouter.get("/:id", asyncHandler(getController));
calculatorConfigsRouter.put(
  "/:id",
  requireRole("admin"),
  asyncHandler(updateController)
);
// Cycle 2 — soft-delete tears down the upstream HubSpot Note, so gate it
// with the same hubspotProxyLimiter as /:id/sync (parity with the
// documents DELETE route) — a spammy retry can't exhaust the HubSpot budget.
calculatorConfigsRouter.delete(
  "/:id",
  requireRole("admin"),
  hubspotProxyLimiter,
  asyncHandler(deleteController)
);
// Cycle 2 — super_admin-only restore of a soft-deleted calc. Mirrors
// the documents restore policy: restore decisions are a single
// chokepoint for audit-trail integrity.
calculatorConfigsRouter.post(
  "/:id/restore",
  requireRole("super_admin"),
  asyncHandler(restoreController)
);
// Phase 9.I — manual HubSpot Note write-back. Admin role + tight
// rate-limit (10/min/IP via hubspotProxyLimiter) so a spammy retry
// can't exhaust the per-Private-App HubSpot budget.
calculatorConfigsRouter.post(
  "/:id/sync",
  requireRole("admin"),
  hubspotProxyLimiter,
  asyncHandler(syncController)
);

// Phase 8 Stage 4 — calc-config history. Read-only, any authenticated
// user can list.
calculatorConfigsRouter.get(
  "/:id/events",
  asyncHandler(listCalcConfigEventsController)
);

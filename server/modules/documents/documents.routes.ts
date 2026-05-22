/**
 * Documents routes — mounted at /api/v1/documents (+ /numbering peek)
 * in app.ts.
 *
 * The PDF stream endpoint is mounted by `pdf.routes.ts` (Sprint 4.C)
 * because it needs the pdf module's Puppeteer pool wiring.
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { hubspotProxyLimiter, listingLimiter } from "../../middleware/rate-limit";
import { requireRole } from "../../middleware/require-role";
import { asyncHandler } from "../../shared/async-handler";
import {
  createController,
  deleteController,
  getByNumberController,
  listController,
  peekNumberController,
  restoreController,
  syncController,
  useAsTemplateController
} from "./documents.controller";
import { listDocumentEventsController } from "../events/events.controller";

export const documentsRouter = Router();
documentsRouter.use(requireAuth());

// Sprint 6.9 N4: tighter rate limit on the list path — see
// middleware/rate-limit.ts for sizing rationale (30/min/IP).
documentsRouter.get("/", listingLimiter, asyncHandler(listController));
// Sprint 9.R — Phase 8 capability matrix: only admin+ can create
// documents. `user` is the read-only viewer tier (e.g. sales rep
// who reviews quotes but doesn't author them).
documentsRouter.post("/", requireRole("admin"), asyncHandler(createController));
documentsRouter.get("/:number", asyncHandler(getByNumberController));
// Use-as-template ALSO writes a new document (just pre-populated
// from an existing one). Same admin gate.
documentsRouter.post(
  "/:number/use-as-template",
  requireRole("admin"),
  asyncHandler(useAsTemplateController)
);
// Phase 9 — HubSpot Note write-back. Tighter rate limit
// (`hubspotProxyLimiter` = 10/min/IP) keeps us comfortably under
// HubSpot's per-Private-App 100 req / 10s ceiling even if the
// operator spams Sync. Role gate is `admin` because Stage 5 (doc
// deletion) needs the same level and we don't want regular users
// to be able to push notes into the customer's CRM timeline.
documentsRouter.post(
  "/:number/sync",
  requireRole("admin"),
  hubspotProxyLimiter,
  asyncHandler(syncController)
);

// Phase 8 Stage 4 — document history. Read-only, any authenticated
// user can list. Wired here (not on a separate /events router) so
// the URL hierarchy reads entity-first.
documentsRouter.get(
  "/:number/events",
  asyncHandler(listDocumentEventsController)
);

// Phase 8 Stage 5 — soft-delete (admin) + restore (super_admin).
// DELETE uses the body for reason+note (not query params) per
// REST convention for non-idempotent destructive ops with payload.
// hubspotProxyLimiter applies the same rate-limit as Sync because
// delete also hits HubSpot (one call per delete).
documentsRouter.delete(
  "/:number",
  requireRole("admin"),
  hubspotProxyLimiter,
  asyncHandler(deleteController)
);
documentsRouter.post(
  "/:number/restore",
  requireRole("super_admin"),
  asyncHandler(restoreController)
);

/**
 * Numbering helper. Mounted as a sibling of `/documents` because the
 * "preview the next BSG-XXXXX" endpoint logically belongs to the
 * numbering service, not to any one document.
 */
export const numberingRouter = Router();
numberingRouter.use(requireAuth());
numberingRouter.get("/peek", asyncHandler(peekNumberController));

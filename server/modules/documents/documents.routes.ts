/**
 * Documents routes — mounted at /api/v1/documents (+ /numbering peek)
 * in app.ts.
 *
 * The PDF stream endpoint is mounted by `pdf.routes.ts` (Sprint 4.C)
 * because it needs the pdf module's Puppeteer pool wiring.
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { listingLimiter } from "../../middleware/rate-limit";
import { asyncHandler } from "../../shared/async-handler";
import {
  createController,
  getByNumberController,
  listController,
  peekNumberController,
  syncController,
  useAsTemplateController
} from "./documents.controller";

export const documentsRouter = Router();
documentsRouter.use(requireAuth());

// Sprint 6.9 N4: tighter rate limit on the list path — see
// middleware/rate-limit.ts for sizing rationale (30/min/IP).
documentsRouter.get("/", listingLimiter, asyncHandler(listController));
documentsRouter.post("/", asyncHandler(createController));
documentsRouter.get("/:number", asyncHandler(getByNumberController));
documentsRouter.post(
  "/:number/use-as-template",
  asyncHandler(useAsTemplateController)
);
documentsRouter.post("/:number/sync", asyncHandler(syncController));

/**
 * Numbering helper. Mounted as a sibling of `/documents` because the
 * "preview the next BSG-XXXXX" endpoint logically belongs to the
 * numbering service, not to any one document.
 */
export const numberingRouter = Router();
numberingRouter.use(requireAuth());
numberingRouter.get("/peek", asyncHandler(peekNumberController));

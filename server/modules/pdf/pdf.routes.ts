/**
 * Two PDF routers:
 *
 *   - `pdfRouter` — mounted at /api/v1/documents (with `/:number/pdf`).
 *     Streams a SAVED document by its BSG number.
 *
 *   - `pdfPreviewRouter` — mounted at /api/v1/pdf. POST /preview takes
 *     a wizard payload directly and renders, no DB save. Used by the
 *     wizard's "Generate PDF" button (Sprint 6.0) so the operator can
 *     export the in-progress draft via the same Puppeteer pipeline
 *     the saved-document endpoint uses. Eliminates the
 *     browser-native window.print() path that varied output per
 *     user browser (Sprint 5.5 caveat).
 */

import { Router } from "express";
import { pdfPreviewLimiter } from "../../middleware/rate-limit";
import { requireAuth } from "../../middleware/require-auth";
import { asyncHandler } from "../../shared/async-handler";
import { downloadPdfController, previewPdfController } from "./pdf.controller";

export const pdfRouter = Router();
pdfRouter.use(requireAuth());

// Nested under /documents/:number — mounted in app.ts as
// app.use("/api/v1/documents", pdfRouter).
pdfRouter.get("/:number/pdf", asyncHandler(downloadPdfController));

export const pdfPreviewRouter = Router();
pdfPreviewRouter.use(requireAuth());

// POST /api/v1/pdf/preview — render-from-payload (no save).
//
// Sprint 6.F.1 (audit HIGH): dedicated 10 req/min/IP limiter on top
// of the global apiLimiter so a single authenticated user can't
// monopolise the shared Puppeteer browser pool and DoS PDF generation
// for everyone else. Same pattern as hubspotProxyLimiter, sized for
// the operator's realistic "preview-iterate" loop (~handful of
// renders per minute, not 60).
pdfPreviewRouter.post(
  "/preview",
  pdfPreviewLimiter,
  asyncHandler(previewPdfController)
);

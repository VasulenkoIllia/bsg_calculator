/**
 * PDF route — `GET /api/v1/documents/:number/pdf?download=true`.
 *
 * Mounted from app.ts. The path lives under /documents/* so the
 * frontend can wire "Download PDF" with the same Bearer/refresh
 * conventions as every other document endpoint.
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/require-auth";
import { asyncHandler } from "../../shared/async-handler";
import { downloadPdfController } from "./pdf.controller";

export const pdfRouter = Router();
pdfRouter.use(requireAuth());

// Nested under /documents/:number — mounted in app.ts as
// app.use("/api/v1/documents", pdfRouter).
pdfRouter.get("/:number/pdf", asyncHandler(downloadPdfController));

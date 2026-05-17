/**
 * GET /api/v1/documents/:number/pdf — stream a rendered PDF.
 *
 * Pipeline:
 *   1. Validate the URL :number against the BSG-XXXXXXX-YYYYYY regex.
 *   2. Load the document by number (404 if missing).
 *   3. Shape-check the persisted payload — surface 422 if it doesn't
 *      match DocumentTemplatePayload (e.g. legacy / calc-only saves).
 *   4. Server-side render via `buildOfferPdfHtml` (shared with the
 *      wizard's Preview iframe; included from tsconfig.server.json
 *      since Sprint 4.E.2).
 *   5. Puppeteer renders → Buffer.
 *   6. Stream to client with Content-Disposition controlled by
 *      `?download=true`.
 */

import type { Request, Response } from "express";
import { buildOfferPdfHtml } from "../../../src/components/document-wizard/buildOfferPdfHtml";
import type { DocumentTemplatePayload } from "../../../src/components/document-wizard/types";
import { logger } from "../../middleware/logger";
import { ValidationError } from "../../shared/errors";
import { getRawDocumentByNumber } from "../documents/documents.service";
import { renderHtmlToPdf } from "./pdf.service";

/**
 * Format check for the BSG-XXXXXXX-YYYYYY document number passed via
 * the URL. Two layers of defence:
 *   1. The DB lookup further down returns 404 for any non-matching
 *      string — primary guard.
 *   2. This regex check, run BEFORE the lookup, defends the
 *      Content-Disposition filename header from CRLF / quote
 *      injection on inputs that could in some routing edge case
 *      bypass step 1 (e.g. a future signed-URL handler that bypasses
 *      `getRawDocumentByNumber`).
 */
const DOCUMENT_NUMBER_PATTERN = /^BSG-\d{7}-[0-9A-Z]{6}$/i;

/**
 * Best-effort runtime check that the persisted payload is a wizard-
 * style DocumentTemplatePayload. Same logic as the frontend's
 * `asWizardPayload` in DocumentViewPage — the four MUST-HAVE top-
 * level keys that `buildOfferPdfHtml` dereferences are checked. A
 * deeper-shape mismatch surfaces as a thrown error from
 * `buildOfferPdfHtml`, which the caller turns into a 422.
 */
function isWizardPayload(payload: unknown): payload is DocumentTemplatePayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.documentScope === "string" &&
    typeof p.header === "object" &&
    typeof p.layout === "object" &&
    typeof p.agreementParties === "object"
  );
}

export async function downloadPdfController(
  req: Request,
  res: Response
): Promise<void> {
  const number = req.params.number;
  if (!DOCUMENT_NUMBER_PATTERN.test(number)) {
    throw new ValidationError(
      [{ path: ["number"], message: "Document number is malformed" }],
      "Malformed document number in URL"
    );
  }
  const download = req.query.download === "true";

  const doc = await getRawDocumentByNumber(number);

  if (!isWizardPayload(doc.payload)) {
    logger.warn(
      { number, payloadKeys: Object.keys((doc.payload as Record<string, unknown>) ?? {}) },
      "[pdf] payload doesn't match DocumentTemplatePayload shape — cannot render"
    );
    throw new ValidationError(
      [
        {
          path: ["payload"],
          message: "Document payload doesn't match wizard shape"
        }
      ],
      "Cannot render — payload not in DocumentTemplatePayload shape"
    );
  }

  // Build the HTML server-side using the SAME builder the wizard's
  // Preview iframe uses (shared via tsconfig.server.json glob since
  // Sprint 4.E.2). Wrapped in try/catch so a deeper-shape mismatch
  // (e.g. payload.layout missing a sub-field the builder dereferences)
  // surfaces as 422, not an unhandled 500.
  let html: string;
  try {
    html = buildOfferPdfHtml(doc.payload);
  } catch (err) {
    logger.warn(
      { number, err: (err as Error).message },
      "[pdf] buildOfferPdfHtml threw — payload likely incomplete"
    );
    throw new ValidationError(
      [
        {
          path: ["payload"],
          message: `buildOfferPdfHtml failed: ${(err as Error).message}`
        }
      ],
      "PDF render preparation failed"
    );
  }

  const buffer = await renderHtmlToPdf(html);

  // `number` already passed the regex check above, so safe to use in
  // Content-Disposition without further escaping.
  const filename = download ? `${number}.pdf` : "inline.pdf";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${download ? "attachment" : "inline"}; filename="${filename}"`
  );
  res.setHeader("Content-Length", buffer.length.toString());
  // Cache-Control: documents are immutable once saved, but we don't
  // know whether the caller is the originating operator (who just saved
  // it) or a downstream consumer. Use `private, max-age=300` — 5 min
  // browser cache for the same Bearer.
  res.setHeader("Cache-Control", "private, max-age=300");
  res.status(200).end(buffer);
}

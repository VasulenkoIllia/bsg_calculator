/**
 * Two PDF render endpoints share the Puppeteer pipeline:
 *
 *   - GET  /api/v1/documents/:number/pdf  → saved document (DB lookup)
 *   - POST /api/v1/pdf/preview            → wizard "Generate PDF" path,
 *                                           takes payload, no DB save
 *
 * Sprint 6.0 added /pdf/preview so the wizard no longer relies on
 * browser-native window.print() → Save as PDF (which used the user's
 * own browser PDF engine, introducing Safari/Firefox variability per
 * the Sprint 5.5 caveats). Both endpoints feed the SAME
 * buildOfferPdfHtml + renderHtmlToPdf pipeline → single render engine
 * across the app.
 */

import type { Request, Response } from "express";
// ARCHITECTURE NOTE (Sprint 5.F.2 audit): the server imports the PDF
// builder out of `src/components/document-wizard/` directly. The
// "components/" path segment reads as React-UI even though the files
// behind these specific imports are pure-string HTML builders with
// no React deps (enforced by the tsconfig.server.json include glob —
// only the `.ts` files in pdf-kit/, offerPdf/, agreementPdf/ are
// pulled into the server tree). A cleaner home for these builders is
// `src/shared/pdf-templates/`; the move is deferred to a dedicated
// refactor (Sprint 5.F.4 / decisions.md) because relocating ~30
// files would touch every wizard React import and we currently lack
// E2E coverage to verify nothing broke. The visual-diff harness
// would catch a regression in the OUTPUT, but a broken React state
// hydration would need wizard E2E tests we haven't shipped yet.
import { buildOfferPdfHtml } from "../../../src/components/document-wizard/buildOfferPdfHtml";
import type { DocumentTemplatePayload } from "../../../src/components/document-wizard/types";
import { logger } from "../../middleware/logger";
import { ValidationError } from "../../shared/errors";
import { getRawDocumentByNumber } from "../documents/documents.service";
import { insertDocumentEvent } from "../events/events.repository";
import { tryRecordEvent } from "../events/events.helpers";
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
  // `typeof null === "object"` in JS, so an explicit non-null check
  // is required for each nested object key. Without it a payload
  // like { documentScope:"offer", header:null, layout:null,
  // agreementParties:null } would pass this guard and the deeper
  // mismatch would surface as a thrown error inside buildOfferPdfHtml
  // (still caught as 422, but the error message is more confusing).
  return (
    typeof p.documentScope === "string" &&
    p.header !== null && typeof p.header === "object" &&
    p.layout !== null && typeof p.layout === "object" &&
    p.agreementParties !== null && typeof p.agreementParties === "object"
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

  // Phase 8 Stage 4 — record the download AFTER the buffer is shipped
  // so a slow event-log INSERT doesn't delay the PDF response. We
  // fire-and-forget; an event-log outage doesn't degrade the user's
  // primary action. The browser cache-revalidate (within 5 min)
  // would NOT re-hit this controller, so each unique download
  // produces exactly one event.
  if (req.user?.id) {
    const actorUserId = req.user.id;
    const documentId = doc.id;
    // Sprint 9.M D1 — `tryRecordEvent` swallows + logs the failure.
    // We still `void` the outer Promise so the response stream isn't
    // delayed by the event INSERT round-trip (the helper itself is
    // async but we don't await it here on purpose — best-effort,
    // post-response audit).
    void tryRecordEvent(
      () =>
        insertDocumentEvent({
          documentId,
          eventType: "pdf_downloaded",
          actorUserId,
          meta: { number, download }
        }),
      { label: "pdf", context: { documentId, number } }
    );
  }
}

/**
 * POST /api/v1/pdf/preview — render a PDF directly from a payload,
 * with NO DB save. Used by the wizard's "Generate PDF" button so the
 * operator can export the in-progress draft before committing it to
 * a numbered document. Same Puppeteer pipeline as
 * GET /:number/pdf — guarantees byte-equivalent output between the
 * "preview the draft" path and the "download the saved doc" path.
 *
 * Body: `{ payload: DocumentTemplatePayload }`. The payload is
 * validated through `isWizardPayload` first; a malformed body
 * surfaces as 400 before any Puppeteer call.
 *
 * Returns: `application/pdf` stream, Content-Disposition: inline so
 * the browser shows it in-tab by default. The frontend wraps the
 * response in a Blob URL + hidden anchor click for the "download"
 * affordance (same pattern as the DocumentViewPage handler).
 *
 * NO `:number` in the URL → no Content-Disposition filename concern
 * (we hardcode `preview.pdf`). The endpoint is auth-gated via
 * pdfRouter's `requireAuth()` so an unauthenticated caller can't
 * burn the Puppeteer pool.
 */
export async function previewPdfController(
  req: Request,
  res: Response
): Promise<void> {
  const payload: unknown = (req.body as Record<string, unknown> | undefined)?.payload;

  if (!isWizardPayload(payload)) {
    throw new ValidationError(
      [{ path: ["payload"], message: "payload not in DocumentTemplatePayload shape" }],
      "Cannot render — payload not in DocumentTemplatePayload shape"
    );
  }

  let html: string;
  try {
    html = buildOfferPdfHtml(payload);
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "[pdf:preview] buildOfferPdfHtml threw — payload likely incomplete"
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

  res.setHeader("Content-Type", "application/pdf");
  // Hardcoded filename — there's no BSG number yet (this endpoint is
  // pre-save). The frontend overrides the saved filename on the
  // download anchor anyway.
  res.setHeader("Content-Disposition", `inline; filename="preview.pdf"`);
  res.setHeader("Content-Length", buffer.length.toString());
  // No cache: previews are render-on-demand and depend on the live
  // wizard draft. Caching would defeat the iteration UX.
  res.setHeader("Cache-Control", "no-store");
  res.status(200).end(buffer);
}

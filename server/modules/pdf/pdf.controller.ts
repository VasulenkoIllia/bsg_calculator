/**
 * GET /api/v1/documents/:number/pdf — stream a rendered PDF.
 *
 * Pipeline:
 *   1. Load the document by number (404 if missing).
 *   2. Frontend's `buildOfferPdfHtml` runs server-side via shared
 *      TypeScript transpilation — `documents.payload` is expected to
 *      be a `DocumentTemplatePayload` shape (wizard SaveButton emits
 *      that shape in Sprint 4.E).
 *   3. Puppeteer renders → Buffer.
 *   4. Stream to client with Content-Disposition controlled by
 *      `?download=true`.
 *
 * Sprint 4.C limitation: the PDF builder lives in `src/components/
 * document-wizard/` — that path is compiled with the frontend tsconfig
 * (NodeNext, .js suffix). We can't import it directly from server/
 * yet without a build-time bundle step. As an interim, this endpoint
 * accepts pre-rendered HTML via the `?renderedHtml=` query (FOR
 * INTERNAL TESTING ONLY) — production wiring lands in Sprint 4.E
 * along with a shared `src/document-templates/` package.
 *
 * Returns 422 when the payload shape can't be rendered (so the
 * frontend can show "render failed — re-save to fix").
 */

import type { Request, Response } from "express";
import { logger } from "../../middleware/logger";
import { NotImplementedError, ValidationError } from "../../shared/errors";
import { getRawDocumentByNumber } from "../documents/documents.service";
import { renderHtmlToPdf } from "./pdf.service";

export async function downloadPdfController(
  req: Request,
  res: Response
): Promise<void> {
  const number = req.params.number;
  const download = req.query.download === "true";

  const doc = await getRawDocumentByNumber(number);

  // Sprint 4.C interim — the PDF builder isn't shared between server
  // and src/. Until Sprint 4.E ships the shared template module,
  // expose a debug-friendly NOT_IMPLEMENTED so callers see why.
  //
  // The plumbing (acquireBrowser → renderHtmlToPdf → stream) is
  // fully wired and tested with a literal HTML payload in pdf.service
  // tests. Once the shared template module exists, this controller
  // will swap to:
  //
  //   const html = buildOfferPdfHtml(doc.payload as DocumentTemplatePayload);
  //   const buffer = await renderHtmlToPdf(html);
  //
  // and the NotImplementedError below disappears.
  const renderedHtml = typeof req.query.renderedHtml === "string"
    ? req.query.renderedHtml
    : undefined;

  if (!renderedHtml) {
    logger.warn(
      { number, payloadKeys: Object.keys((doc.payload as Record<string, unknown>) ?? {}) },
      "[pdf] no server-side template builder yet — Sprint 4.E pending"
    );
    throw new NotImplementedError(
      "PDF rendering requires Sprint 4.E (shared template module). " +
        "Pass `?renderedHtml=<encoded>` for development testing only."
    );
  }

  if (renderedHtml.length > 2_000_000) {
    // Cap absurdly-large HTML payloads so a bug somewhere doesn't
    // OOM the renderer. The largest realistic offer + agreement
    // bundle is ~80kb; 2MB leaves 25× headroom.
    throw new ValidationError(
      [{ path: ["renderedHtml"], message: "rendered HTML exceeds 2MB cap" }],
      "Render input too large"
    );
  }

  const buffer = await renderHtmlToPdf(renderedHtml);

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

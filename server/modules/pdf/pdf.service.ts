/**
 * PDF render service.
 *
 * `renderDocumentPdf(html)` takes the HTML body produced by the
 * frontend's `buildOfferPdfHtml` (later: also agreement / msa
 * variants) and streams a PDF buffer.
 *
 * Stream-only — the Buffer flows from Puppeteer → service caller →
 * HTTP response without ever touching the filesystem or a cache.
 * A future "preview" feature could memoize per-document; until then,
 * each request renders fresh (acceptable because the same document
 * can't change once saved — caching is a UX optimisation, not a
 * correctness requirement).
 *
 * Wrapped with a hard timeout (`PDF_RENDER_TIMEOUT_MS`, default 30s)
 * so a stuck Chromium can't hang the request indefinitely.
 */

import { env } from "../../config/env";
import { logger } from "../../middleware/logger";
import { InternalError } from "../../shared/errors";
import { acquireBrowser } from "./browser-pool";

export interface RenderPdfOptions {
  /**
   * Custom timeout override. Defaults to env.PDF_RENDER_TIMEOUT_MS.
   * The pdf controller doesn't expose this — it's wired for future
   * batch/export jobs that may need longer ceilings.
   */
  timeoutMs?: number;
}

export async function renderHtmlToPdf(
  fullHtml: string,
  options: RenderPdfOptions = {}
): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? env.PDF_RENDER_TIMEOUT_MS;

  const browser = await acquireBrowser();
  const page = await browser.newPage();
  try {
    // Use a fixed viewport so layout is deterministic — print
    // stylesheet decides page size separately.
    await page.setViewport({ width: 1200, height: 1600 });
    // `waitUntil: networkidle0` is overkill for our HTML which has
    // no remote assets (CSS is inline). `domcontentloaded` is the
    // cheapest reliable signal that the DOM is ready for layout.
    await page.setContent(fullHtml, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs
    });
    // Emulate `media: print` so any `@media print` rules in the
    // template take effect during PDF generation.
    await page.emulateMediaType("print");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      timeout: timeoutMs,
      margin: { top: "12mm", bottom: "16mm", left: "12mm", right: "12mm" }
    });

    // page.pdf() returns Uint8Array in newer puppeteer types; Buffer
    // is the Node.js subclass — coerce explicitly for the stream.
    return Buffer.from(pdf);
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      "[pdf] render failed"
    );
    throw new InternalError(`PDF render failed: ${(err as Error).message}`);
  } finally {
    // Closing the page releases its tab in the shared browser. We
    // do NOT close the browser — that's what the pool is for.
    await page.close().catch(() => {
      // Page might already be detached if the parent browser crashed;
      // swallow the secondary error so the original is what propagates.
    });
  }
}

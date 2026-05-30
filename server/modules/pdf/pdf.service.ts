/**
 * PDF render service.
 *
 * The running footer (disclaimer + CONFIDENTIAL + BSG number +
 * Page X of Y) is rendered via Puppeteer's `footerTemplate`, not a
 * <tfoot> in the document body. A <tfoot> footer DOES repeat on
 * each page but Chrome places it flush against the last content
 * block — leaving an empty gap below it on short pages. The
 * footer template lives in the @page bottom margin, so it's
 * anchored to the page bottom regardless of how much content is
 * on the page.
 *
 * Wrapped with a hard timeout (`PDF_RENDER_TIMEOUT_MS`, default 30s)
 * so a stuck Chromium can't hang the request indefinitely.
 */

import { env } from "../../config/env";
import { logger } from "../../middleware/logger";
import { InternalError } from "../../shared/errors";
import { escapeHtml } from "../../shared/html";
import { acquireBrowser } from "./browser-pool";

export interface RenderPdfOptions {
  /**
   * Custom timeout override. Defaults to env.PDF_RENDER_TIMEOUT_MS.
   */
  timeoutMs?: number;
  /**
   * Document number rendered in the centre cell of the running
   * footer (e.g. "BSG-7100007-001"). Optional — preview renders
   * before a number is assigned pass an empty string / undefined.
   */
  documentNumber?: string;
}

const FOOTER_DISCLAIMER =
  "This document contains proprietary and/or commercially sensitive pricing information, and is protected from disclosure. If the reader of this document is not the intended recipient, or an employee, or an agent, or a party responsible for delivering this message to the intended recipient, you are hereby notified that any dissemination, distribution or copying of this document or part of it is strictly prohibited. If you have received this document in error, please notify the sender by replying to the message including this document and deleting this from your storage.";

// Horizontal inset for the running header + footer templates. MUST
// match the body's left/right page margin so the bar / disclaimer line
// up with the content column. The body uses CSS `@page { margin: 2cm }`
// (= 20mm) which wins under preferCSSPageSize:true — verified by
// measuring rendered word bounding boxes (body content xMin = 20mm).
// Keep in sync with OFFER_REFERENCE_TOKENS.pageMarginCm (2.0).
const PAGE_SIDE_MARGIN = "20mm";

// Accent colour of the running header bar — mirrors the offer's
// `--accent` token (tokens.ts colorAccent). Hardcoded because the
// template renders outside the document's <style> scope.
const ACCENT = "#4f46e5";

function buildHeaderTemplate(): string {
  // Running header: a thin accent bar repeated at the top of every
  // page, matching the reference document. Lives in the @page top
  // margin band so it never affects content flow or page-break math.
  // Rendered as a `border-top` (not background) because Puppeteer
  // header/footer templates reliably paint borders but can drop
  // background-color. margin-top positions the bar ~10mm down the
  // 20mm top band, leaving breathing room above and below.
  return `<div style="width:100%;padding:0 ${PAGE_SIDE_MARGIN};box-sizing:border-box;margin:0;">
    <div style="margin-top:10mm;border-top:4px solid ${ACCENT};font-size:0;line-height:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;"></div>
  </div>`;
}

function buildFooterTemplate(documentNumber: string): string {
  // Puppeteer renders the footer template in an isolated context that
  // does NOT share the main document's <style>. Default font-size is
  // 0 (Chromium quirk) — every text element must set its own size.
  // Fonts trimmed 2026-05-30 (disclaimer 7.6→7pt, meta 8→7pt) so the
  // whole footer fits a SHORTER bottom margin (26mm, see page.pdf
  // below) — that reclaims ~4mm of content area on EVERY page so
  // section 1's custom note stays on page 1. It's fine print, so the
  // smaller size is invisible in practice.
  const docCell = documentNumber
    ? `<td style="text-align:center;color:#6b7280;padding:0;font-size:7pt;">${escapeHtml(documentNumber)}</td>`
    : `<td style="padding:0;"></td>`;
  return `<div style="width:100%;padding:0 ${PAGE_SIDE_MARGIN};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:#6b7280;">
    <p style="margin:0;padding-top:5pt;border-top:1px solid #d7dce8;font-size:7pt;line-height:1.25;">${FOOTER_DISCLAIMER}</p>
    <table style="width:100%;margin-top:3pt;border-collapse:collapse;">
      <tr>
        <td style="text-align:left;color:${ACCENT};font-weight:700;padding:0;font-size:7pt;">CONFIDENTIAL</td>
        ${docCell}
        <td style="text-align:right;color:#6b7280;font-size:7pt;padding:0;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></td>
      </tr>
    </table>
  </div>`;
}

export async function renderHtmlToPdf(
  fullHtml: string,
  options: RenderPdfOptions = {}
): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? env.PDF_RENDER_TIMEOUT_MS;

  const browser = await acquireBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 1600 });
    await page.setContent(fullHtml, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs
    });
    await page.emulateMediaType("print");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      timeout: timeoutMs,
      displayHeaderFooter: true,
      headerTemplate: buildHeaderTemplate(),
      footerTemplate: buildFooterTemplate(options.documentNumber ?? ""),
      // Margins kept in sync with the CSS @page rule (styles.ts). Under
      // preferCSSPageSize:true the CSS margins win for body layout; these
      // also define the header (top) / footer (bottom) template bands.
      margin: { top: "20mm", bottom: "26mm", left: PAGE_SIDE_MARGIN, right: PAGE_SIDE_MARGIN }
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

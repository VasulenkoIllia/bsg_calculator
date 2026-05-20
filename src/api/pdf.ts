/**
 * PDF endpoint wrappers — both render paths share the same Puppeteer
 * pipeline on the backend (Sprint 6.0):
 *
 *   - `downloadSavedPdf(number)` — GET /api/v1/documents/:number/pdf,
 *     used by /documents/:number view's "Download PDF" button.
 *   - `renderPdfPreview(payload)` — POST /api/v1/pdf/preview,
 *     used by the wizard's "Generate PDF" button. The payload is the
 *     in-progress wizard draft, NOT a saved document, so there's no
 *     :number to embed in the URL.
 *
 * Both functions return a Blob suitable for hidden-anchor download.
 * The download UX (filename, anchor click, revokeObjectURL) lives at
 * the call site so the same helper can be reused for in-tab inline
 * preview later.
 */

import type { DocumentTemplatePayload } from "../components/document-wizard/types.js";
import { apiClient } from "./client.js";

/**
 * GET /api/v1/documents/:number/pdf?download=true
 * Returns the PDF as a Blob.
 */
export async function downloadSavedPdf(number: string): Promise<Blob> {
  const res = await apiClient.get<ArrayBuffer>(
    `/documents/${encodeURIComponent(number)}/pdf?download=true`,
    { responseType: "arraybuffer" }
  );
  return new Blob([res.data], { type: "application/pdf" });
}

/**
 * POST /api/v1/pdf/preview — render the wizard draft via the same
 * Puppeteer pipeline the saved-document download uses. Returns a
 * Blob suitable for `URL.createObjectURL` + hidden-anchor download.
 *
 * Throws ApiError (the standard envelope) on 400 (malformed payload)
 * or 500 (Puppeteer crashed). Caller surfaces the error via toast
 * or inline alert.
 */
export async function renderPdfPreview(
  payload: DocumentTemplatePayload
): Promise<Blob> {
  const res = await apiClient.post<ArrayBuffer>(
    "/pdf/preview",
    { payload },
    { responseType: "arraybuffer" }
  );
  return new Blob([res.data], { type: "application/pdf" });
}

/**
 * Trigger a browser download for a PDF Blob via a hidden anchor.
 * Revokes the Blob URL on the next tick so it doesn't leak.
 * Caller chooses the filename (e.g. `BSG-7100001-874808.pdf` for a
 * saved document, `preview.pdf` for an in-progress draft).
 */
export function triggerPdfDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Defer revoke so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import { escapeHtml } from "../../../calculator/formatUtils.js";

export function renderFooter(documentNumber: string): string {
  return `<footer class="print-footer"><p>This document contains proprietary and/or commercially sensitive pricing information, and is protected from disclosure. If the reader of this document is not the intended recipient, or an employee, or an agent, or a party responsible for delivering this message to the intended recipient, you are hereby notified that any dissemination, distribution or copying of this document or part of it is strictly prohibited. If you have received this document in error, please notify the sender by replying to the message including this document and deleting this from your storage.</p><div class="footer-meta"><span>CONFIDENTIAL</span><span>Page <span class="page-number"></span> of <span class="page-total"></span></span><span>${escapeHtml(
    documentNumber
  )}</span></div></footer>`;
}

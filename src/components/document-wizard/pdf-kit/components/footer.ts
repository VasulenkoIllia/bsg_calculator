import { escapeHtml } from "../../../calculator/formatUtils.js";

// The page counter ("Page X of Y") is rendered via @page margin boxes
// (see styles.ts → @page { @bottom-right }). Chrome's print engine has a
// long-standing bug where counter(page)/counter(pages) inside elements
// nested in <table><tfoot> evaluate to 0 — so we cannot put the counter
// inline with the rest of the meta line. Instead, the page number lives
// in the @page margin area below the disclaimer.
export function renderFooter(documentNumber: string): string {
  return `<footer class="print-footer"><p>This document contains proprietary and/or commercially sensitive pricing information, and is protected from disclosure. If the reader of this document is not the intended recipient, or an employee, or an agent, or a party responsible for delivering this message to the intended recipient, you are hereby notified that any dissemination, distribution or copying of this document or part of it is strictly prohibited. If you have received this document in error, please notify the sender by replying to the message including this document and deleting this from your storage.</p><div class="footer-meta"><span>CONFIDENTIAL</span><span>${escapeHtml(
    documentNumber
  )}</span></div></footer>`;
}

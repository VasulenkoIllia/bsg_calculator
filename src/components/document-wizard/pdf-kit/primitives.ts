import { escapeHtml } from "../../calculator/formatUtils.js";
import type { PdfUiKitTokens } from "./tokens.js";

export interface MetaItem {
  label: string;
  value: string;
}

export interface FeeCardItem {
  title: string;
  value: string;
  subtitle: string;
}

export interface TermsGridItem {
  label: string;
  value: string;
}

export function renderMetaItem(item: MetaItem): string {
  return `<div class="meta-item"><span class="meta-label">${escapeHtml(item.label)}</span><span class="meta-value">${escapeHtml(
    item.value
  )}</span></div>`;
}

export function renderSectionHeader(index: number, title: string, badge: string): string {
  return `<div class="section-header"><div class="section-title-wrap"><span class="section-index">${index}</span><h2>${escapeHtml(
    title
  )}</h2></div><span class="section-badge">${escapeHtml(badge)}</span></div>`;
}

export function renderFeesGrid(items: FeeCardItem[]): string {
  return `<div class="fees-grid">${items
    .map(
      card => `<article class="fee-card"><h3>${escapeHtml(card.title)}</h3><p class="fee-value">${escapeHtml(
        card.value
      )}</p><p class="fee-subtitle">${escapeHtml(card.subtitle)}</p></article>`
    )
    .join("")}</div>`;
}

export function renderTermsGrid(items: TermsGridItem[]): string {
  const rows: string[] = [];
  for (let index = 0; index < items.length; index += 2) {
    const left = items[index];
    const right = items[index + 1];

    rows.push(`<div class="terms-row"><div class="terms-item"><span class="terms-label">${escapeHtml(
      left.label
    )}</span><span class="terms-value">${escapeHtml(left.value)}</span></div>${
      right
        ? `<div class="terms-item"><span class="terms-label">${escapeHtml(right.label)}</span><span class="terms-value">${escapeHtml(
            right.value
          )}</span></div>`
        : '<div class="terms-item terms-item-empty"></div>'
    }</div>`);
  }

  return `<div class="terms-grid">${rows.join("")}</div>`;
}

export function renderFooter(documentNumber: string): string {
  return `<footer class="print-footer"><p>This document contains proprietary and/or commercially sensitive pricing information, and is protected from disclosure. If the reader of this document is not the intended recipient, or an employee, or an agent, or a party responsible for delivering this message to the intended recipient, you are hereby notified that any dissemination, distribution or copying of this document or part of it is strictly prohibited. If you have received this document in error, please notify the sender by replying to the message including this document and deleting this from your storage.</p><div class="footer-meta"><span>CONFIDENTIAL</span><span>Page <span class="page-number"></span> of <span class="page-total"></span></span><span>${escapeHtml(
    documentNumber
  )}</span></div></footer>`;
}

export function buildPdfUiKitStyles(tokens: PdfUiKitTokens): string {
  return `
@page {
  size: A4;
  margin: ${tokens.pageMarginCm}cm;
}

:root {
  color-scheme: light;
  --accent: ${tokens.colorAccent};
  --accent-soft: ${tokens.colorAccentSoft};
  --accent-surface: ${tokens.colorAccentSurface};
  --text-primary: ${tokens.colorTextPrimary};
  --text-muted: ${tokens.colorTextMuted};
  --text-light: ${tokens.colorTextLight};
  --border: ${tokens.colorBorder};
  --table-header-bg: ${tokens.colorTableHeaderBg};
  --table-header-text: ${tokens.colorTableHeaderText};
  --table-alt: ${tokens.colorTableAltRow};
  --paper: ${tokens.colorPaper};
  --screen-bg: ${tokens.colorScreenBackground};
}

* { box-sizing: border-box; }

body {
  margin: 0;
  color: var(--text-primary);
  background: var(--paper);
  font-family: ${tokens.fontFamily};
  font-size: 10pt;
  line-height: 1.35;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.sheet {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding-bottom: 2.8cm;
}

.offer-header { padding-bottom: 12px; }
.offer-top-line {
  height: 6px;
  width: 100%;
  background: var(--accent);
  margin-bottom: 14px;
}

.offer-eyebrow {
  margin: 0;
  font-size: 11pt;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.02em;
}

.offer-title {
  margin: 10px 0 0;
  font-size: 76px;
  line-height: 0.96;
  font-weight: 700;
  color: var(--text-primary);
}

.offer-title .accent { color: var(--accent); }

.offer-subtitle {
  margin: 12px 0 0;
  font-size: 22px;
  color: var(--text-muted);
}

.meta-grid {
  margin: 14px 0 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  border: 1px solid var(--border);
}

.meta-item {
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 10px 12px;
  min-height: 76px;
  background: var(--paper);
}

.meta-item:nth-child(3n) { border-right: 0; }
.meta-item:nth-last-child(-n + 2) { border-bottom: 0; }

.meta-label {
  display: block;
  margin: 0;
  font-size: 9pt;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-light);
}

.meta-value {
  display: block;
  margin: 6px 0 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.meta-note {
  margin: 14px 0 0;
  background: #f5f6fb;
  border-left: 4px solid var(--accent);
  color: var(--text-muted);
  padding: 8px 10px;
  font-size: 15px;
}

.offer-section { margin-top: 20px; }

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.section-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: ${tokens.radiusS};
  background: var(--accent);
  color: #ffffff;
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
}

.section-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-weight: 700;
  font-size: 49px;
  line-height: 1.1;
}

.section-badge {
  border: 1px solid var(--accent-soft);
  color: var(--accent);
  background: var(--accent-surface);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 8px 14px;
  border-radius: ${tokens.radiusS};
  text-transform: uppercase;
}

table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--border);
  table-layout: fixed;
}

th,
td {
  border: 1px solid var(--border);
  padding: 8px;
  vertical-align: top;
  word-wrap: break-word;
  font-size: 16px;
}

th {
  background: var(--table-header-bg);
  color: var(--table-header-text);
  font-weight: 700;
  font-size: 15px;
  line-height: 1.1;
  text-align: left;
  text-transform: uppercase;
}

tbody tr:nth-child(even) {
  background: var(--table-alt);
}

.cell-line { display: block; }
.cell-region { font-weight: 700; }
.accent-text { color: var(--accent); font-weight: 700; }

.fees-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.fee-card {
  border: 1px solid var(--border);
  padding: 10px;
  min-height: 100px;
  background: var(--paper);
}

.fee-card h3 {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.05em;
  font-weight: 700;
  color: var(--text-light);
}

.fee-value {
  margin: 8px 0 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.fee-subtitle {
  margin: 5px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.terms-grid {
  border: 1px solid var(--border);
  border-bottom: 0;
}

.terms-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.terms-item {
  padding: 9px 10px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  min-height: 58px;
  background: var(--paper);
}

.terms-item:nth-child(2n) { border-right: 0; }
.terms-label {
  display: block;
  font-size: 12px;
  color: var(--text-light);
  margin-bottom: 4px;
}

.terms-value {
  display: block;
  font-size: 15px;
  color: var(--text-primary);
  font-weight: 700;
}

.print-footer {
  position: fixed;
  left: ${tokens.pageMarginCm}cm;
  right: ${tokens.pageMarginCm}cm;
  bottom: 0.85cm;
  font-size: 7.6pt;
  color: var(--text-muted);
}

.print-footer p {
  margin: 0;
  line-height: 1.3;
  border-top: 1px solid var(--border);
  padding-top: 6px;
}

.footer-meta {
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  font-size: 8pt;
  color: var(--text-muted);
}

.page-number::before { content: counter(page); }
.page-total::before { content: counter(pages); }

.kit-panel {
  margin-top: 18px;
  border: 1px solid var(--border);
  background: var(--paper);
  border-radius: ${tokens.radiusM};
  padding: 12px;
}

.kit-panel h3 {
  margin: 0 0 8px;
  font-size: 16px;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.swatch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: ${tokens.radiusS};
  padding: 4px 8px;
  font-size: 12px;
}

.swatch-chip {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  border: 1px solid rgba(15, 23, 42, 0.2);
}

@media screen {
  body {
    background: var(--screen-bg);
    padding: 16px;
  }

  .sheet {
    background: var(--paper);
    max-width: 1000px;
    margin: 0 auto;
    border: 1px solid var(--border);
    box-shadow: ${tokens.shadowPaper};
    padding: 20px;
  }

  .offer-title { font-size: 66px; }
  .offer-subtitle { font-size: 17px; }
  .section-index { width: 32px; height: 32px; font-size: 30px; }
  .section-header h2 { font-size: 45px; }
  th, td { font-size: 13px; }
  .meta-value { font-size: 34px; }

  .print-footer {
    position: static;
    margin-top: 16px;
  }

  .footer-meta {
    justify-content: flex-start;
    gap: 16px;
  }

  .page-number::before,
  .page-total::before {
    content: "-";
  }
}

@media print {
  .sheet { padding: 0; }
  .kit-panel { display: none; }
}
`;
}

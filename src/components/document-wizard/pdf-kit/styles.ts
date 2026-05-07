import type { PdfUiKitTokens } from "./tokens.js";

export function buildPdfUiKitStyles(tokens: PdfUiKitTokens): string {
  return `
@page {
  size: A4;
  margin: ${tokens.pageMarginCm}cm;

  /* Page number lives in the @page bottom-right margin box because
   * counter(page) / counter(pages) inside <table><tfoot> evaluates to
   * 0 in Chrome (long-standing Chromium bug 678485). The margin box
   * is the reliable cross-version place for paged-media counters. */
  @bottom-right {
    content: "Page " counter(page) " of " counter(pages);
    font-size: 7.5pt;
    color: #6b7280;
    padding-top: 6pt;
  }
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
  /* Label colour applied to small uppercase column / card / meta
   * labels (REGION, METHODS, REFUND, DOCUMENT NUMBER …). Matches
   * tier-color-1 (#2358EA) so headings and the first tier read in
   * the same blue shade. */
  --label-color: #2358EA;
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

/* Page layout table. Wraps all content so the disclaimer footer in
 * <tfoot> is repeated on every printed page by Chrome's print engine,
 * which also reserves vertical space for it on each page (preventing
 * the overlap that position: fixed footers cause). */
table.page-layout {
  width: 100%;
  border-collapse: collapse;
  border: 0;
}

table.page-layout > tbody > tr > td.page-content-cell,
table.page-layout > tfoot > tr > td.page-footer-cell {
  padding: 0;
  border: 0;
  vertical-align: top;
}

table.page-layout > tfoot > tr > td.page-footer-cell {
  /* Ensure tfoot is treated as a running footer rather than placed at
   * the end of the table only. Chrome respects table-footer-group. */
  display: table-cell;
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
  margin: 8px 0 0;
  font-size: 36pt;
  line-height: 1;
  font-weight: 700;
  color: var(--text-primary);
}

.offer-title .accent { color: var(--accent); }

.offer-subtitle {
  margin: 10px 0 0;
  font-size: 10pt;
  line-height: 1.4;
  color: var(--text-muted);
}

.meta-grid {
  margin: 14px 0 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  /* Only top + left container borders. Right and bottom outer edges
   * are provided by item borders, so an empty trailing cell (e.g. the
   * 6th slot when there are 5 items) is invisible — the item before
   * it draws its own right edge and the row below it just doesn't
   * exist. */
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
}

.meta-item {
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 8px 10px;
  min-height: 56px;
  background: var(--paper);
}


.meta-label {
  display: block;
  margin: 0;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--label-color);
}

.meta-value {
  display: block;
  margin: 4px 0 0;
  font-size: 11pt;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.25;
}

.meta-note {
  margin: 10px 0 0;
  background: #f5f6fb;
  border-left: 3px solid var(--accent);
  color: var(--text-muted);
  padding: 6px 8px;
  font-size: 8pt;
  line-height: 1.4;
}

.offer-section {
  margin-top: 20px;
  /* Keep each numbered pricing block intact across page breaks; push
   * whole sections to the next page rather than splitting them. */
  page-break-inside: avoid;
  break-inside: avoid;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
  page-break-after: avoid;
  break-after: avoid;
}

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.section-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: ${tokens.radiusS};
  background: var(--accent);
  color: #ffffff;
  font-size: 11pt;
  font-weight: 700;
  line-height: 1;
}

.section-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-weight: 700;
  font-size: 14pt;
  line-height: 1.15;
}

.section-badge {
  border: 1px solid var(--accent-soft);
  color: var(--accent);
  background: var(--accent-surface);
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 4px 9px;
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
  padding: 5px 7px;
  vertical-align: top;
  word-wrap: break-word;
  font-size: 9pt;
  line-height: 1.3;
}

/* Keep individual data-table rows (Card Acquiring / Pay Out) intact
 * across page breaks. Excludes the page-layout wrapper table — that
 * table MUST be allowed to break across pages so its tfoot can repeat
 * the per-page footer. */
table:not(.page-layout) tr {
  page-break-inside: avoid;
  break-inside: avoid;
}

th {
  background: var(--table-header-bg);
  color: var(--label-color);
  font-weight: 700;
  font-size: 7pt;
  line-height: 1.15;
  /* Headers are centered horizontally and pinned to the top so wrapped
   * multi-line labels still align with neighbouring single-line ones. */
  text-align: center;
  vertical-align: top;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

/* Body cells: left-aligned with a noticeable left indent so values do
 * not hug the cell edge. All cells share the same indent so values
 * line up vertically across rows. */
td {
  text-align: left;
  padding-left: 14px;
}

tbody tr:nth-child(even) {
  background: var(--table-alt);
}

.cell-line { display: block; }
.cell-region { font-weight: 700; }
.accent-text { color: var(--accent); font-weight: 700; }

/* Inactive / "N/A" values rendered in muted gray to visually
 * distinguish them from numeric fees (which are accent-coloured). */
.value-na { color: var(--text-muted); font-weight: 400; }

/* Per-tier colours used in tiered pricing tables. Each tier row gets
 * its own shade for the tier label, model name and trx-fee values so
 * scanning across rows is easier. MDR percent stays in default body
 * colour on every tier (so percentages read as plain dark text).
 *
 * tier-color-1 #2358EA (blue) → tier 0 (e.g. "Up to €0.1M")
 * tier-color-2 #3F38E3 (blue-purple) → tier 1
 * tier-color-3 #7D2AEB (purple) → tier 2 (e.g. "Above ...M") */
.tier-color-1 { color: #2358EA; font-weight: 700; }
.tier-color-2 { color: #3F38E3; font-weight: 700; }
.tier-color-3 { color: #7D2AEB; font-weight: 700; }

/* Secondary / subtitle line inside a cell (APM brand list under the
 * primary methods line, "All Visa & Mastercard" sub-text in payout,
 * etc.) rendered in muted light gray so the primary line stays
 * prominent. Matches the design token --text-light (#9ca3af). */
.cell-subtitle { color: var(--text-light); }

/* Card Acquiring (payin) table column widths.
 * Numbers sum to 100% when all six columns are shown; when optional
 * columns are hidden the browser scales the remaining ones
 * proportionally because table-layout fixed is set on the table.
 * Compact columns (region/currency/mdr) are ~25% narrower than the
 * default equal split so METHODS can grow to fit two-line wrapped
 * values without breaking awkwardly. */
.col-region   { width: 11%; }
.col-methods  { width: 25%; }
.col-currency { width: 11%; }
.col-tier     { width: 13%; }
.col-mdr      { width: 12%; }
.col-trxfee   { width: 17%; }
.col-minfee   { width: 22%; }

.fees-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.fee-card {
  border: 1px solid var(--border);
  padding: 8px 10px;
  min-height: 64px;
  background: var(--paper);
  page-break-inside: avoid;
  break-inside: avoid;
}

.fee-card h3 {
  margin: 0;
  font-size: 7pt;
  letter-spacing: 0.05em;
  font-weight: 700;
  color: var(--label-color);
  text-transform: uppercase;
}

.fee-value {
  margin: 4px 0 0;
  font-size: 14pt;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.15;
}

.fee-subtitle {
  margin: 3px 0 0;
  font-size: 7.5pt;
  color: var(--text-muted);
  line-height: 1.3;
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
  padding: 6px 9px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  min-height: 38px;
  background: var(--paper);
  page-break-inside: avoid;
  break-inside: avoid;
}

.terms-item:nth-child(2n) { border-right: 0; }
.terms-label {
  display: block;
  font-size: 7.5pt;
  color: var(--label-color);
  margin-bottom: 2px;
}

.terms-value {
  display: block;
  font-size: 9.5pt;
  color: var(--text-primary);
  font-weight: 700;
  line-height: 1.25;
}

.print-footer {
  /* Lives inside table.page-layout > tfoot so Chrome repeats it on every
   * printed page. No position: fixed — that approach overlapped content
   * because fixed elements do not reserve flow space. */
  font-size: 7.6pt;
  color: var(--text-muted);
  padding-top: 8pt;
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
    margin-top: 16px;
  }

  .footer-meta {
    justify-content: flex-start;
    gap: 16px;
  }
}

/* AGREEMENT (long-form) typography and layout */
.agreement-body { margin-top: 24px; }

.agreement-section {
  margin-top: 18px;
  /* page-break-inside avoid removed: long MSA sections were forcing
   * full-section pushes and leaving blank gaps. Heading orphans still
   * prevented by page-break-after avoid on h2/h3 in print rules. */
}

/* AGREEMENT typography mirrors the DRAFT TEXT.docx template: plain bold black
 * uppercase main headings, standalone uppercase Dispute-Resolution subheadings,
 * inline bold leads for Payment subsections, justified body, bulleted lists. */
.agreement-h2 {
  margin: 14px 0 8px;
  font-size: 10.5pt;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0;
  text-transform: uppercase;
}

.agreement-section:first-child .agreement-h2 {
  margin-top: 0;
}

.agreement-h3 {
  margin: 12px 0 6px;
  font-size: 10.5pt;
  font-weight: 700;
  color: var(--text-primary);
  text-transform: uppercase;
}

.agreement-p {
  margin: 0 0 8px;
  font-size: 9.5pt;
  line-height: 1.4;
  color: var(--text-primary);
  text-align: justify;
}

.agreement-p.agreement-p-bold {
  font-weight: 700;
}

.agreement-p .agreement-lead {
  font-weight: 700;
}

.agreement-list {
  margin: 0 0 8px;
  padding-left: 20px;
  list-style: disc;
}

.agreement-list > li {
  font-size: 9.5pt;
  line-height: 1.4;
  margin-bottom: 4px;
  color: var(--text-primary);
  text-align: justify;
}

.agreement-sublist {
  margin: 4px 0 0;
  padding-left: 18px;
  list-style: circle;
}

.agreement-sublist > li {
  margin-bottom: 2px;
}

.signature-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  page-break-inside: avoid;
}

.signature-panel {
  border: 1px solid var(--border);
  background: var(--paper);
  padding: 12px;
  min-height: 160px;
  page-break-inside: avoid;
  break-inside: avoid;
}

.signature-name {
  margin: 0 0 8px;
  font-size: 9.5pt;
  font-weight: 700;
  color: var(--text-primary);
}

.signature-line {
  margin: 3px 0;
  font-size: 8pt;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}

.signature-label {
  flex-shrink: 0;
  font-weight: 600;
}

.signature-blank {
  flex: 1;
  font-family: monospace;
  letter-spacing: 0;
  color: var(--text-light);
}

/* Variable highlighting in agreement preview.
 * Print stylesheet strips highlighting so generated PDF stays clean. */
.var-substituted {
  display: inline;
  border-radius: 2px;
  padding: 0 2px;
}

@media screen {
  body.highlight-variables .var-substituted.var-filled {
    background: #fef08a;
    box-shadow: inset 0 -1px 0 #ca8a04;
  }
  body.highlight-variables .var-substituted.var-default {
    background: #e0e7ff;
    box-shadow: inset 0 -1px 0 #6366f1;
  }
  body.highlight-variables .var-substituted.var-placeholder {
    background: #fed7aa;
    color: #9a3412;
    box-shadow: inset 0 -1px 0 #ea580c;
    font-style: italic;
  }
}

@media print {
  .var-substituted {
    background: transparent !important;
    box-shadow: none !important;
    color: inherit !important;
    font-style: inherit !important;
    padding: 0 !important;
  }

  .agreement-h2 { page-break-after: avoid; }
  .agreement-h3 { page-break-after: avoid; }

  /* In bundled offer+agreement PDFs the MSA must start on a fresh page so
   * the offer pricing schedule has its own footer at the end of the
   * offer pages, and the agreement body has its own ending block. */
  .agreement-body {
    page-break-before: always;
    break-before: page;
  }

  .sheet { padding: 0; }
  .kit-panel { display: none; }

  /* The footer lives in table.page-layout > tfoot so Chrome's print
   * engine repeats it on every printed page and reserves flow space
   * for it (no overlap with content). */
  .print-footer {
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
`;
}

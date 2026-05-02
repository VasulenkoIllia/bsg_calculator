import type { PdfUiKitTokens } from "./tokens.js";

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

/* AGREEMENT (long-form) typography and layout */
.agreement-body { margin-top: 24px; }

.agreement-section {
  margin-top: 18px;
  page-break-inside: avoid;
}

.agreement-h2 {
  margin: 0 0 8px;
  font-size: 16pt;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.01em;
}

.agreement-h3 {
  margin: 12px 0 6px;
  font-size: 12pt;
  font-weight: 700;
  color: var(--text-primary);
}

.agreement-p {
  margin: 0 0 8px;
  font-size: 10pt;
  line-height: 1.45;
  color: var(--text-primary);
  text-align: justify;
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
}

.signature-name {
  margin: 0 0 12px;
  font-size: 11pt;
  font-weight: 700;
  color: var(--text-primary);
}

.signature-line {
  margin: 4px 0;
  font-size: 9pt;
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

  .sheet { padding: 0; }
  .kit-panel { display: none; }
}
`;
}

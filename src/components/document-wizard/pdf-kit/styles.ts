import type { PdfUiKitTokens } from "./tokens.js";

export function buildPdfUiKitStyles(tokens: PdfUiKitTokens): string {
  return `
@page {
  size: A4;
  /* Asymmetric bottom margin (26mm) reserves space for the running
   * footer rendered by Puppeteer (pdf.service.ts → footerTemplate).
   * Trimmed 30→26mm on 2026-05-30 after shrinking the footer fine
   * print to 7pt — reclaims ~4mm of content area on every page so
   * section 1's custom note stays on page 1. The @page margin must
   * stay in sync with the 'margin' option passed to page.pdf()
   * (Puppeteer prefers CSS when preferCSSPageSize:true). */
  margin: ${tokens.pageMarginCm}cm ${tokens.pageMarginCm}cm 26mm ${tokens.pageMarginCm}cm;
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
   * labels (REGION, METHODS, REFUND, DOCUMENT NUMBER …). Grey per the
   * reference (2026-05-30, was blue #2358EA) — every table/card/cell
   * header across sections 1 / 1.1 / 2 / 3 / 4 and the cover meta now
   * reads in the same neutral grey, matching --table-header-text. */
  --label-color: #9aa3b5;

  /* ──────────────────────────────────────────────────────────────
   * Spacing scale (2026-05-12).
   *
   * Centralised so the OFFER PDF reads as one coherent layout —
   * every section, grid and cell pulls its padding/gap from these
   * five variables. Calibrated against an A4 page assuming the
   * 2cm @page margin defined above. ONE universal layout — there is
   * no compact override path (the compact preset was removed
   * 2026-05-30; see docs/decisions.md).
   *
   *   --space-section-gap: gap between numbered sections (1 → 3 → 4)
   *   --space-header-gap:  section title → its grid/table
   *                        also used for the per-section custom note
   *   --space-grid-gap:    gap between cards inside .fees-grid /
   *                        between rows in .meta-grid
   *   --space-cell-y/x:    padding inside small label+value cells
   *                        (.meta-item, .terms-item)
   *   --space-card-y/x:    padding inside big-value fee cards
   *                        (.fee-card)
   * ──────────────────────────────────────────────────────────── */
  /* Standardised vertical rhythm (2026-05-30). TWO gap tokens drive
   * the whole document so spacing reads identically on every page:
   *   --space-section-gap = the LARGE gap before each numbered section
   *     heading (1 / 1.1 / 2 / 3 / 4) AND cover → section 1. Repeats on
   *     every page → consistent rhythm. Set to 6mm: 10mm (the original
   *     spec value) made page 1 so tall that section 1's custom note
   *     was pushed onto page 2 — the reference keeps that note with
   *     section 1 before the footer, so we trade a little air for the
   *     same fit.
   *   --space-header-gap = the SMALL gap used everywhere else: section
   *     heading → its table/cards, table → custom note, and every
   *     cover sub-block (eyebrow → title → subtitle → meta → note).
   * No other ad-hoc vertical margins — same transition type, same gap.
   * header-gap was raised 8px → 11px and section-gap 6mm → 8mm on
   * 2026-05-30: removing the DOCUMENT NUMBER/DATE row from the cover
   * meta-grid freed ~64px, redistributed proportionally into these
   * gaps so the cover + sections breathe WITHOUT adding net height
   * (page counts unchanged — verified against the heaviest configs).
   * 2026-06-04: 8mm to 9mm — section custom notes are now input-capped to
   * ~2-3 lines, reclaiming height to widen inter-section breathing room
   * (page counts re-verified via the visual-diff harness). */
  --space-section-gap: 9mm;
  --space-header-gap: 11px;
  --space-grid-gap: 12px;
  --space-cell-y: 8px;
  --space-cell-x: 11px;
  --space-card-y: 10px;
  --space-card-x: 12px;
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

/* Page layout table. Wraps all content so that per-row
 * 'force-page-break-before' gives Chrome a clean break point between
 * top-level blocks. The running footer is NOT in <tfoot> here — it
 * lives in Puppeteer's footerTemplate (see pdf.service.ts) so it sits
 * at the page bottom instead of flush against the last content row. */
table.page-layout {
  width: 100%;
  border-collapse: collapse;
  border: 0;
}

table.page-layout > tbody > tr > td.page-content-cell {
  padding: 0;
  border: 0;
  vertical-align: top;
}

/* Forces the matching <tr> to start on a new printed page. Applied
 * to section-2 (Pay Out) when section-1 (Card Acquiring) is heavy
 * (tiered + both regions = 6 rows), so layout reads as:
 *   page 1 → header + section 1 + payin custom note
 *   page 2 → section 2 + payout custom note + section 3 + section 4
 * When section 1 is light (non-tiered) the orchestrator does not add
 * this class and sections 1 + 2 share page 1 naturally. */
table.page-layout > tbody > tr.force-page-break-before {
  page-break-before: always;
  break-before: page;
}

.sheet {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
}

/* No bottom padding — the gap from the cover to section 1 is owned
 * entirely by section 1's --space-section-gap (10mm), so it equals
 * every other section-to-section gap. */
.offer-header { padding-bottom: 0; }
.offer-top-line {
  height: 4px;
  width: 100%;
  background: var(--accent);
  margin-bottom: 8px;
}

.offer-eyebrow {
  margin: 0;
  font-size: 11pt;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.02em;
}

.offer-title {
  /* Standardised cover gap (eyebrow → title). */
  margin: var(--space-header-gap) 0 0;
  /* Cover headline enlarged 32pt → 50pt (~+56%) to fill the spare
   * vertical room under the cover. line-height:1 keeps the two-line
   * "Service / Agreement" stack tight; the DOCUMENT NUMBER/DATE aside
   * is top-aligned and far narrower than the free horizontal room, so
   * the larger word never collides with it. */
  font-size: 50pt;
  line-height: 1;
  font-weight: 700;
  color: var(--text-primary);
}

.offer-title .accent { color: var(--accent); }

/* Title row: Service / Agreement on the left, DOCUMENT NUMBER + DATE
 * top-right (moved out of the meta-grid 2026-05-30 so the grid is one
 * clean 3-cell row and the cover has more breathing room). */
.offer-title-row {
  margin: var(--space-header-gap) 0 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}
.offer-title-row .offer-title { margin-top: 0; }
.offer-title-aside {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: right;
  padding-top: 6px;
}
/* One NUMBER/DATE pair. The wrapper groups label+value so the
 * .offer-title-aside flex gap (12px) falls BETWEEN pairs, not between a
 * label and its value. */
.title-aside-item {
  display: block;
}
.title-aside-label {
  display: block;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--label-color);
}
.title-aside-value {
  display: block;
  margin: 3px 0 0;
  font-size: 11pt;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.offer-subtitle {
  margin: var(--space-header-gap) 0 0;
  font-size: 10pt;
  line-height: 1.4;
  color: var(--text-muted);
  /* Justified so the cover sub-headline fills the full content width
   * (the trailing short line stays naturally left-aligned). */
  text-align: justify;
}

.meta-grid {
  margin: var(--space-header-gap) 0 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  /* FIXED uniform row height (2026-05-30) — every meta cell is the
   * same height regardless of whether its value is 1 or 2 lines, so
   * the grid always reads as a clean even block. 64px comfortably
   * fits the tallest realistic value (2 lines, e.g. "Daily (unless
   * agreed otherwise)" ≈63px); 1-line cells share the same height. */
  grid-auto-rows: 64px;
  gap: 0;
  /* Only top + left container borders. Right and bottom outer edges
   * are provided by item borders, so any empty trailing cell stays
   * invisible. Common case is 3 items (DOCUMENT TYPE, MODEL,
   * FREQUENCY) filling one full row; if pricing meta is hidden the
   * grid collapses to a single cell and the empties draw nothing. */
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
}

.meta-item {
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  /* Standard small-cell padding — shared with .terms-item below. */
  padding: var(--space-cell-y) var(--space-cell-x);
  min-height: 44px;
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
  margin: 2px 0 0;
  font-size: 10pt;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.meta-note {
  margin: var(--space-header-gap) 0 0;
  background: #f5f6fb;
  border-left: 3px solid var(--accent);
  color: var(--text-muted);
  padding: 5px 8px;
  font-size: 8pt;
  line-height: 1.4;
}

.offer-section {
  margin-top: var(--space-section-gap);
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
  margin-bottom: var(--space-header-gap);
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
  /* min-width keeps single-digit indices at the standard 22px square
   * shape; multi-char indices (e.g. "1.1" for the operator-added
   * sub-section) expand to fit their text via the 6px horizontal
   * padding without breaking layout. */
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
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
  /* Fixed width + no-wrap so EVERY section badge (FIXED RATE / VOLUME
   * TIERED / PER ACTION / GLOBAL) is identical in size and lines up
   * vertically down the right edge of the page. flex:none stops the
   * flex row from squeezing it when the section title is long (which
   * used to wrap "VOLUME TIERED" onto two lines, making it taller). */
  flex: none;
  width: 30mm;
  box-sizing: border-box;
  text-align: center;
  white-space: nowrap;
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
 * table MUST be allowed to break across pages so multi-section
 * documents flow naturally. */
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

/* Body cells: left-aligned with a left indent so values do not hug
 * the cell edge. All cells share the same indent so values line up
 * vertically across rows. Trimmed 14px → 10px on 2026-05-30 to free
 * horizontal room for the full-size METHODS cell (see col widths). */
td {
  text-align: left;
  padding-left: 10px;
}

tbody tr:nth-child(even) {
  background: var(--table-alt);
}

.cell-line { display: block; }
/* Region values render at normal weight in the same muted grey as the
 * column headers (--label-color) so they read as plain labels rather than
 * competing with the numeric pricing. */
.cell-region { font-weight: 400; color: var(--label-color); }
/* The MDR / RATE percentage is the emphasis of the pricing cell: black + bold. */
.cell-rate { font-weight: 700; color: var(--text-primary); }
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
 *
 * The 7 columns sum to EXACTLY 100% so the widths are literal (no
 * proportional re-normalisation to reason about). When optional
 * columns are hidden, table-layout:fixed re-scales the rest.
 *
 * Calibration 2026-05-30 (match reference): the METHODS cell uses
 * EXPLICIT <br> line breaks (see PAYIN_METHODS_CELL in payin.ts), so
 * it is ALWAYS the same 4-line block in every config regardless of
 * column width:
 *     Credit / Debit —
 *     Visa, Mastercard
 *     APM — Apple Pay,
 *     Google Pay
 * The column therefore only needs to be wide enough that the longest
 * single line — "APM — Apple Pay," ≈77pt @9pt (em-dash) — does not
 * wrap further. METHODS at 20% (~95pt) minus the 10px+7px cell
 * padding leaves ~82pt of text width, a comfortable margin. */
.col-region   { width: 11%; }
.col-methods  { width: 20%; }
/* nowrap so the single-word "CURRENCY" header never breaks to a stray
 * "Y" on a second line. Data values (EUR/USD/USDT) are short codes that
 * never wrap, so the whole column reads on one line. */
.col-currency { width: 11%; white-space: nowrap; }
.col-tier     { width: 13.5%; }
.col-mdr      { width: 12.5%; }
.col-trxfee   { width: 16%; }
.col-minfee   { width: 16%; }

.fees-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  /* Connected grid (no gaps) like the reference — the container draws
   * the top + left edges, each card draws its right + bottom edge, so
   * adjacent cells share one hairline border (same technique as
   * .meta-grid). Trailing empty slots in the last row stay invisible. */
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
}

.fee-card {
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  /* Big-value card padding — fee-card holds three lines (label,
   * big numeric value, subtitle) so it gets a slightly larger
   * pad than .meta-item / .terms-item. */
  padding: var(--space-card-y) var(--space-card-x);
  min-height: 68px;
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
  font-size: 18pt;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.15;
}

.fee-subtitle {
  /* Accent (blue) per the reference — the meta line under each fee
   * value reads in the brand colour, not muted grey. */
  margin: 3px 0 0;
  font-size: 7.5pt;
  color: var(--accent);
  line-height: 1.3;
}

/* Pay Out (section 2) — FIXED RATE card row. A single bordered row of
 * big-value cards (region / rate / trx fee / min fee), matching the
 * reference. Rendered ONLY for the non-tiered case; the tiered case
 * keeps the standard table. grid-auto-flow:column lets the card count
 * flex (3 or 4) while every card stays equal width. */
.payout-cards {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
  background: #f5f6fb;
}
.payout-card {
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 10px 12px;
  min-height: 72px;
}
.payout-card-label {
  display: block;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--label-color);
}
.payout-card-value {
  display: block;
  margin: 5px 0 0;
  font-size: 22pt;
  font-weight: 700;
  line-height: 1.05;
  color: var(--accent);
}
.payout-card-sub {
  display: block;
  margin: 4px 0 0;
  font-size: 7.5pt;
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
  /* Shares small-cell padding with .meta-item — both render a
   * single label + single-line value, so they read identically
   * across the document. */
  padding: var(--space-cell-y) var(--space-cell-x);
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  min-height: 42px;
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

/* Colour overrides for Terms & Limitations values. Pricing / built-in
 * "blue" rows render in the purple --accent (reference look — changed
 * from #2358EA on 2026-05-30; the data key stays "blue"). Risk rows use
 * orange; sentinels (N/A / TBD) and notes use black. Custom rows pick
 * one of the three in the wizard. */
.terms-value-blue { color: var(--accent); }
.terms-value-black { color: var(--text-primary); }
.terms-value-orange { color: #DB7712; }

/* Custom term-value text wraps long strings onto the next line so the
 * cell height grows naturally instead of overflowing the column. */
.terms-value-custom {
  white-space: pre-wrap;
  word-break: break-word;
}

/* Free-form note rendered under the payin / payout pricing tables.
 * Lives OUTSIDE the corresponding section so a long note can flow
 * across pages without invalidating the section's avoid-break rule.
 * Renders in muted gray, preserves user line breaks via pre-wrap,
 * and lets very long single-line text wrap on character boundaries. */
.section-custom-note {
  margin: var(--space-header-gap) 0 0;
  color: var(--text-light);
  font-size: 7.5pt;
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
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
    padding: 24px 16px;
  }

  /* Render the document as ONE continuous A4 page so the on-screen
   * preview matches the generated PDF. The multiple .sheet blocks are
   * per-section page-break units for PRINT; on screen they flow inside
   * a single page frame (table.page-layout). The previous per-element
   * font up-scaling (title 66px, h2 45px, meta-value 34px, …) was
   * removed 2026-05-30 — it overflowed the fixed 64px meta-grid rows
   * and skewed proportions; the print pt sizes now drive both. */
  table.page-layout {
    width: 210mm;
    max-width: 100%;
    margin: 0 auto;
    background: var(--paper);
    border: 1px solid var(--border);
    box-shadow: ${tokens.shadowPaper};
    box-sizing: border-box;
  }
  td.page-content-cell {
    padding: 0 20mm;
  }
  .page-layout-body tr:first-child td.page-content-cell {
    padding-top: 16mm;
  }
  .page-layout-body tr:last-child td.page-content-cell {
    padding-bottom: 18mm;
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

  /* The accent bar at the top of the cover is shown ONLY on screen
   * (in the wizard's HTML preview). In the PDF the bar is drawn by
   * Puppeteer's running headerTemplate (pdf.service.ts) on every page,
   * so the in-body copy is hidden here to avoid a doubled bar on
   * page 1. */
  .offer-top-line { display: none; }

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
}
`;
}

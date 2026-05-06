import { escapeHtml } from "../calculator/formatUtils.js";
import { buildPdfUiKitStyles, renderFooter, renderMetaItem, renderSectionHeader } from "./pdf-kit/primitives.js";
import { OFFER_REFERENCE_TOKENS } from "./pdf-kit/tokens.js";

function renderSwatch(label: string, value: string): string {
  return `<span class="swatch"><span class="swatch-chip" style="background:${escapeHtml(value)}"></span>${escapeHtml(
    label
  )}: ${escapeHtml(value)}</span>`;
}

export function buildPdfUiKitHtml(): string {
  const tokens = OFFER_REFERENCE_TOKENS;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BSG PDF UI Kit</title>
  <style>${buildPdfUiKitStyles(tokens)}</style>
</head>
<body>
  <table class="page-layout">
    <tfoot class="page-layout-foot">
      <tr>
        <td class="page-footer-cell">${renderFooter("BSG-UIKIT-REFERENCE")}</td>
      </tr>
    </tfoot>
    <tbody class="page-layout-body">
      <tr>
        <td class="page-content-cell">
  <div class="sheet">
    <header class="offer-header">
      <div class="offer-top-line"></div>
      <p class="offer-eyebrow">CONFIDENTIAL · PAYMENT INFRASTRUCTURE</p>
      <h1 class="offer-title">Service<br/><span class="accent">Agreement</span></h1>
      <p class="offer-subtitle">Card Acquiring, Payout Infrastructure & Settlement Terms — structured for scale-up and enterprise merchants operating globally.</p>
      <div class="meta-grid">
        ${renderMetaItem({ label: "DOCUMENT TYPE", value: "Commercial Pricing Schedule" })}
        ${renderMetaItem({ label: "SETTLEMENT MODEL", value: "IC++ / Interchange Plus" })}
        ${renderMetaItem({ label: "COLLECTION FREQUENCY", value: "Daily (unless agreed otherwise)" })}
        ${renderMetaItem({ label: "DOCUMENT NUMBER", value: "BSG-71001-45678" })}
        ${renderMetaItem({ label: "DOCUMENT DATE", value: "02.05.2026" })}
      </div>
      <p class="meta-note">All fees are collected on a daily basis unless otherwise instructed in writing. Rates are subject to applicable interchange and scheme fees under the IC++ model unless otherwise instructed in writing.</p>
    </header>

    <section class="offer-section">
      ${renderSectionHeader(1, "Card Acquiring — Credit / Debit Cards, APM & E-wallet", "VOLUME TIERED")}
      <table>
        <thead>
          <tr>
            <th>Region</th>
            <th>Methods</th>
            <th>Currency</th>
            <th>Monthly volume tier</th>
            <th>MDR / Rate</th>
            <th>Transaction fee</th>
            <th>Min. transaction fee</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="cell-region">● EU</td>
            <td><span class="cell-line">Credit / Debit — Visa, Mastercard</span><span class="cell-line">APM — Apple Pay, Google Pay</span></td>
            <td>EUR</td>
            <td class="accent-text">Up to €1M</td>
            <td><span class="cell-line accent-text">IC++</span><span class="cell-line">3.00%</span></td>
            <td><span class="cell-line accent-text">C/D: €0.35</span><span class="cell-line accent-text">APM: €0.35</span></td>
            <td>≤2.5M: €1.00 / &gt;2.5M: N/A</td>
          </tr>
          <tr>
            <td class="cell-region">● Global</td>
            <td><span class="cell-line">Credit / Debit — Visa, Mastercard</span><span class="cell-line">APM — Apple Pay, Google Pay</span></td>
            <td>EUR</td>
            <td class="accent-text">€1M – €3M</td>
            <td><span class="cell-line accent-text">IC++</span><span class="cell-line">3.25%</span></td>
            <td><span class="cell-line accent-text">C/D: €0.30</span><span class="cell-line accent-text">APM: €0.35</span></td>
            <td>≤2.5M: €1.00 / &gt;2.5M: N/A</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="offer-section">
      ${renderSectionHeader(3, "Other Services & Fees", "PER ACTION")}
      <div class="fees-grid">
        <article class="fee-card"><h3>ACCOUNT SETUP</h3><p class="fee-value">€1,000</p><p class="fee-subtitle">One-time · EUR</p></article>
        <article class="fee-card"><h3>REFUND</h3><p class="fee-value">€15</p><p class="fee-subtitle">Per action · EUR</p></article>
        <article class="fee-card"><h3>DISPUTE / CHARGEBACK</h3><p class="fee-value">€60</p><p class="fee-subtitle">Per action · EUR</p></article>
      </div>
    </section>

    <section class="offer-section">
      ${renderSectionHeader(4, "Terms & Limitations", "GLOBAL")}
      <div class="terms-grid">
        <div class="terms-row"><div class="terms-item"><span class="terms-label">Settlement</span><span class="terms-value">Daily, T+3</span></div><div class="terms-item"><span class="terms-label">Settlement Note</span><span class="terms-value">Does not apply on weekends and bank holidays</span></div></div>
        <div class="terms-row"><div class="terms-item"><span class="terms-label">Client Type</span><span class="terms-value">STD</span></div><div class="terms-item"><span class="terms-label">Restricted Jurisdictions</span><span class="terms-value">OFAC, US</span></div></div>
      </div>
    </section>

    <section class="kit-panel">
      <h3>PDF UI Kit Tokens</h3>
      <div class="swatches">
        ${renderSwatch("accent", tokens.colorAccent)}
        ${renderSwatch("accentSoft", tokens.colorAccentSoft)}
        ${renderSwatch("tableHeaderBg", tokens.colorTableHeaderBg)}
        ${renderSwatch("tableHeaderText", tokens.colorTableHeaderText)}
        ${renderSwatch("border", tokens.colorBorder)}
        ${renderSwatch("altRow", tokens.colorTableAltRow)}
        ${renderSwatch("textPrimary", tokens.colorTextPrimary)}
        ${renderSwatch("textMuted", tokens.colorTextMuted)}
      </div>
    </section>

  </div>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;
}

import { escapeHtml } from "../../../../shared/html.js";
import { renderSectionHeader } from "../../pdf-kit/primitives.js";
import type { DocumentTemplatePayload, DocumentWizardLayout } from "../../types.js";
import {
  formatEuro,
  formatPercent,
  formatTierRangeLabel,
  hasPositiveNumber
} from "../formatters.js";
import { tierColorClass } from "../tierColor.js";

// Pay-Out Trx Fee cell. Returns a fully-formed inline span: numeric
// values use `valueColorClass` (default = first-tier blue for the
// non-tiered branch, tier-color-N for the tiered branch); "N/A" rows
// always switch to the muted `.value-na` class so the "not applicable"
// state reads as gray.
function renderPayoutTrxFeeSpan(
  block: { trxFee: number; trxFeeNa: boolean },
  extraClass = "",
  valueColorClass: string = "tier-color-1"
): string {
  const valueClass = block.trxFeeNa ? "value-na" : valueColorClass;
  const className = [extraClass, valueClass].filter(Boolean).join(" ");
  const text = block.trxFeeNa ? "N/A" : escapeHtml(formatEuro(block.trxFee));
  return `<span class="${className}">${text}</span>`;
}

// Minimum fee cell. Three states:
//   - "N/A"   → user toggled the N/A flag (rendered gray)
//   - "€X.XX" → toggle off and a positive value is configured (default colour)
//   - ""      → toggle off + no value (column hidden by global rule)
function renderPayoutMinFeeCell(data: DocumentTemplatePayload): string {
  if (data.toggles.payoutMinimumFeePerTransactionNa) {
    return `<span class="value-na">N/A</span>`;
  }
  return data.toggles.payoutMinimumFeeEnabled &&
    hasPositiveNumber(data.toggles.payoutMinimumFeePerTransaction)
    ? escapeHtml(formatEuro(data.toggles.payoutMinimumFeePerTransaction))
    : "";
}

// Quick "is the cell renderable?" predicate used by the column-hide
// logic. Mirrors the truthiness of renderPayoutMinFeeCell's output.
function hasPayoutMinFeeContent(data: DocumentTemplatePayload): boolean {
  if (data.toggles.payoutMinimumFeePerTransactionNa) return true;
  return (
    data.toggles.payoutMinimumFeeEnabled &&
    hasPositiveNumber(data.toggles.payoutMinimumFeePerTransaction)
  );
}

// Tiered Pay Out rows (one per volume tier). The non-tiered / fixed
// case is rendered as a big-value CARD instead — see buildPayoutCards.
function buildPayoutRows(
  data: DocumentTemplatePayload,
  layout: DocumentWizardLayout,
  showMinimumFeeColumn: boolean
): string {
  const showRegionColumn = layout.payout.regionMode === "global";
  const payout = data.payoutPricing;
  const minimumFeeCell = showMinimumFeeColumn ? renderPayoutMinFeeCell(data) : "";

  return payout.tiers
    .map((tier, index) => {
      const tierLabel = formatTierRangeLabel(index as 0 | 1 | 2, payout.tier1UpToMillion, payout.tier2UpToMillion);
      const tierColor = tierColorClass(index);
      return `<tr>
        ${showRegionColumn ? "<td>Global</td>" : ""}
        <td class="${tierColor}">${escapeHtml(tierLabel)}</td>
        <td>${escapeHtml(formatPercent(tier.mdrPercent))}</td>
        <td>${renderPayoutTrxFeeSpan(tier, "", tierColor)}</td>
        ${showMinimumFeeColumn ? `<td>${minimumFeeCell}</td>` : ""}
      </tr>`;
    })
    .join("");
}

// One big-value card: small grey label, large accent value, grey
// subtitle. `valueHtml` is inserted verbatim (callers pass either an
// already-escaped string or a span, e.g. the muted "N/A").
function payoutCard(label: string, valueHtml: string, subtitle: string): string {
  return `<div class="payout-card">
    <span class="payout-card-label">${label}</span>
    <span class="payout-card-value">${valueHtml}</span>
    <span class="payout-card-sub">${escapeHtml(subtitle)}</span>
  </div>`;
}

// Non-tiered / FIXED RATE Pay Out — a single row of big-value cards
// (REGION / MDR / TRANSACTION FEE / MINIMUM FEE), matching the
// reference. Card count adapts to which optional fields are present.
function buildPayoutCards(
  data: DocumentTemplatePayload,
  layout: DocumentWizardLayout
): string {
  const showRegion = layout.payout.regionMode === "global";
  const showMinFee = hasPayoutMinFeeContent(data);
  const single = data.payoutPricing.single;

  const cards: string[] = [];
  if (showRegion) {
    cards.push(payoutCard("REGION", "Global", "All Visa & Mastercard"));
  }
  cards.push(
    payoutCard(
      "MDR / PROCESSING RATE",
      escapeHtml(formatPercent(single.mdrPercent)),
      "Non-tiered, fixed"
    )
  );
  const trxValue = single.trxFeeNa
    ? `<span class="value-na">N/A</span>`
    : escapeHtml(formatEuro(single.trxFee));
  cards.push(payoutCard("TRANSACTION FEE", trxValue, "Credit / Debit & APM"));
  if (showMinFee) {
    cards.push(payoutCard("MINIMUM FEE", renderPayoutMinFeeCell(data), "Per transaction"));
  }

  return `<div class="payout-cards">${cards.join("")}</div>`;
}

export function buildPayoutSection(data: DocumentTemplatePayload, layout: DocumentWizardLayout): string {
  if (!data.calculatorType.payout || layout.payout.regionMode === "none") {
    return "";
  }

  const showRegionColumn = layout.payout.regionMode === "global";
  const showTierColumn = layout.payout.tableMode === "globalTiered";
  // Hide-if-empty rule: drop the MINIMUM FEE column entirely when the toggle
  // is off or the value is missing — keeps the table consistent with our
  // "no data, no block" promise from the OFFER fidelity audit.
  const showMinimumFeeColumn = hasPayoutMinFeeContent(data);

  // Universal layout — no compact preset (removed 2026-05-30).
  const sectionClass = "offer-section";

  // Non-tiered / FIXED RATE → big-value card row (reference style).
  // Tiered → standard table (mirrors section 1's tiered table).
  const body = showTierColumn
    ? `<table>
      <thead>
        <tr>
          ${showRegionColumn ? "<th>REGION</th>" : ""}
          <th>MONTHLY VOLUME TIER</th>
          <th>MDR / PROCESSING RATE</th>
          <th>TRANSACTION FEE</th>
          ${showMinimumFeeColumn ? "<th>MINIMUM FEE</th>" : ""}
        </tr>
      </thead>
      <tbody>${buildPayoutRows(data, layout, showMinimumFeeColumn)}</tbody>
    </table>`
    : buildPayoutCards(data, layout);

  // The section returns ONLY the section element. The custom note (if
  // any) is emitted by the orchestrator as a separate sibling so it
  // can live in its own <tr> (see payin.ts for the matching rationale
  // and the per-page footer fix it enables).
  return `<section class="${sectionClass}">
    ${renderSectionHeader(2, "Card Acquiring — Pay Out / Push to Card", showTierColumn ? "VOLUME TIERED" : "FIXED RATE")}
    ${body}
  </section>`;
}

// Single source of truth for "is the payout section custom note
// active?". Used by buildPayoutSection and the renderer below.
export function hasPayoutCustomNote(data: DocumentTemplatePayload): boolean {
  return (
    data.contractSummary.payoutCustomNoteEnabled &&
    data.contractSummary.payoutCustomNoteText.trim().length > 0
  );
}

// Returns the standalone <p class="section-custom-note"> for the
// payout section, or an empty string when the toggle is off / text is
// blank.
export function buildPayoutCustomNoteHtml(data: DocumentTemplatePayload): string {
  if (!hasPayoutCustomNote(data)) return "";
  return `<p class="section-custom-note">${escapeHtml(data.contractSummary.payoutCustomNoteText)}</p>`;
}

import { escapeHtml } from "../../../calculator/formatUtils.js";
import { renderSectionHeader } from "../../pdf-kit/primitives.js";
import type { DocumentTemplatePayload, DocumentWizardLayout } from "../../types.js";
import {
  formatEuro,
  formatPercent,
  formatTierRangeLabel,
  hasPositiveNumber
} from "../formatters.js";

// Maps a 0-based tier index to its colour class (mirrors the helper in
// payin.ts so both tiered tables share the same per-tier shading).
function tierColorClass(index: number): string {
  if (index === 0) return "tier-color-1";
  if (index === 1) return "tier-color-2";
  return "tier-color-3";
}

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

function buildPayoutRows(
  data: DocumentTemplatePayload,
  layout: DocumentWizardLayout,
  showMinimumFeeColumn: boolean
): string {
  const showRegionColumn = layout.payout.regionMode === "global";
  const showTierColumn = layout.payout.tableMode === "globalTiered";
  const payout = data.payoutPricing;
  const minimumFeeCell = showMinimumFeeColumn ? renderPayoutMinFeeCell(data) : "";

  if (!showTierColumn) {
    return `<tr>
      ${
        showRegionColumn
          ? "<td><span class=\"cell-line\">Global</span><span class=\"cell-line cell-subtitle\">All Visa & Mastercard</span></td>"
          : ""
      }
      <td><span class="cell-line">${escapeHtml(formatPercent(payout.single.mdrPercent))}</span><span class="cell-line cell-subtitle">Non-tiered, fixed</span></td>
      <td>${renderPayoutTrxFeeSpan(payout.single, "cell-line")}<span class="cell-line cell-subtitle">Credit / Debit & APM</span></td>
      ${showMinimumFeeColumn ? `<td>${minimumFeeCell}</td>` : ""}
    </tr>`;
  }

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

  return `<section class="offer-section">
    ${renderSectionHeader(2, "Card Acquiring — Pay Out / Push to Card", showTierColumn ? "VOLUME TIERED" : "FIXED RATE")}
    <table>
      <thead>
        <tr>
          ${showRegionColumn ? "<th>REGION</th>" : ""}
          ${showTierColumn ? "<th>MONTHLY VOLUME TIER</th>" : ""}
          <th>MDR / PROCESSING RATE</th>
          <th>TRANSACTION FEE</th>
          ${showMinimumFeeColumn ? "<th>MINIMUM FEE</th>" : ""}
        </tr>
      </thead>
      <tbody>${buildPayoutRows(data, layout, showMinimumFeeColumn)}</tbody>
    </table>
  </section>`;
}

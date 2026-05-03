import { escapeHtml } from "../../../calculator/formatUtils.js";
import { renderSectionHeader } from "../../pdf-kit/primitives.js";
import type { DocumentTemplatePayload, DocumentWizardLayout } from "../../types.js";
import {
  formatEuro,
  formatPercent,
  formatTierRangeLabel,
  hasPositiveNumber
} from "../formatters.js";

function resolveMinimumFeeLabel(data: DocumentTemplatePayload): string {
  return data.toggles.payoutMinimumFeeEnabled &&
    hasPositiveNumber(data.toggles.payoutMinimumFeePerTransaction)
    ? formatEuro(data.toggles.payoutMinimumFeePerTransaction)
    : "";
}

function buildPayoutRows(
  data: DocumentTemplatePayload,
  layout: DocumentWizardLayout,
  showMinimumFeeColumn: boolean
): string {
  const showRegionColumn = layout.payout.regionMode === "global";
  const showTierColumn = layout.payout.tableMode === "globalTiered";
  const payout = data.payoutPricing;
  const minimumFeeLabel = showMinimumFeeColumn ? resolveMinimumFeeLabel(data) : "";

  if (!showTierColumn) {
    return `<tr>
      ${
        showRegionColumn
          ? "<td><span class=\"cell-line\">Global</span><span class=\"cell-line\">All Visa & Mastercard</span></td>"
          : ""
      }
      <td><span class="cell-line">${escapeHtml(formatPercent(payout.single.mdrPercent))}</span><span class="cell-line">Non-tiered, fixed</span></td>
      <td><span class="cell-line accent-text">${escapeHtml(formatEuro(payout.single.trxFee))}</span><span class="cell-line">Credit / Debit & APM</span></td>
      ${showMinimumFeeColumn ? `<td>${escapeHtml(minimumFeeLabel)}</td>` : ""}
    </tr>`;
  }

  return payout.tiers
    .map((tier, index) => {
      const tierLabel = formatTierRangeLabel(index as 0 | 1 | 2, payout.tier1UpToMillion, payout.tier2UpToMillion);
      return `<tr>
        ${showRegionColumn ? "<td>Global</td>" : ""}
        <td class="accent-text">${escapeHtml(tierLabel)}</td>
        <td>${escapeHtml(formatPercent(tier.mdrPercent))}</td>
        <td class="accent-text">${escapeHtml(formatEuro(tier.trxFee))}</td>
        ${showMinimumFeeColumn ? `<td>${escapeHtml(minimumFeeLabel)}</td>` : ""}
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
  const showMinimumFeeColumn = resolveMinimumFeeLabel(data).length > 0;

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

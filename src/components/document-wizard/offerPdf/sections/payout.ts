import { escapeHtml } from "../../../calculator/formatUtils.js";
import { renderSectionHeader } from "../../pdf-kit/primitives.js";
import type { DocumentTemplatePayload, DocumentWizardLayout } from "../../types.js";
import {
  formatEuro,
  formatPercent,
  formatTierRangeLabel,
  hasPositiveNumber
} from "../formatters.js";

function buildPayoutRows(data: DocumentTemplatePayload, layout: DocumentWizardLayout): string {
  const showRegionColumn = layout.payout.regionMode === "global";
  const showTierColumn = layout.payout.tableMode === "globalTiered";
  const payout = data.payoutPricing;
  const minimumFeeLabel =
    data.toggles.payoutMinimumFeeEnabled && hasPositiveNumber(data.toggles.payoutMinimumFeePerTransaction)
      ? formatEuro(data.toggles.payoutMinimumFeePerTransaction)
      : "";

  if (!showTierColumn) {
    return `<tr>
      ${
        showRegionColumn
          ? "<td><span class=\"cell-line\">Global</span><span class=\"cell-line\">All Visa & Mastercard</span></td>"
          : ""
      }
      <td><span class="cell-line">${escapeHtml(formatPercent(payout.single.mdrPercent))}</span><span class="cell-line">Non-tiered, fixed</span></td>
      <td><span class="cell-line accent-text">${escapeHtml(formatEuro(payout.single.trxFee))}</span><span class="cell-line">Credit / Debit & APM</span></td>
      <td>${minimumFeeLabel ? escapeHtml(minimumFeeLabel) : ""}</td>
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
        <td>${minimumFeeLabel ? escapeHtml(minimumFeeLabel) : ""}</td>
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

  return `<section class="offer-section">
    ${renderSectionHeader(2, "Card Acquiring — Pay Out / Push to Card", showTierColumn ? "VOLUME TIERED" : "FIXED RATE")}
    <table>
      <thead>
        <tr>
          ${showRegionColumn ? "<th>REGION</th>" : ""}
          ${showTierColumn ? "<th>MONTHLY VOLUME TIER</th>" : "<th>MDR / PROCESSING RATE</th>"}
          ${showTierColumn ? "<th>MDR / PROCESSING RATE</th>" : "<th>TRANSACTION FEE</th>"}
          ${showTierColumn ? "<th>TRANSACTION FEE</th>" : "<th>MINIMUM FEE</th>"}
          ${showTierColumn ? "<th>MINIMUM FEE</th>" : ""}
        </tr>
      </thead>
      <tbody>${buildPayoutRows(data, layout)}</tbody>
    </table>
  </section>`;
}

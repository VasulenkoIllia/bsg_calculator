import { escapeHtml } from "../../../calculator/formatUtils.js";
import { renderSectionHeader } from "../../pdf-kit/primitives.js";
import type { DocumentTemplatePayload, DocumentWizardLayout } from "../../types.js";
import {
  formatEuro,
  formatPayinModel,
  formatPercent,
  formatTierRangeLabel,
  hasPositiveNumber
} from "../formatters.js";

type PayinPricingRegion = DocumentTemplatePayload["payinPricing"]["eu"];
type PayinRegionCode = "eu" | "ww";

interface PayinRegionContext {
  code: PayinRegionCode;
  label: string;
  pricing: PayinPricingRegion;
}

function formatPayinMinTransactionFee(
  data: DocumentTemplatePayload,
  region: PayinRegionCode
): string | null {
  const summary = data.contractSummary;

  if (summary.payoutMinimumFeeMode === "overall") {
    if (
      !hasPositiveNumber(summary.payoutMinimumFeeThresholdMillion) ||
      !hasPositiveNumber(summary.payoutMinimumFeePerTransaction)
    ) {
      return null;
    }

    return `≤${summary.payoutMinimumFeeThresholdMillion.toLocaleString("en-US")}M: ${formatEuro(
      summary.payoutMinimumFeePerTransaction
    )} / >${summary.payoutMinimumFeeThresholdMillion.toLocaleString("en-US")}M: N/A`;
  }

  const threshold =
    region === "eu"
      ? summary.payoutMinimumFeeEuThresholdMillion
      : summary.payoutMinimumFeeWwThresholdMillion;
  const fee =
    region === "eu" ? summary.payoutMinimumFeeEuPerTransaction : summary.payoutMinimumFeeWwPerTransaction;

  if (!hasPositiveNumber(threshold) || !hasPositiveNumber(fee)) {
    return null;
  }

  return `≤${threshold.toLocaleString("en-US")}M: ${formatEuro(fee)} / >${threshold.toLocaleString("en-US")}M: N/A`;
}

function resolvePayinRegionContexts(
  data: DocumentTemplatePayload,
  layout: DocumentWizardLayout
): PayinRegionContext[] {
  const contexts: PayinRegionContext[] = [];

  if (layout.payin.regionMode === "both" || layout.payin.regionMode === "euOnly") {
    contexts.push({ code: "eu", label: "EU", pricing: data.payinPricing.eu });
  }
  if (layout.payin.regionMode === "both" || layout.payin.regionMode === "wwOnly") {
    contexts.push({ code: "ww", label: "Global", pricing: data.payinPricing.ww });
  }

  if (contexts.length === 0) {
    contexts.push({ code: "eu", label: "Global", pricing: data.payinPricing.eu });
  }

  return contexts;
}

function buildPayinRows(data: DocumentTemplatePayload, layout: DocumentWizardLayout): string {
  const methodLabel = "Credit / Debit — Visa, Mastercard";
  const apmLabel = "APM — Apple Pay, Google Pay";
  const showRegionColumn = layout.payin.tableMode === "byRegionTiered" || layout.payin.tableMode === "byRegionFlat";
  const showTierColumn = layout.payin.tableMode === "byRegionTiered" || layout.payin.tableMode === "flatTiered";

  const regions = resolvePayinRegionContexts(data, layout);

  const rows: string[] = [];

  regions.forEach(region => {
    const tiersActive = showTierColumn && region.pricing.rateMode === "tiered";

    if (tiersActive) {
      region.pricing.tiers.forEach((tier, index) => {
        const tierLabel = formatTierRangeLabel(
          index as 0 | 1 | 2,
          region.pricing.tier1UpToMillion,
          region.pricing.tier2UpToMillion
        );
        const minFee = formatPayinMinTransactionFee(data, region.code);

        rows.push(`<tr>
          ${
            showRegionColumn
              ? `<td class="cell-region">● ${escapeHtml(region.label)}</td>`
              : ""
          }
          <td><span class="cell-line">${escapeHtml(methodLabel)}</span><span class="cell-line">${escapeHtml(
            apmLabel
          )}</span></td>
          <td>EUR</td>
          ${showTierColumn ? `<td class="accent-text">${escapeHtml(tierLabel)}</td>` : ""}
          <td><span class="cell-line accent-text">${escapeHtml(formatPayinModel(region.pricing.model))}</span><span class="cell-line">${escapeHtml(
            formatPercent(tier.mdrPercent)
          )}</span></td>
          <td>
            ${
              region.pricing.trxFeeEnabled
                ? `<span class="cell-line accent-text">C/D: ${escapeHtml(formatEuro(tier.trxCc))}</span><span class="cell-line accent-text">APM: ${escapeHtml(
                    formatEuro(tier.trxApm)
                  )}</span>`
                : ""
            }
          </td>
          <td>${minFee ? escapeHtml(minFee) : ""}</td>
        </tr>`);
      });
      return;
    }

    const minFee = formatPayinMinTransactionFee(data, region.code);

    rows.push(`<tr>
      ${
        showRegionColumn
          ? `<td class="cell-region">● ${escapeHtml(region.label)}</td>`
          : ""
      }
      <td><span class="cell-line">${escapeHtml(methodLabel)}</span><span class="cell-line">${escapeHtml(
        apmLabel
      )}</span></td>
      <td>EUR</td>
      ${showTierColumn ? "<td>Non-tiered, fixed</td>" : ""}
      <td><span class="cell-line accent-text">${escapeHtml(formatPayinModel(region.pricing.model))}</span><span class="cell-line">${escapeHtml(
        formatPercent(region.pricing.single.mdrPercent)
      )}</span></td>
      <td>
        ${
          region.pricing.trxFeeEnabled
            ? `<span class="cell-line accent-text">C/D: ${escapeHtml(formatEuro(region.pricing.single.trxCc))}</span><span class="cell-line accent-text">APM: ${escapeHtml(
                formatEuro(region.pricing.single.trxApm)
              )}</span>`
            : ""
        }
      </td>
      <td>${minFee ? escapeHtml(minFee) : ""}</td>
    </tr>`);
  });

  return rows.join("");
}

export function buildPayinSection(data: DocumentTemplatePayload, layout: DocumentWizardLayout): string {
  if (!data.calculatorType.payin) {
    return "";
  }

  const showRegionColumn = layout.payin.tableMode === "byRegionTiered" || layout.payin.tableMode === "byRegionFlat";
  const showTierColumn = layout.payin.tableMode === "byRegionTiered" || layout.payin.tableMode === "flatTiered";

  const payinRows = buildPayinRows(data, layout);

  return `<section class="offer-section">
    ${renderSectionHeader(1, "Card Acquiring — Credit / Debit Cards, APM & E-wallet", showTierColumn ? "VOLUME TIERED" : "FIXED RATE")}
    <table>
      <thead>
        <tr>
          ${showRegionColumn ? "<th>REGION</th>" : ""}
          <th>METHODS</th>
          <th>CURRENCY</th>
          ${showTierColumn ? "<th>MONTHLY VOLUME TIER</th>" : ""}
          <th>MDR / RATE</th>
          <th>TRANSACTION FEE</th>
          <th>MIN. TRANSACTION FEE</th>
        </tr>
      </thead>
      <tbody>${payinRows}</tbody>
    </table>
  </section>`;
}

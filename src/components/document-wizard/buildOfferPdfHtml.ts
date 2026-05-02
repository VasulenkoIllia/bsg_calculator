import { escapeHtml } from "../calculator/formatUtils.js";
import type {
  DocumentWizardLayout,
  DocumentWizardTemplateData,
  PayoutTableMode,
  PayinTableMode,
  ValueMode
} from "./types.js";
import {
  buildPdfUiKitStyles,
  renderFeesGrid,
  renderFooter,
  renderMetaItem,
  renderSectionHeader,
  renderTermsGrid
} from "./pdf-kit/primitives.js";
import { OFFER_REFERENCE_TOKENS } from "./pdf-kit/tokens.js";

type PayinPricingRegion = DocumentWizardTemplateData["payinPricing"]["eu"];
type PayoutPricing = DocumentWizardTemplateData["payoutPricing"];

type PayinRegionCode = "eu" | "ww";

interface PayinRegionContext {
  code: PayinRegionCode;
  label: string;
  pricing: PayinPricingRegion;
}

const OFFER_CONFIDENTIAL_TITLE = "CONFIDENTIAL · PAYMENT INFRASTRUCTURE";
const OFFER_SUBTITLE =
  "Card Acquiring, Payout Infrastructure & Settlement Terms — structured for scale-up and enterprise merchants operating globally.";

const TERMS_DEFAULTS = {
  settlementNote: "Does not apply on weekends and bank holidays",
  clientType: "STD",
  restrictedJurisdictions: "OFAC, US"
} as const;

function hasPositiveNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function formatEuro(value: number, fractionDigits = 2): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `€${safeValue.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  })}`;
}

function formatEuroInteger(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `€${Math.round(safeValue).toLocaleString("en-US")}`;
}

function formatPercent(value: number, fractionDigits = 2): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const rounded = Number(safeValue.toFixed(fractionDigits));
  if (Number.isInteger(rounded)) {
    return `${rounded}%`;
  }

  return `${rounded.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: fractionDigits
  })}%`;
}

function formatTierRangeLabel(
  tierIndex: 0 | 1 | 2,
  tier1UpToMillion: number,
  tier2UpToMillion: number
): string {
  const safeTier1 = Math.max(0, tier1UpToMillion);
  const safeTier2 = Math.max(safeTier1, tier2UpToMillion);

  if (tierIndex === 0) {
    return `Up to €${safeTier1.toLocaleString("en-US")}M`;
  }

  if (tierIndex === 1) {
    return `€${safeTier1.toLocaleString("en-US")}M – €${safeTier2.toLocaleString("en-US")}M`;
  }

  return `Above €${safeTier2.toLocaleString("en-US")}M`;
}

function formatDisplayDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function formatPayinModel(model: "icpp" | "blended"): string {
  return model === "icpp" ? "IC++" : "Blended";
}

function resolveModelHeaderLabel(collectionModel: string): string {
  return collectionModel.toLowerCase().includes("interchange plus")
    ? "SETTLEMENT MODEL"
    : "COLLECTION MODEL";
}

function resolveModeValue(mode: ValueMode | undefined, valueLabel: string): string | null {
  if (mode === "waived") return "Waived";
  if (mode === "na") return "N/A";
  if (mode === "tbd") return "TBD";
  if (mode === "value") return valueLabel;
  return valueLabel;
}

function resolveLayout(data: DocumentWizardTemplateData): DocumentWizardLayout {
  if (data.layout) {
    return data.layout;
  }

  const euEnabled = data.calculatorType.payin && data.payin.euPercent > 0;
  const wwEnabled = data.calculatorType.payin && data.payin.wwPercent > 0;
  const payinRegionMode = euEnabled && wwEnabled ? "both" : euEnabled ? "euOnly" : wwEnabled ? "wwOnly" : "none";
  const payinTableMode: PayinTableMode =
    payinRegionMode === "none"
      ? data.payinPricing.eu.rateMode === "tiered" || data.payinPricing.ww.rateMode === "tiered"
        ? "flatTiered"
        : "flatSingle"
      : data.payinPricing.eu.rateMode === "tiered" || data.payinPricing.ww.rateMode === "tiered"
        ? "byRegionTiered"
        : "byRegionFlat";
  const payoutTableMode: PayoutTableMode = data.payoutPricing.rateMode === "tiered" ? "globalTiered" : "globalFlat";

  return {
    source: "calculator",
    payin: {
      regionMode: payinRegionMode,
      tableMode: payinTableMode
    },
    payout: {
      regionMode: data.calculatorType.payout ? "global" : "none",
      tableMode: payoutTableMode
    }
  };
}

function formatPayinMinTransactionFee(
  data: DocumentWizardTemplateData,
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
  data: DocumentWizardTemplateData,
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

function buildPayinRows(data: DocumentWizardTemplateData, layout: DocumentWizardLayout): string {
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

function buildPayinSection(data: DocumentWizardTemplateData, layout: DocumentWizardLayout): string {
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

function buildPayoutRows(data: DocumentWizardTemplateData, layout: DocumentWizardLayout): string {
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

function buildPayoutSection(data: DocumentWizardTemplateData, layout: DocumentWizardLayout): string {
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

interface ServiceCard {
  title: string;
  value: string;
  subtitle: string;
}

function buildOtherServicesCards(data: DocumentWizardTemplateData, layout: DocumentWizardLayout): ServiceCard[] {
  const cards: ServiceCard[] = [];
  const modes = data.valueModes ?? {};
  const strictHideMissing = layout.source === "calculator";

  const accountSetupLabel = resolveModeValue(
    modes.accountSetupFee,
    hasPositiveNumber(data.contractSummary.accountSetupFee)
      ? formatEuroInteger(data.contractSummary.accountSetupFee)
      : ""
  );
  if (hasText(accountSetupLabel)) {
    cards.push({ title: "ACCOUNT SETUP", value: accountSetupLabel, subtitle: "One-time · EUR" });
  }

  const refundLabel = resolveModeValue(
    modes.refundCost,
    hasPositiveNumber(data.contractSummary.refundCost) ? formatEuro(data.contractSummary.refundCost) : ""
  );
  if (hasText(refundLabel)) {
    cards.push({ title: "REFUND", value: refundLabel, subtitle: "Per action · EUR" });
  }

  const disputeLabel = resolveModeValue(
    modes.disputeCost,
    hasPositiveNumber(data.contractSummary.disputeCost) ? formatEuro(data.contractSummary.disputeCost) : ""
  );
  if (hasText(disputeLabel)) {
    cards.push({ title: "DISPUTE / CHARGEBACK", value: disputeLabel, subtitle: "Per action · EUR" });
  }

  const threeDsLabel = resolveModeValue(
    modes.threeDsFee,
    data.toggles.threeDsEnabled && hasPositiveNumber(data.toggles.threeDsRevenuePerSuccessfulTransaction)
      ? formatEuro(data.toggles.threeDsRevenuePerSuccessfulTransaction)
      : ""
  );
  if (hasText(threeDsLabel)) {
    cards.push({ title: "3D SECURE (3DS)", value: threeDsLabel, subtitle: "Per action · EUR" });
  }

  const settlementValue = data.toggles.settlementIncluded
    ? "Included"
    : data.toggles.settlementFeeEnabled && hasPositiveNumber(data.toggles.settlementFeeRatePercent)
      ? formatPercent(data.toggles.settlementFeeRatePercent)
      : "";
  const settlementLabel = resolveModeValue(modes.settlementFee, settlementValue);
  if (hasText(settlementLabel)) {
    cards.push({ title: "SETTLEMENT", value: settlementLabel, subtitle: "Per action · USDT" });
  }

  const monthlyMinimumLabel = resolveModeValue(
    modes.monthlyMinimumFee,
    data.toggles.monthlyMinimumFeeEnabled && hasPositiveNumber(data.toggles.monthlyMinimumFeeAmount)
      ? formatEuroInteger(data.toggles.monthlyMinimumFeeAmount)
      : ""
  );
  if (hasText(monthlyMinimumLabel)) {
    cards.push({
      title: "MIN. MONTHLY ACCOUNT FEE",
      value: monthlyMinimumLabel,
      subtitle: "Per month"
    });
  }

  if (data.toggles.failedTrxEnabled) {
    cards.push({
      title: "FAILED TRX CHARGING",
      value:
        data.toggles.failedTrxMode === "allFailedVolume"
          ? "All failed volume"
          : `Over limit only (${formatPercent(data.toggles.failedTrxOverLimitThresholdPercent, 0)})`,
      subtitle: "Calculator mode"
    });
  }

  if (strictHideMissing) {
    return cards.filter(card => hasText(card.value));
  }

  return cards;
}

function buildOtherServicesSection(data: DocumentWizardTemplateData, layout: DocumentWizardLayout): string {
  const cards = buildOtherServicesCards(data, layout);
  if (cards.length === 0) {
    return "";
  }

  return `<section class="offer-section">
    ${renderSectionHeader(3, "Other Services & Fees", "PER ACTION")}
    ${renderFeesGrid(cards)}
  </section>`;
}

interface TermsItem {
  label: string;
  value: string;
}

function buildTermsItems(data: DocumentWizardTemplateData, layout: DocumentWizardLayout): TermsItem[] {
  const summary = data.contractSummary;
  const modes = data.valueModes ?? {};
  const strictHideMissing = layout.source === "calculator";

  const items: TermsItem[] = [];

  if (hasText(summary.settlementPeriod)) {
    items.push({ label: "Settlement", value: `Daily, ${summary.settlementPeriod}` });
  }
  items.push({ label: "Settlement Note", value: TERMS_DEFAULTS.settlementNote });
  items.push({ label: "Client Type", value: TERMS_DEFAULTS.clientType });
  items.push({ label: "Restricted Jurisdictions", value: TERMS_DEFAULTS.restrictedJurisdictions });

  if (hasPositiveNumber(summary.collectionLimitMin)) {
    items.push({ label: "Min. Collection Transaction Size", value: `${formatEuroInteger(summary.collectionLimitMin)} EUR` });
  }
  if (hasPositiveNumber(summary.collectionLimitMax)) {
    items.push({ label: "Max. Collection Transaction Size", value: `${formatEuroInteger(summary.collectionLimitMax)} EUR` });
  }
  if (hasPositiveNumber(summary.payoutLimitMin)) {
    items.push({ label: "Min. Payout Transaction Size", value: `${formatEuroInteger(summary.payoutLimitMin)} EUR` });
  }

  const payoutLimitMaxLabel = resolveModeValue(
    modes.payoutLimitMax,
    summary.payoutLimitMax !== null && hasPositiveNumber(summary.payoutLimitMax)
      ? `${formatEuroInteger(summary.payoutLimitMax)} EUR`
      : ""
  );
  if (hasText(payoutLimitMaxLabel)) {
    items.push({ label: "Max. Payout Transaction Size", value: payoutLimitMaxLabel });
  }

  if (hasPositiveNumber(summary.rollingReservePercent) && hasPositiveNumber(summary.rollingReserveHoldDays)) {
    items.push({
      label: "Rolling Reserve",
      value: `${formatPercent(summary.rollingReservePercent, 0)} · ${Math.round(summary.rollingReserveHoldDays)} days`
    });
  }

  const reserveCapLabel = resolveModeValue(
    modes.rollingReserveCap,
    summary.rollingReserveCap !== null && hasPositiveNumber(summary.rollingReserveCap)
      ? formatEuroInteger(summary.rollingReserveCap)
      : ""
  );
  if (hasText(reserveCapLabel)) {
    items.push({ label: "Rolling Reserve Cap", value: reserveCapLabel });
  }

  if (!strictHideMissing) {
    return items;
  }

  return items.filter(item => hasText(item.value));
}

function buildTermsSection(data: DocumentWizardTemplateData, layout: DocumentWizardLayout): string {
  const items = buildTermsItems(data, layout);
  if (items.length === 0) {
    return "";
  }

  return `<section class="offer-section">
    ${renderSectionHeader(4, "Terms & Limitations", "GLOBAL")}
    ${renderTermsGrid(items)}
  </section>`;
}

function buildBody(data: DocumentWizardTemplateData, layout: DocumentWizardLayout): string {
  const sections: string[] = [];

  const payin = buildPayinSection(data, layout);
  if (payin) sections.push(payin);

  const payout = buildPayoutSection(data, layout);
  if (payout) sections.push(payout);

  const services = buildOtherServicesSection(data, layout);
  if (services) sections.push(services);

  const terms = buildTermsSection(data, layout);
  if (terms) sections.push(terms);

  return sections.join("");
}

export function buildOfferPdfHtml(data: DocumentWizardTemplateData): string {
  const layout = resolveLayout(data);
  const body = buildBody(data, layout);
  const modelLabel = resolveModelHeaderLabel(data.header.collectionModel);
  const displayDate = formatDisplayDate(data.header.documentDateIso);
  const styles = buildPdfUiKitStyles(OFFER_REFERENCE_TOKENS);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(data.header.documentNumber)}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="sheet">
    <header class="offer-header">
      <div class="offer-top-line"></div>
      <p class="offer-eyebrow">${OFFER_CONFIDENTIAL_TITLE}</p>
      <h1 class="offer-title">Service<br/><span class="accent">Agreement</span></h1>
      <p class="offer-subtitle">${escapeHtml(OFFER_SUBTITLE)}</p>
      <div class="meta-grid">
        ${renderMetaItem({ label: "DOCUMENT TYPE", value: data.header.documentType })}
        ${renderMetaItem({ label: modelLabel, value: data.header.collectionModel })}
        ${renderMetaItem({ label: "COLLECTION FREQUENCY", value: data.header.collectionFrequency })}
        ${renderMetaItem({ label: "DOCUMENT NUMBER", value: data.header.documentNumber })}
        ${renderMetaItem({ label: "DOCUMENT DATE", value: displayDate })}
      </div>
      <p class="meta-note">
        All fees are collected on a daily basis unless otherwise instructed in writing. Rates are subject to applicable interchange and scheme fees under the IC++ model unless otherwise instructed in writing.
      </p>
    </header>

    ${body}
    ${renderFooter(data.header.documentNumber)}
  </div>
</body>
</html>`;
}

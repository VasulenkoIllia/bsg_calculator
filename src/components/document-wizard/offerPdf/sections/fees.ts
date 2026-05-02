import { renderFeesGrid, renderSectionHeader } from "../../pdf-kit/primitives.js";
import type { DocumentTemplatePayload, DocumentWizardLayout } from "../../types.js";
import {
  formatEuro,
  formatEuroInteger,
  formatPercent,
  hasPositiveNumber,
  hasText,
  resolveModeValue
} from "../formatters.js";

interface ServiceCard {
  title: string;
  value: string;
  subtitle: string;
}

function buildOtherServicesCards(data: DocumentTemplatePayload, layout: DocumentWizardLayout): ServiceCard[] {
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

export function buildOtherServicesSection(data: DocumentTemplatePayload, layout: DocumentWizardLayout): string {
  const cards = buildOtherServicesCards(data, layout);
  if (cards.length === 0) {
    return "";
  }

  return `<section class="offer-section">
    ${renderSectionHeader(3, "Other Services & Fees", "PER ACTION")}
    ${renderFeesGrid(cards)}
  </section>`;
}

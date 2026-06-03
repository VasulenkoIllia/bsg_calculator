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
  // Optional secondary line under the value (e.g. "Per action · EUR",
  // "Per transaction").
  subtitle?: string;
  // Optional custom note rendered on its own line under `subtitle`
  // (operator-entered; currently only the MIN. MONTHLY ACCOUNT FEE).
  subtitleNote?: string;
}

function buildOtherServicesCards(data: DocumentTemplatePayload, layout: DocumentWizardLayout): ServiceCard[] {
  const cards: ServiceCard[] = [];
  const modes = data.valueModes ?? {};
  const notes = data.feeNotes ?? {};
  // Operator-entered custom note → optional second subtitle line.
  const noteFor = (key: keyof typeof notes): string | undefined => {
    const text = notes[key]?.trim();
    return text ? text : undefined;
  };
  const strictHideMissing = layout.source === "calculator";

  const accountSetupLabel = resolveModeValue(
    modes.accountSetupFee,
    hasPositiveNumber(data.contractSummary.accountSetupFee)
      ? formatEuroInteger(data.contractSummary.accountSetupFee)
      : ""
  );
  // ACCOUNT SETUP always shows. A value-mode label that resolves empty
  // (value 0 / blank) renders "Waived" by default (product rule); the
  // "waived" / "na" modes already produce "Waived" / "N/A".
  cards.push({
    title: "ACCOUNT SETUP",
    value: hasText(accountSetupLabel) ? accountSetupLabel : "Waived",
    subtitle: "One-time · EUR",
    subtitleNote: noteFor("accountSetupFee")
  });

  const refundLabel = resolveModeValue(
    modes.refundCost,
    hasPositiveNumber(data.contractSummary.refundCost) ? formatEuro(data.contractSummary.refundCost) : ""
  );
  if (hasText(refundLabel)) {
    cards.push({ title: "REFUND", value: refundLabel, subtitle: "Per action · EUR", subtitleNote: noteFor("refundCost") });
  }

  const disputeLabel = resolveModeValue(
    modes.disputeCost,
    hasPositiveNumber(data.contractSummary.disputeCost) ? formatEuro(data.contractSummary.disputeCost) : ""
  );
  if (hasText(disputeLabel)) {
    cards.push({ title: "DISPUTE / CHARGEBACK", value: disputeLabel, subtitle: "Per action · EUR", subtitleNote: noteFor("disputeCost") });
  }

  const threeDsLabel = resolveModeValue(
    modes.threeDsFee,
    data.toggles.threeDsEnabled && hasPositiveNumber(data.toggles.threeDsRevenuePerSuccessfulTransaction)
      ? formatEuro(data.toggles.threeDsRevenuePerSuccessfulTransaction)
      : ""
  );
  if (hasText(threeDsLabel)) {
    cards.push({ title: "3D SECURE (3DS)", value: threeDsLabel, subtitle: "Per action · EUR", subtitleNote: noteFor("threeDsFee") });
  }

  const settlementValue = data.toggles.settlementIncluded
    ? "Included"
    : data.toggles.settlementFeeEnabled && hasPositiveNumber(data.toggles.settlementFeeRatePercent)
      ? formatPercent(data.toggles.settlementFeeRatePercent)
      : "";
  const settlementLabel = resolveModeValue(modes.settlementFee, settlementValue);
  if (hasText(settlementLabel)) {
    cards.push({ title: "SETTLEMENT", value: settlementLabel, subtitle: "Per action · USDT", subtitleNote: noteFor("settlementFee") });
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
      subtitle: "Per month",
      subtitleNote: noteFor("monthlyMinimumFee")
    });
  }

  // FAILED TRANSACTION CHARGING is wizard-driven with its own on/off +
  // 3-mode selector (NOT the Value/Waived/N/A system):
  //   - toggle OFF        → card omitted entirely (nothing renders)
  //   - "free"            → "€0.00"
  //   - "overLimitOnly"   → "Under limit only N.NN%" (no parentheses)
  //   - "allFailedVolume" → "All Failed volume"
  // Always carries the "Per transaction" subtitle + an optional operator
  // memo (feeNotes.failedTrx).
  if (data.toggles.failedTrxEnabled) {
    const failedTrxValue =
      data.toggles.failedTrxMode === "free"
        ? formatEuro(0)
        : data.toggles.failedTrxMode === "allFailedVolume"
          ? "All Failed volume"
          : `Under limit only ${formatPercent(data.toggles.failedTrxOverLimitThresholdPercent)}`;
    cards.push({
      title: "FAILED TRANSACTION CHARGING",
      value: failedTrxValue,
      subtitle: "Per transaction",
      subtitleNote: noteFor("failedTrx")
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

import { renderSectionHeader, renderTermsGrid } from "../../pdf-kit/primitives.js";
import type { DocumentTemplatePayload, DocumentWizardLayout } from "../../types.js";
import {
  formatEuroInteger,
  formatPercent,
  hasPositiveNumber,
  hasText,
  resolveModeValue
} from "../formatters.js";

interface TermsItem {
  label: string;
  value: string;
}

function buildTermsItems(data: DocumentTemplatePayload, layout: DocumentWizardLayout): TermsItem[] {
  const summary = data.contractSummary;
  const modes = data.valueModes ?? {};
  const strictHideMissing = layout.source === "calculator";

  const items: TermsItem[] = [];

  if (hasText(summary.settlementPeriod)) {
    items.push({ label: "Settlement", value: `Daily, ${summary.settlementPeriod}` });
  }
  if (hasText(summary.settlementNote)) {
    items.push({ label: "Settlement Note", value: summary.settlementNote });
  }
  if (hasText(summary.clientType)) {
    items.push({ label: "Client Type", value: summary.clientType });
  }
  if (hasText(summary.restrictedJurisdictions)) {
    items.push({ label: "Restricted Jurisdictions", value: summary.restrictedJurisdictions });
  }

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

export function buildTermsSection(data: DocumentTemplatePayload, layout: DocumentWizardLayout): string {
  const items = buildTermsItems(data, layout);
  if (items.length === 0) {
    return "";
  }

  return `<section class="offer-section">
    ${renderSectionHeader(4, "Terms & Limitations", "GLOBAL")}
    ${renderTermsGrid(items)}
  </section>`;
}

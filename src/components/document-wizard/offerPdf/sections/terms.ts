import { renderSectionHeader, renderTermsGrid } from "../../pdf-kit/primitives.js";
import type {
  DocumentTemplatePayload,
  DocumentWizardLayout,
  DocumentWizardValueModes
} from "../../types.js";
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

  // Transaction Limits — each of the four cells uses the same logic:
  //   - mode = "na" / "tbd" → render the literal "N/A" / "TBD"
  //   - mode = "value" / undefined + numeric value > 0 → render value
  //   - mode = "value" / undefined + empty / 0 → hide row
  // No auto-defaults: the user picks N/A explicitly when they want it.
  const limitItems: Array<{ label: string; value: string; rawValue: number | null }> = [
    { label: "Min. Collection Transaction Size", value: "", rawValue: summary.collectionLimitMin },
    { label: "Max. Collection Transaction Size", value: "", rawValue: summary.collectionLimitMax },
    { label: "Min. Payout Transaction Size", value: "", rawValue: summary.payoutLimitMin },
    { label: "Max. Payout Transaction Size", value: "", rawValue: summary.payoutLimitMax }
  ];

  const limitModes: Array<keyof DocumentWizardValueModes> = [
    "collectionLimitMin",
    "collectionLimitMax",
    "payoutLimitMin",
    "payoutLimitMax"
  ];

  limitItems.forEach((item, i) => {
    const mode = modes[limitModes[i]];
    const numeric = item.rawValue;
    const valueLabel =
      numeric !== null && hasPositiveNumber(numeric)
        ? `${formatEuroInteger(numeric)} EUR`
        : "";
    const rendered = resolveModeValue(mode, valueLabel);
    if (hasText(rendered)) {
      items.push({ label: item.label, value: rendered });
    }
  });

  if (hasPositiveNumber(summary.rollingReservePercent) && hasPositiveNumber(summary.rollingReserveHoldDays)) {
    items.push({
      label: "Rolling Reserve",
      value: `${formatPercent(summary.rollingReservePercent)} · ${Math.round(summary.rollingReserveHoldDays)} days`
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

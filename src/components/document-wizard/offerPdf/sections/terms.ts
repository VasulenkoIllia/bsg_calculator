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

type TermValueColor = "blue" | "black" | "orange";

interface TermsItem {
  label: string;
  value: string;
  valueColor?: TermValueColor;
}

// Reference colour rule for built-in term values: each field has a
// "natural" colour — blue (pricing values), orange (risk/attention
// fields) — but a sentinel value ("N/A" / "TBD") always renders black.
function termColor(natural: TermValueColor, value: string): TermValueColor {
  return value === "N/A" || value === "TBD" ? "black" : natural;
}

function buildTermsItems(data: DocumentTemplatePayload, layout: DocumentWizardLayout): TermsItem[] {
  const summary = data.contractSummary;
  const modes = data.valueModes ?? {};
  const strictHideMissing = layout.source === "calculator";

  const items: TermsItem[] = [];

  if (hasText(summary.settlementPeriod)) {
    items.push({ label: "Settlement", value: `Daily, ${summary.settlementPeriod}`, valueColor: "blue" });
  }
  if (hasText(summary.settlementNote)) {
    items.push({ label: "Settlement Note", value: summary.settlementNote, valueColor: "black" });
  }
  if (hasText(summary.clientType)) {
    // Label rename 2026-05-12: "Client Type" -> "Traffic Type".
    // Data key (`clientType`) intentionally unchanged so existing
    // payloads keep working. See decisions.md.
    items.push({ label: "Traffic Type", value: summary.clientType, valueColor: "black" });
  }
  if (hasText(summary.restrictedJurisdictions)) {
    items.push({ label: "Restricted Jurisdictions", value: summary.restrictedJurisdictions, valueColor: "orange" });
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
      items.push({ label: item.label, value: rendered, valueColor: termColor("blue", rendered) });
    }
  });

  if (hasPositiveNumber(summary.rollingReservePercent) && hasPositiveNumber(summary.rollingReserveHoldDays)) {
    items.push({
      label: "Rolling Reserve",
      value: `${formatPercent(summary.rollingReservePercent)} · ${Math.round(summary.rollingReserveHoldDays)} days`,
      valueColor: "orange"
    });
  }

  const reserveCapLabel = resolveModeValue(
    modes.rollingReserveCap,
    summary.rollingReserveCap !== null && hasPositiveNumber(summary.rollingReserveCap)
      ? formatEuroInteger(summary.rollingReserveCap)
      : ""
  );
  if (hasText(reserveCapLabel)) {
    items.push({ label: "Rolling Reserve Cap", value: reserveCapLabel, valueColor: termColor("blue", reserveCapLabel) });
  }

  // User-added custom rows append after the built-in ones. Each row
  // carries its own colour choice in `valueColor` so the renderer can
  // emit the matching .terms-value-{blue|black|orange} class. Empty
  // entries (no label and no value) are dropped — typical when the
  // user added a slot but hasn't filled it in yet.
  const customItems = summary.customTermsItems ?? [];
  customItems.forEach(custom => {
    if (!hasText(custom.label) && !hasText(custom.value)) return;
    items.push({
      label: custom.label,
      value: custom.value,
      valueColor: custom.color
    });
  });

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

  // Universal layout — no compact preset (removed 2026-05-30).
  const sectionClass = "offer-section";

  return `<section class="${sectionClass}">
    ${renderSectionHeader(4, "Terms & Limitations", "GLOBAL")}
    ${renderTermsGrid(items)}
  </section>`;
}

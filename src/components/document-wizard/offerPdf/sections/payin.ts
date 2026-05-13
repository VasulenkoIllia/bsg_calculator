import { escapeHtml } from "../../../../shared/html.js";
import { renderSectionHeader } from "../../pdf-kit/primitives.js";
import type {
  DocumentTemplatePayload,
  DocumentWizardLayout,
  PayinCustomRow
} from "../../types.js";
import {
  formatEuro,
  formatPayinModel,
  formatPercent,
  formatTierRangeLabel,
  hasPositiveNumber
} from "../formatters.js";
import { tierColorClass } from "../tierColor.js";

type PayinPricingRegion = DocumentTemplatePayload["payinPricing"]["eu"];
type PayinRegionCode = "eu" | "ww";

interface PayinRegionContext {
  code: PayinRegionCode;
  label: string;
  pricing: PayinPricingRegion;
}

// MIN. TRANSACTION FEE cell rendering. Three possible outcomes:
//   - { kind: "value" }: render two stacked lines, e.g. "≤2.5M: €1.00" /
//     ">2.5M: N/A"
//   - { kind: "na" }: render the literal string "N/A" (user toggled the
//     N/A flag for that region)
//   - null: cell stays empty; if no region returns a non-null value the
//     whole column is hidden by the global hide-if-empty rule
type MinFeeRender =
  | { kind: "value"; primary: string; secondary: string }
  | { kind: "na" };

function formatPayinMinTransactionFee(
  data: DocumentTemplatePayload,
  region: PayinRegionCode
): MinFeeRender | null {
  const summary = data.contractSummary;

  // N/A toggle wins over numeric values regardless of mode.
  const naFlag =
    region === "eu" ? summary.payoutMinimumFeeEuNa : summary.payoutMinimumFeeWwNa;
  if (naFlag) return { kind: "na" };

  let threshold: number;
  let fee: number;

  if (summary.payoutMinimumFeeMode === "overall") {
    if (
      !hasPositiveNumber(summary.payoutMinimumFeeThresholdMillion) ||
      !hasPositiveNumber(summary.payoutMinimumFeePerTransaction)
    ) {
      return null;
    }
    threshold = summary.payoutMinimumFeeThresholdMillion;
    fee = summary.payoutMinimumFeePerTransaction;
  } else {
    threshold =
      region === "eu"
        ? summary.payoutMinimumFeeEuThresholdMillion
        : summary.payoutMinimumFeeWwThresholdMillion;
    fee =
      region === "eu"
        ? summary.payoutMinimumFeeEuPerTransaction
        : summary.payoutMinimumFeeWwPerTransaction;

    if (!hasPositiveNumber(threshold) || !hasPositiveNumber(fee)) {
      return null;
    }
  }

  const thresholdLabel = `${threshold.toLocaleString("en-US")}M`;
  return {
    kind: "value",
    primary: `≤${thresholdLabel}: ${formatEuro(fee)}`,
    secondary: `>${thresholdLabel}: N/A`
  };
}

// Per-custom-row MIN. TRANSACTION FEE renderer. Custom rows store their
// own threshold/fee/N/A toggle (see `PayinCustomRow.minTrxFee*`) instead
// of reading the global `contractSummary.payoutMinimumFee*` values.
// Same `MinFeeRender` union as standard regions so `renderMinFeeCell`
// (below) can format both consistently.
function formatCustomRowMinTransactionFee(
  row: PayinCustomRow
): MinFeeRender | null {
  if (row.minTrxFeeRowNa) return { kind: "na" };
  const threshold = row.minTrxFeeThresholdMillion;
  const fee = row.minTrxFeePerTransaction;
  if (!hasPositiveNumber(threshold) || !hasPositiveNumber(fee)) {
    return null;
  }
  const thresholdLabel = `${threshold.toLocaleString("en-US")}M`;
  return {
    kind: "value",
    primary: `≤${thresholdLabel}: ${formatEuro(fee)}`,
    secondary: `>${thresholdLabel}: N/A`
  };
}

function renderMinFeeCell(minFee: MinFeeRender | null): string {
  if (!minFee) return "";
  if (minFee.kind === "na") {
    // Gray "N/A" so it visually de-emphasises against numeric fees.
    return `<span class="cell-line value-na">N/A</span>`;
  }
  // The secondary line always reads ">X: N/A" by definition (above
  // the threshold the min fee no longer applies). The whole line —
  // including the ">X:" prefix — is rendered in the muted gray so
  // any line containing N/A reads consistently.
  return `<span class="cell-line">${escapeHtml(minFee.primary)}</span><span class="cell-line value-na">${escapeHtml(
    minFee.secondary
  )}</span>`;
}

// Render the TRANSACTION FEE cell content. Each fee (C/D and APM) is
// independently controlled by its own N/A toggle. Active numeric values
// take `valueColorClass` (default = first-tier blue for non-tiered;
// tiered branch passes tier-color-N). "N/A" rows always switch to the
// muted `.value-na` class so the cell reads "not applicable" in gray.
function renderTrxFeeCell(
  block: { trxCc: number; trxCcNa: boolean; trxApm: number; trxApmNa: boolean },
  trxFeeEnabled: boolean,
  valueColorClass: string = "tier-color-1"
): string {
  if (!trxFeeEnabled) return "";
  const ccClass = block.trxCcNa ? "cell-line value-na" : `cell-line ${valueColorClass}`;
  const apmClass = block.trxApmNa ? "cell-line value-na" : `cell-line ${valueColorClass}`;
  const ccLabel = block.trxCcNa ? "N/A" : formatEuro(block.trxCc);
  const apmLabel = block.trxApmNa ? "N/A" : formatEuro(block.trxApm);
  return `<span class="${ccClass}">C/D: ${escapeHtml(
    ccLabel
  )}</span><span class="${apmClass}">APM: ${escapeHtml(apmLabel)}</span>`;
}

function resolvePayinRegionContexts(
  data: DocumentTemplatePayload,
  layout: DocumentWizardLayout
): PayinRegionContext[] {
  const contexts: PayinRegionContext[] = [];

  if (layout.payin.regionMode === "both" || layout.payin.regionMode === "euOnly") {
    contexts.push({ code: "eu", label: "EEA + UK", pricing: data.payinPricing.eu });
  }
  if (layout.payin.regionMode === "both" || layout.payin.regionMode === "wwOnly") {
    contexts.push({ code: "ww", label: "Global", pricing: data.payinPricing.ww });
  }

  if (contexts.length === 0) {
    contexts.push({ code: "eu", label: "Global", pricing: data.payinPricing.eu });
  }

  return contexts;
}

function hasAnyPayinMinFee(data: DocumentTemplatePayload, layout: DocumentWizardLayout): boolean {
  const regions = resolvePayinRegionContexts(data, layout);
  if (regions.some(region => formatPayinMinTransactionFee(data, region.code) !== null)) {
    return true;
  }
  // Custom rows can independently contribute a MIN. TRX FEE value
  // (each row has its own threshold/fee/N/A toggle — see
  // `formatCustomRowMinTransactionFee`). If at least one custom row
  // produces a non-null render, the column must stay visible for the
  // whole table.
  const customRows = data.payinPricing.customRows ?? [];
  return customRows.some(row => formatCustomRowMinTransactionFee(row) !== null);
}

function buildPayinRows(
  data: DocumentTemplatePayload,
  layout: DocumentWizardLayout,
  showMinFeeColumn: boolean
): string {
  const methodLabel = "Credit / Debit - Visa, Mastercard";
  const apmLabel = "APM - Apple & Google pay";
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
        // Per-tier colour class shared by tier label, model name and
        // trx-fee values in this row. MDR percent stays plain so it
        // reads as black on every tier.
        const tierColor = tierColorClass(index);

        rows.push(`<tr>
          ${
            showRegionColumn
              ? `<td class="cell-region">● ${escapeHtml(region.label)}</td>`
              : ""
          }
          <td><span class="cell-line">${escapeHtml(methodLabel)}</span><span class="cell-line cell-subtitle">${escapeHtml(
            apmLabel
          )}</span></td>
          <td>EUR</td>
          ${showTierColumn ? `<td class="${tierColor}">${escapeHtml(tierLabel)}</td>` : ""}
          <td><span class="cell-line ${tierColor}">${escapeHtml(formatPayinModel(region.pricing.model))}</span><span class="cell-line">${escapeHtml(
            formatPercent(tier.mdrPercent)
          )}</span></td>
          <td>${renderTrxFeeCell(tier, region.pricing.trxFeeEnabled, tierColor)}</td>
          ${showMinFeeColumn ? `<td>${renderMinFeeCell(minFee)}</td>` : ""}
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
      <td><span class="cell-line">${escapeHtml(methodLabel)}</span><span class="cell-line cell-subtitle">${escapeHtml(
        apmLabel
      )}</span></td>
      <td>EUR</td>
      ${showTierColumn ? "<td>Non-tiered, fixed</td>" : ""}
      <td><span class="cell-line tier-color-1">${escapeHtml(formatPayinModel(region.pricing.model))}</span><span class="cell-line">${escapeHtml(
        formatPercent(region.pricing.single.mdrPercent)
      )}</span></td>
      <td>${renderTrxFeeCell(region.pricing.single, region.pricing.trxFeeEnabled)}</td>
      ${showMinFeeColumn ? `<td>${renderMinFeeCell(minFee)}</td>` : ""}
    </tr>`);
  });

  // Custom rows (2026-05-14 feature). Appended after the standard
  // regions. Each custom row uses the same tier-color logic and N/A
  // handling as standard rows. METHODS column is intentionally
  // hardcoded to the same default text (operator decision — methods
  // text is not editable on custom rows; product confirmed).
  // CURRENCY and REGION labels are taken from the row, MIN. TRX FEE
  // is rendered from per-row threshold/fee/N/A toggle (not the global
  // contractSummary values used by standard regions).
  const customRows = data.payinPricing.customRows ?? [];
  customRows.forEach(customRow => {
    const tiersActive = showTierColumn && customRow.rateMode === "tiered";
    const customMinFee = formatCustomRowMinTransactionFee(customRow);
    const regionCell = showRegionColumn
      ? `<td class="cell-region">● ${escapeHtml(customRow.region)}</td>`
      : "";
    const currencyCell = `<td>${escapeHtml(customRow.currency)}</td>`;
    const methodsCell = `<td><span class="cell-line">${escapeHtml(methodLabel)}</span><span class="cell-line cell-subtitle">${escapeHtml(apmLabel)}</span></td>`;
    const minFeeCell = showMinFeeColumn ? `<td>${renderMinFeeCell(customMinFee)}</td>` : "";

    if (tiersActive) {
      customRow.tiers.forEach((tier, index) => {
        const tierLabel = formatTierRangeLabel(
          index as 0 | 1 | 2,
          customRow.tier1UpToMillion,
          customRow.tier2UpToMillion
        );
        const tierColor = tierColorClass(index);
        rows.push(`<tr>
          ${regionCell}
          ${methodsCell}
          ${currencyCell}
          ${showTierColumn ? `<td class="${tierColor}">${escapeHtml(tierLabel)}</td>` : ""}
          <td><span class="cell-line ${tierColor}">${escapeHtml(formatPayinModel(customRow.model))}</span><span class="cell-line">${escapeHtml(
            formatPercent(tier.mdrPercent)
          )}</span></td>
          <td>${renderTrxFeeCell(tier, customRow.trxFeeEnabled, tierColor)}</td>
          ${minFeeCell}
        </tr>`);
      });
      return;
    }

    rows.push(`<tr>
      ${regionCell}
      ${methodsCell}
      ${currencyCell}
      ${showTierColumn ? "<td>Non-tiered, fixed</td>" : ""}
      <td><span class="cell-line tier-color-1">${escapeHtml(formatPayinModel(customRow.model))}</span><span class="cell-line">${escapeHtml(
        formatPercent(customRow.single.mdrPercent)
      )}</span></td>
      <td>${renderTrxFeeCell(customRow.single, customRow.trxFeeEnabled)}</td>
      ${minFeeCell}
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
  // Hide-if-empty rule: drop the MIN. TRANSACTION FEE column entirely when no
  // region has a configured threshold/fee pair to display.
  const showMinFeeColumn = hasAnyPayinMinFee(data, layout);

  const payinRows = buildPayinRows(data, layout, showMinFeeColumn);

  // Auto-compact heuristic. Total row count drives whether the
  // section gets the `.compact` class (smaller padding + font in
  // CSS). Calibrated so the worst-case fill (6 rows: tiered + both
  // regions) fits inside one A4 page alongside the document header
  // and the page-repeating footer reservation.
  const regions = resolvePayinRegionContexts(data, layout);
  const customRows = data.payinPricing.customRows ?? [];
  // Each region contributes 3 rows if the table is tiered, else 1.
  // Custom rows are per-row tiered/single — a tiered custom row also
  // expands to 3 PDF rows, while a single-rate custom row stays at 1.
  const standardRowCount = regions.length * (showTierColumn ? 3 : 1);
  const customRowCount = customRows.reduce(
    (total, row) => total + (row.rateMode === "tiered" ? 3 : 1),
    0
  );
  const totalRows = standardRowCount + customRowCount;
  const isCompact = totalRows >= 4 || (totalRows >= 2 && hasPayinCustomNote(data));
  const sectionClass = `offer-section${isCompact ? " compact" : ""}`;

  // The section returns ONLY the section element. The custom note (if
  // any) is emitted by the orchestrator as a separate sibling so it
  // can live in its own <tr> in the page-layout table — that lets
  // Chrome break the (potentially long) note across pages without
  // dragging the section's avoid-break rule down with it. See
  // buildPayinCustomNoteHtml and buildOfferBodyRows.
  return `<section class="${sectionClass}">
    ${renderSectionHeader(1, "Card Acquiring — Credit / Debit Cards, APM & E-wallet", showTierColumn ? "VOLUME TIERED" : "FIXED RATE")}
    <table>
      <thead>
        <tr>
          ${showRegionColumn ? '<th class="col-region">REGION</th>' : ""}
          <th class="col-methods">METHODS</th>
          <th class="col-currency">CURRENCY</th>
          ${showTierColumn ? '<th class="col-tier">MONTHLY VOLUME TIER</th>' : ""}
          <th class="col-mdr">MDR / RATE</th>
          <th class="col-trxfee">TRANSACTION FEE</th>
          ${showMinFeeColumn ? '<th class="col-minfee">MIN. TRANSACTION FEE</th>' : ""}
        </tr>
      </thead>
      <tbody>${payinRows}</tbody>
    </table>
  </section>`;
}

// Single source of truth for "is the payin section custom note
// active?". Used by the auto-compact heuristic in buildPayinSection
// and by the renderer below.
export function hasPayinCustomNote(data: DocumentTemplatePayload): boolean {
  return (
    data.contractSummary.payinCustomNoteEnabled &&
    data.contractSummary.payinCustomNoteText.trim().length > 0
  );
}

// Returns the standalone <p class="section-custom-note"> for the
// payin section, or an empty string when the toggle is off / text is
// blank. The orchestrator wraps this in its own <tr> so the note's
// flow does not interfere with the section's page-break behaviour.
export function buildPayinCustomNoteHtml(data: DocumentTemplatePayload): string {
  if (!hasPayinCustomNote(data)) return "";
  return `<p class="section-custom-note">${escapeHtml(data.contractSummary.payinCustomNoteText)}</p>`;
}

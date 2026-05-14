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

// Module-level constants for the METHODS column text. Standard rows
// (section 1) and custom rows (section 1.1) both render the same two
// hardcoded lines (per product decision — no per-row override). Kept
// in one place so a future product change is a one-line edit instead
// of two parallel string literals that can drift (as nearly happened
// in commits 9de2533 → e7ac0e7).
const PAYIN_METHOD_LABEL = "Credit / Debit - Visa, Mastercard";
const PAYIN_APM_LABEL = "APM - Apple Pay, Google Pay";

// Tier-index tuple — used both to drive the section-1 / section-1.1
// per-tier rendering loops and to satisfy the
// `[PayinFeeBlock, PayinFeeBlock, PayinFeeBlock]` tuple shape without
// an `as 0|1|2` cast on `.forEach`'s `index` parameter.
const TIER_INDICES = [0, 1, 2] as const;

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

// Whether section 1 (standard regions only) has any MIN. TRX FEE to
// show. Section 1.1 (custom rows) has its own independent decision —
// see `hasAnyCustomRowMinFee` below. Splitting the predicates means
// the two sections can independently hide the MIN. TRX FEE column.
function hasAnyPayinMinFee(data: DocumentTemplatePayload, layout: DocumentWizardLayout): boolean {
  const regions = resolvePayinRegionContexts(data, layout);
  return regions.some(region => formatPayinMinTransactionFee(data, region.code) !== null);
}

// Same predicate but for the Additional Card Acquiring section (1.1).
// Takes the rows array directly so the caller (which already extracted
// it from `data.payinPricing.customRows ?? []`) doesn't have to drill
// through the payload a second time.
function hasAnyCustomRowMinFee(customRows: ReadonlyArray<PayinCustomRow>): boolean {
  return customRows.some(row => formatCustomRowMinTransactionFee(row) !== null);
}

// Single source of truth for "is the payin block in compact preset?".
//
// Used by both section 1 (`buildPayinSection`) and section 1.1
// (`buildPayinAdditionalSection`) so they always carry the same
// `.compact` class. This matters because the `.col-*` widths in
// styles.ts are CALIBRATED FOR THE COMPACT FONT (8.5pt) — at the
// default 9pt non-compact size, "APM - Apple Pay, Google Pay" no
// longer fits the 30% METHODS column and wraps. If section 1 is
// compact (font 8.5pt, APM line fits) and section 1.1 is not
// (font 9pt, APM line wraps), the two visually-identical sections
// render with different row heights and wrapping. Mirroring section
// 1's decision into 1.1 guarantees visual parity.
//
// The compact rule is driven by section 1's row budget only:
//   - >= 4 standard rows (e.g. tiered + both regions = 6 rows)
//   - OR >= 2 rows AND a payin custom note (the note adds vertical
//     pressure that would otherwise push section 2 off page 1)
// Section 1.1's own row count is NOT a separate trigger — we want
// 1.1 to match section 1 exactly, even when 1.1 has many rows and
// section 1 has few. (In practice the orchestrator force-page-breaks
// 1.1 to page 2 on heavy payin, so 1.1's own height rarely matters
// for page 1's budget.)
function resolvePayinCompact(
  data: DocumentTemplatePayload,
  layout: DocumentWizardLayout
): boolean {
  if (!data.calculatorType.payin) return false;
  const showTierColumn =
    layout.payin.tableMode === "byRegionTiered" ||
    layout.payin.tableMode === "flatTiered";
  const regions = resolvePayinRegionContexts(data, layout);
  const totalRows = regions.length * (showTierColumn ? 3 : 1);
  return totalRows >= 4 || (totalRows >= 2 && hasPayinCustomNote(data));
}

function buildPayinRows(
  data: DocumentTemplatePayload,
  layout: DocumentWizardLayout,
  showMinFeeColumn: boolean
): string {
  const showRegionColumn = layout.payin.tableMode === "byRegionTiered" || layout.payin.tableMode === "byRegionFlat";
  const showTierColumn = layout.payin.tableMode === "byRegionTiered" || layout.payin.tableMode === "flatTiered";

  const regions = resolvePayinRegionContexts(data, layout);

  const rows: string[] = [];

  regions.forEach(region => {
    const tiersActive = showTierColumn && region.pricing.rateMode === "tiered";

    if (tiersActive) {
      TIER_INDICES.forEach(index => {
        const tier = region.pricing.tiers[index];
        const tierLabel = formatTierRangeLabel(
          index,
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
          <td><span class="cell-line">${escapeHtml(PAYIN_METHOD_LABEL)}</span><span class="cell-line cell-subtitle">${escapeHtml(
            PAYIN_APM_LABEL
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
      <td><span class="cell-line">${escapeHtml(PAYIN_METHOD_LABEL)}</span><span class="cell-line cell-subtitle">${escapeHtml(
        PAYIN_APM_LABEL
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

  // Auto-compact preset. See `resolvePayinCompact` above for the rule.
  // Section 1.1 reads the SAME helper so both sections render with
  // identical font / padding / column-wrapping.
  const isCompact = resolvePayinCompact(data, layout);
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

// ────────────────────────────────────────────────────────────────
// Section 1.1 — Additional Card Acquiring (custom rows only)
//
// Operator-added ad-hoc rows live in their own section to keep
// section 1's calibration intact (6-row worst case + 3-4 line note
// on page 1) and to give the orchestrator a clean break point —
// the orchestrator sets `breakBefore` on this section when payin
// is heavy so the additional rows land on page 2 instead of
// stretching section 1 beyond its budget.
//
// The section is visually identical to section 1: same column
// widths, same `tier-color-*` classes, same MIN. TRX FEE rendering.
// The only visible difference is the "1.1" index badge and the
// "Additional Card Acquiring" title. METHODS column is hardcoded
// with the same default text as section 1 (Q1=A — no per-row
// METHODS override).
// ────────────────────────────────────────────────────────────────

function buildPayinAdditionalRows(
  customRows: ReadonlyArray<PayinCustomRow>,
  showTierColumn: boolean,
  showMinFeeColumn: boolean
): string {
  const rows: string[] = [];

  customRows.forEach(customRow => {
    const tiersActive = showTierColumn && customRow.rateMode === "tiered";
    const customMinFee = formatCustomRowMinTransactionFee(customRow);
    const regionCell = `<td class="cell-region">● ${escapeHtml(customRow.region)}</td>`;
    const currencyCell = `<td>${escapeHtml(customRow.currency)}</td>`;
    const methodsCell = `<td><span class="cell-line">${escapeHtml(PAYIN_METHOD_LABEL)}</span><span class="cell-line cell-subtitle">${escapeHtml(PAYIN_APM_LABEL)}</span></td>`;
    const minFeeCell = showMinFeeColumn ? `<td>${renderMinFeeCell(customMinFee)}</td>` : "";

    if (tiersActive) {
      TIER_INDICES.forEach(index => {
        const tier = customRow.tiers[index];
        const tierLabel = formatTierRangeLabel(
          index,
          customRow.tier1UpToMillion,
          customRow.tier2UpToMillion
        );
        const tierColor = tierColorClass(index);
        rows.push(`<tr>
          ${regionCell}
          ${methodsCell}
          ${currencyCell}
          <td class="${tierColor}">${escapeHtml(tierLabel)}</td>
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

export function buildPayinAdditionalSection(
  data: DocumentTemplatePayload,
  layout: DocumentWizardLayout
): string {
  if (!data.calculatorType.payin) {
    return "";
  }
  const customRows = data.payinPricing.customRows ?? [];
  if (customRows.length === 0) {
    return "";
  }

  // Section 1.1 has its own column-visibility decisions independent
  // of section 1: MONTHLY VOLUME TIER column shows when any custom
  // row is tiered, MIN. TRX FEE column shows when at least one
  // custom row produces a non-null min-fee render.
  const showTierColumn = customRows.some(row => row.rateMode === "tiered");
  const showMinFeeColumn = hasAnyCustomRowMinFee(customRows);

  const additionalRows = buildPayinAdditionalRows(customRows, showTierColumn, showMinFeeColumn);

  // VISUAL PARITY RULE (2026-05-14): section 1.1 inherits section 1's
  // compact state via `resolvePayinCompact`. Reason: the `.col-*`
  // widths in styles.ts are calibrated for the compact font (8.5pt).
  // If section 1 ended up compact (e.g. 6 tiered rows) but 1.1 came
  // in non-compact (e.g. 1 tiered custom row → 3 PDF rows < 4
  // threshold), the two sections rendered with different row heights
  // and the METHODS column would wrap differently in 1.1 ("Google" /
  // "Pay" split onto two lines). Mirroring section 1's decision —
  // and dropping 1.1's own independent threshold — guarantees the
  // two sections always look identical.
  const isCompact = resolvePayinCompact(data, layout);
  const sectionClass = `offer-section${isCompact ? " compact" : ""}`;

  // REGION column is always shown for 1.1 (custom rows always have a
  // free-form region label). Currency column also always shown.
  return `<section class="${sectionClass}">
    ${renderSectionHeader("1.1", "Additional Card Acquiring — Credit / Debit Cards, APM & E-wallet", showTierColumn ? "VOLUME TIERED" : "FIXED RATE")}
    <table>
      <thead>
        <tr>
          <th class="col-region">REGION</th>
          <th class="col-methods">METHODS</th>
          <th class="col-currency">CURRENCY</th>
          ${showTierColumn ? '<th class="col-tier">MONTHLY VOLUME TIER</th>' : ""}
          <th class="col-mdr">MDR / RATE</th>
          <th class="col-trxfee">TRANSACTION FEE</th>
          ${showMinFeeColumn ? '<th class="col-minfee">MIN. TRANSACTION FEE</th>' : ""}
        </tr>
      </thead>
      <tbody>${additionalRows}</tbody>
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

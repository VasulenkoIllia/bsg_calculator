import { MiniToggle, NumberField } from "../../../calculator/index.js";
import { makeDefaultPayinCustomRow } from "../../seedHelpers.js";
import type { DocumentTemplatePayload, PayinCustomRow, PayinRegionMode } from "../../types.js";
import {
  FeeFieldWithNa,
  PAYIN_REGION_LABELS,
  type PayinRegionKey,
  resolveEnabledPayinRegionMode,
  resolvePayinTableMode,
  SectionCustomNoteCard,
  StepNavigation,
  ToggleCheckbox
} from "../shared.js";

function PayinRegionEditor({
  region,
  draft,
  onDraftChange
}: {
  region: PayinRegionKey;
  draft: DocumentTemplatePayload;
  onDraftChange: (next: DocumentTemplatePayload) => void;
}) {
  const regionLabel = PAYIN_REGION_LABELS[region];
  const pricing = draft.payinPricing[region];

  const updatePricing = (
    updater: (
      current: DocumentTemplatePayload["payinPricing"][PayinRegionKey]
    ) => DocumentTemplatePayload["payinPricing"][PayinRegionKey]
  ) => {
    const nextPricing = updater(pricing);
    const tableMode = resolvePayinTableMode(
      draft.layout.payin.regionMode,
      region === "eu" ? nextPricing.rateMode : draft.payinPricing.eu.rateMode,
      region === "ww" ? nextPricing.rateMode : draft.payinPricing.ww.rateMode
    );

    onDraftChange({
      ...draft,
      payinPricing: {
        ...draft.payinPricing,
        [region]: nextPricing
      },
      layout: {
        ...draft.layout,
        payin: {
          ...draft.layout.payin,
          tableMode
        }
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-base font-bold text-slate-800">{regionLabel} Pricing</h4>
      <div className="mt-3 grid gap-4">
        <div>
          <span className="field-label">Pricing Model</span>
          <div className="flex flex-wrap gap-2">
            <MiniToggle
              label="IC++"
              selected={pricing.model === "icpp"}
              onSelect={() => updatePricing(current => ({ ...current, model: "icpp" }))}
              ariaLabel={`${regionLabel} model IC++`}
            />
            <MiniToggle
              label="Blended"
              selected={pricing.model === "blended"}
              onSelect={() => updatePricing(current => ({ ...current, model: "blended" }))}
              ariaLabel={`${regionLabel} model blended`}
            />
          </div>
        </div>

        <ToggleCheckbox
          checked={pricing.trxFeeEnabled}
          onChange={enabled =>
            updatePricing(current => ({ ...current, trxFeeEnabled: enabled }))
          }
          label="TRX fee enabled"
        />

        <div>
          <span className="field-label">Rate Type</span>
          <div className="flex flex-wrap gap-2">
            <MiniToggle
              label="Single"
              selected={pricing.rateMode === "single"}
              onSelect={() => updatePricing(current => ({ ...current, rateMode: "single" }))}
              ariaLabel={`${regionLabel} single rate`}
            />
            <MiniToggle
              label="Tiered"
              selected={pricing.rateMode === "tiered"}
              onSelect={() => updatePricing(current => ({ ...current, rateMode: "tiered" }))}
              ariaLabel={`${regionLabel} tiered rate`}
            />
          </div>
        </div>

        {/*
          NOTE: Dedicated Countries (UK + Switzerland) is calculator-only.
          It used to mirror into this wizard step but was removed on
          2026-05-12 — the feature changes the calculator's internal
          scheme-fee math only and is never reflected in the OFFER PDF.
          The control lives exclusively in
          `src/components/calculator/zones/zone3/PayinRegionPricingPanel.tsx`.
        */}

        {pricing.rateMode === "single" ? (
          <div className="grid gap-3 md:grid-cols-3">
            <NumberField
              label="MDR (%)"
              value={pricing.single.mdrPercent}
              onChange={value =>
                updatePricing(current => ({
                  ...current,
                  single: { ...current.single, mdrPercent: value }
                }))
              }
              min={0}
              max={10}
              step={0.05}
            />
            <FeeFieldWithNa
              label="TRX C/D (€)"
              value={pricing.single.trxCc}
              na={pricing.single.trxCcNa}
              onValueChange={value =>
                updatePricing(current => ({
                  ...current,
                  single: { ...current.single, trxCc: value }
                }))
              }
              onNaChange={na =>
                updatePricing(current => ({
                  ...current,
                  single: { ...current.single, trxCcNa: na }
                }))
              }
              min={0}
              step={0.01}
              ariaPrefix={`payin-${region}-single-cc`}
            />
            <FeeFieldWithNa
              label="TRX APM (€)"
              value={pricing.single.trxApm}
              na={pricing.single.trxApmNa}
              onValueChange={value =>
                updatePricing(current => ({
                  ...current,
                  single: { ...current.single, trxApm: value }
                }))
              }
              onNaChange={na =>
                updatePricing(current => ({
                  ...current,
                  single: { ...current.single, trxApmNa: na }
                }))
              }
              min={0}
              step={0.01}
              ariaPrefix={`payin-${region}-single-apm`}
            />
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <NumberField
                label="Tier 1 Up To (M)"
                value={pricing.tier1UpToMillion}
                onChange={value =>
                  updatePricing(current => ({
                    ...current,
                    tier1UpToMillion: value,
                    tier2UpToMillion: Math.max(value, current.tier2UpToMillion)
                  }))
                }
                min={0}
                max={25}
                step={1}
              />
              <NumberField
                label="Tier 2 Up To (M)"
                value={pricing.tier2UpToMillion}
                onChange={value =>
                  updatePricing(current => ({
                    ...current,
                    tier2UpToMillion: Math.max(value, current.tier1UpToMillion)
                  }))
                }
                min={pricing.tier1UpToMillion}
                max={25}
                step={1}
              />
            </div>
            <div className="grid gap-3">
              {pricing.tiers.map((tier, index) => (
                <div
                  key={`wizard-payin-${region}-tier-${index}`}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <p className="text-sm font-bold text-slate-700">Tier {index + 1}</p>
                  <div className="mt-2 grid gap-3 md:grid-cols-3">
                    <NumberField
                      label="MDR (%)"
                      value={tier.mdrPercent}
                      onChange={value =>
                        updatePricing(current => ({
                          ...current,
                          tiers: current.tiers.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, mdrPercent: value } : item
                          ) as typeof current.tiers
                        }))
                      }
                      min={0}
                      max={10}
                      step={0.05}
                    />
                    <FeeFieldWithNa
                      label="TRX C/D (€)"
                      value={tier.trxCc}
                      na={tier.trxCcNa}
                      onValueChange={value =>
                        updatePricing(current => ({
                          ...current,
                          tiers: current.tiers.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, trxCc: value } : item
                          ) as typeof current.tiers
                        }))
                      }
                      onNaChange={na =>
                        updatePricing(current => ({
                          ...current,
                          tiers: current.tiers.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, trxCcNa: na } : item
                          ) as typeof current.tiers
                        }))
                      }
                      min={0}
                      step={0.01}
                      ariaPrefix={`payin-${region}-tier-${index}-cc`}
                    />
                    <FeeFieldWithNa
                      label="TRX APM (€)"
                      value={tier.trxApm}
                      na={tier.trxApmNa}
                      onValueChange={value =>
                        updatePricing(current => ({
                          ...current,
                          tiers: current.tiers.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, trxApm: value } : item
                          ) as typeof current.tiers
                        }))
                      }
                      onNaChange={na =>
                        updatePricing(current => ({
                          ...current,
                          tiers: current.tiers.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, trxApmNa: na } : item
                          ) as typeof current.tiers
                        }))
                      }
                      min={0}
                      step={0.01}
                      ariaPrefix={`payin-${region}-tier-${index}-apm`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Custom Payin Rows editor (added 2026-05-14).
//
// Operator-driven feature for ad-hoc rows that don't fit the standard
// EU / Global region split (e.g. "Russia bundle", "Crypto rails").
// Each row appears at the END of the Payin table in the OFFER PDF.
//
// Shape of `PayinCustomRow` mirrors the standard region pricing block
// (`PayinFeeBlock` for `single` + `tiers`) so the PDF renderer reuses
// the same tier-colour logic and N/A handling without special-casing.
// Free-form fields (REGION + CURRENCY + MIN.TRX FEE inputs) are
// per-row; METHODS column is hardcoded by the renderer to match
// standard rows (no per-row override — confirmed product decision).
// ────────────────────────────────────────────────────────────────

interface PayinCustomRowCardProps {
  row: PayinCustomRow;
  index: number;
  onPatch: (patch: Partial<PayinCustomRow>) => void;
  onPatchSingle: (patch: Partial<PayinCustomRow["single"]>) => void;
  onPatchTier: (
    tierIndex: 0 | 1 | 2,
    patch: Partial<PayinCustomRow["tiers"][number]>
  ) => void;
  onDelete: () => void;
}

function PayinCustomRowCard({
  row,
  index,
  onPatch,
  onPatchSingle,
  onPatchTier,
  onDelete
}: PayinCustomRowCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-base font-bold text-slate-800">Custom row #{index + 1}</h4>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
          aria-label={`Delete custom payin row ${index + 1}`}
        >
          Delete
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <span className="field-label">Region (free-form)</span>
          <input
            className="field-input"
            type="text"
            value={row.region}
            onChange={event => onPatch({ region: event.target.value })}
            aria-label={`Custom row ${index + 1} region label`}
          />
        </div>
        <div>
          <span className="field-label">Currency</span>
          <input
            className="field-input"
            type="text"
            value={row.currency}
            onChange={event => onPatch({ currency: event.target.value })}
            aria-label={`Custom row ${index + 1} currency`}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <span className="field-label">Pricing Model</span>
          <div className="flex flex-wrap gap-2">
            <MiniToggle
              label="IC++"
              selected={row.model === "icpp"}
              onSelect={() => onPatch({ model: "icpp" })}
              ariaLabel={`Custom row ${index + 1} model IC++`}
            />
            <MiniToggle
              label="Blended"
              selected={row.model === "blended"}
              onSelect={() => onPatch({ model: "blended" })}
              ariaLabel={`Custom row ${index + 1} model blended`}
            />
          </div>
        </div>
        <div>
          <span className="field-label">Rate Type</span>
          <div className="flex flex-wrap gap-2">
            <MiniToggle
              label="Single"
              selected={row.rateMode === "single"}
              onSelect={() => onPatch({ rateMode: "single" })}
              ariaLabel={`Custom row ${index + 1} single rate`}
            />
            <MiniToggle
              label="Tiered"
              selected={row.rateMode === "tiered"}
              onSelect={() => onPatch({ rateMode: "tiered" })}
              ariaLabel={`Custom row ${index + 1} tiered`}
            />
          </div>
        </div>
      </div>

      <div className="mt-3">
        <ToggleCheckbox
          checked={row.trxFeeEnabled}
          onChange={enabled => onPatch({ trxFeeEnabled: enabled })}
          label="TRX fee enabled"
        />
      </div>

      {row.rateMode === "single" ? (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <NumberField
            label="MDR (%)"
            value={row.single.mdrPercent}
            onChange={value => onPatchSingle({ mdrPercent: value })}
            min={0}
            max={10}
            step={0.05}
          />
          <FeeFieldWithNa
            label="TRX C/D (€)"
            value={row.single.trxCc}
            na={row.single.trxCcNa}
            onValueChange={value => onPatchSingle({ trxCc: value })}
            onNaChange={na => onPatchSingle({ trxCcNa: na })}
            min={0}
            step={0.01}
            ariaPrefix={`payin-custom-${index}-single-cc`}
          />
          <FeeFieldWithNa
            label="TRX APM (€)"
            value={row.single.trxApm}
            na={row.single.trxApmNa}
            onValueChange={value => onPatchSingle({ trxApm: value })}
            onNaChange={na => onPatchSingle({ trxApmNa: na })}
            min={0}
            step={0.01}
            ariaPrefix={`payin-custom-${index}-single-apm`}
          />
        </div>
      ) : (
        <>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <NumberField
              label="Tier 1 Up To (M)"
              value={row.tier1UpToMillion}
              onChange={value =>
                onPatch({
                  tier1UpToMillion: value,
                  tier2UpToMillion: Math.max(value, row.tier2UpToMillion)
                })
              }
              min={0}
              max={25}
              step={1}
            />
            <NumberField
              label="Tier 2 Up To (M)"
              value={row.tier2UpToMillion}
              onChange={value =>
                onPatch({
                  tier2UpToMillion: Math.max(value, row.tier1UpToMillion)
                })
              }
              min={row.tier1UpToMillion}
              max={25}
              step={1}
            />
          </div>
          <div className="mt-3 grid gap-3">
            {([0, 1, 2] as const).map(tierIndex => {
              const tier = row.tiers[tierIndex];
              return (
                <div
                  key={`payin-custom-${index}-tier-${tierIndex}`}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <p className="text-sm font-bold text-slate-700">Tier {tierIndex + 1}</p>
                  <div className="mt-2 grid gap-3 md:grid-cols-3">
                    <NumberField
                      label="MDR (%)"
                      value={tier.mdrPercent}
                      onChange={value => onPatchTier(tierIndex, { mdrPercent: value })}
                      min={0}
                      max={10}
                      step={0.05}
                    />
                    <FeeFieldWithNa
                      label="TRX C/D (€)"
                      value={tier.trxCc}
                      na={tier.trxCcNa}
                      onValueChange={value => onPatchTier(tierIndex, { trxCc: value })}
                      onNaChange={na => onPatchTier(tierIndex, { trxCcNa: na })}
                      min={0}
                      step={0.01}
                      ariaPrefix={`payin-custom-${index}-tier-${tierIndex}-cc`}
                    />
                    <FeeFieldWithNa
                      label="TRX APM (€)"
                      value={tier.trxApm}
                      na={tier.trxApmNa}
                      onValueChange={value => onPatchTier(tierIndex, { trxApm: value })}
                      onNaChange={na => onPatchTier(tierIndex, { trxApmNa: na })}
                      min={0}
                      step={0.01}
                      ariaPrefix={`payin-custom-${index}-tier-${tierIndex}-apm`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-700">MIN. TRANSACTION FEE</p>
          <ToggleCheckbox
            checked={row.minTrxFeeRowNa}
            onChange={na => onPatch({ minTrxFeeRowNa: na })}
            label="Show as N/A"
          />
        </div>
        {!row.minTrxFeeRowNa ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <NumberField
              label="Threshold (M)"
              value={row.minTrxFeeThresholdMillion}
              onChange={value => onPatch({ minTrxFeeThresholdMillion: value })}
              min={0}
              step={0.1}
            />
            <NumberField
              label="Fee per transaction (€)"
              value={row.minTrxFeePerTransaction}
              onChange={value => onPatch({ minTrxFeePerTransaction: value })}
              min={0}
              step={0.01}
            />
          </div>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">
          {row.minTrxFeeRowNa
            ? "Renders the muted N/A label in the OFFER PDF column."
            : "Renders ≤Xm: €Y / >Xm: N/A in the OFFER PDF column. Leave both fields at 0 to hide the column for this row."}
        </p>
      </div>
    </div>
  );
}

function PayinCustomRowsEditor({
  draft,
  onDraftChange
}: {
  draft: DocumentTemplatePayload;
  onDraftChange: (next: DocumentTemplatePayload) => void;
}) {
  const customRows = draft.payinPricing.customRows ?? [];

  // Single chokepoint that writes a new `customRows` array back into
  // the draft. Custom rows live in their own section 1.1 in the PDF
  // (see `buildPayinAdditionalSection`), so they do NOT influence
  // section 1's tableMode — no tableMode recomputation needed when
  // a custom row toggles between single ↔ tiered.
  const updateCustomRows = (nextRows: PayinCustomRow[]) => {
    onDraftChange({
      ...draft,
      payinPricing: {
        ...draft.payinPricing,
        customRows: nextRows
      }
    });
  };

  const patchRow = (rowIndex: number, patch: Partial<PayinCustomRow>) => {
    const next = customRows.map((row, idx) =>
      idx === rowIndex ? { ...row, ...patch } : row
    );
    updateCustomRows(next);
  };

  const patchSingle = (
    rowIndex: number,
    patch: Partial<PayinCustomRow["single"]>
  ) => {
    const next = customRows.map((row, idx) =>
      idx === rowIndex ? { ...row, single: { ...row.single, ...patch } } : row
    );
    updateCustomRows(next);
  };

  const patchTier = (
    rowIndex: number,
    tierIndex: 0 | 1 | 2,
    patch: Partial<PayinCustomRow["tiers"][number]>
  ) => {
    const next = customRows.map((row, idx) => {
      if (idx !== rowIndex) return row;
      const nextTiers = row.tiers.map((tier, ti) =>
        ti === tierIndex ? { ...tier, ...patch } : tier
      ) as PayinCustomRow["tiers"];
      return { ...row, tiers: nextTiers };
    });
    updateCustomRows(next);
  };

  const addRow = () => {
    updateCustomRows([...customRows, makeDefaultPayinCustomRow()]);
  };

  const deleteRow = (rowIndex: number) => {
    updateCustomRows(customRows.filter((_, idx) => idx !== rowIndex));
  };

  // Render directly from the live array — `PayinCustomRowCard` is a
  // pure-read component; every `onPatch*` callback below produces a
  // brand-new array via `.map` / `.filter` and calls `updateCustomRows`
  // which immutably reassigns. No deep clone needed.

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-base font-bold text-slate-800">Custom Payin Rows</h4>
          <p className="mt-1 text-xs text-slate-500">
            Optional extra rows appended to the Card Acquiring table after the
            standard regions. Use for one-off pricing arrangements (e.g.
            specific country bundles or alternative rails).
          </p>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 hover:bg-blue-100"
          aria-label="Add a custom Payin row"
        >
          + Add custom row
        </button>
      </div>

      {customRows.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
          No custom rows. Click "+ Add custom row" to add one.
        </p>
      ) : (
        <div className="mt-3 grid gap-4">
          {customRows.map((row, idx) => (
            <PayinCustomRowCard
              key={row.id}
              row={row}
              index={idx}
              onPatch={patch => patchRow(idx, patch)}
              onPatchSingle={patch => patchSingle(idx, patch)}
              onPatchTier={(tierIndex, patch) => patchTier(idx, tierIndex, patch)}
              onDelete={() => deleteRow(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PayinStep({
  draft,
  onDraftChange,
  onBack,
  onNext
}: {
  draft: DocumentTemplatePayload;
  onDraftChange: (next: DocumentTemplatePayload) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const payinEnabled = draft.calculatorType.payin;
  const regionMode = draft.layout.payin.regionMode;
  const euVisible = payinEnabled && (regionMode === "both" || regionMode === "euOnly");
  const wwVisible = payinEnabled && (regionMode === "both" || regionMode === "wwOnly");

  const setPayinEnabled = (enabled: boolean) => {
    const nextRegionMode = enabled
      ? resolveEnabledPayinRegionMode(regionMode, draft.payin.euPercent, draft.payin.wwPercent)
      : "none";

    onDraftChange({
      ...draft,
      calculatorType: {
        ...draft.calculatorType,
        payin: enabled
      },
      layout: {
        ...draft.layout,
        payin: {
          regionMode: nextRegionMode,
          tableMode: resolvePayinTableMode(
            nextRegionMode,
            draft.payinPricing.eu.rateMode,
            draft.payinPricing.ww.rateMode
          )
        }
      }
    });
  };

  const setRegionMode = (nextRegionMode: PayinRegionMode) => {
    onDraftChange({
      ...draft,
      layout: {
        ...draft.layout,
        payin: {
          regionMode: nextRegionMode,
          tableMode: resolvePayinTableMode(
            nextRegionMode,
            draft.payinPricing.eu.rateMode,
            draft.payinPricing.ww.rateMode
          )
        }
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-slate-900">Step 2. Payin</h3>
      <p className="mt-1 text-sm text-slate-600">
        Confirm region structure and rates transferred from calculator.
      </p>

      <div className="mt-4 grid gap-4">
        <ToggleCheckbox
          checked={payinEnabled}
          onChange={setPayinEnabled}
          label="Enable Payin Section"
        />

        {payinEnabled ? (
          <div>
            <span className="field-label">Region Split</span>
            <div className="flex flex-wrap gap-2">
              <MiniToggle
                label="EU + Global"
                selected={regionMode === "both"}
                onSelect={() => setRegionMode("both")}
                ariaLabel="Payin regions EU and Global"
              />
              <MiniToggle
                label="EU only"
                selected={regionMode === "euOnly"}
                onSelect={() => setRegionMode("euOnly")}
                ariaLabel="Payin region EU only"
              />
              <MiniToggle
                label="Global only"
                selected={regionMode === "wwOnly"}
                onSelect={() => setRegionMode("wwOnly")}
                ariaLabel="Payin region Global only"
              />
            </div>
          </div>
        ) : null}

        {euVisible ? (
          <PayinRegionEditor region="eu" draft={draft} onDraftChange={onDraftChange} />
        ) : null}
        {wwVisible ? (
          <PayinRegionEditor region="ww" draft={draft} onDraftChange={onDraftChange} />
        ) : null}

        <SectionCustomNoteCard
          title="Payin Section Note"
          description="Free-form note rendered in muted gray under the Card Acquiring (Payin) table in the OFFER PDF."
          enabled={draft.contractSummary.payinCustomNoteEnabled}
          text={draft.contractSummary.payinCustomNoteText}
          onEnabledChange={enabled =>
            onDraftChange({
              ...draft,
              contractSummary: {
                ...draft.contractSummary,
                payinCustomNoteEnabled: enabled
              }
            })
          }
          onTextChange={text =>
            onDraftChange({
              ...draft,
              contractSummary: {
                ...draft.contractSummary,
                payinCustomNoteText: text
              }
            })
          }
          ariaPrefix="Payin section note"
        />

        {payinEnabled ? (
          <PayinCustomRowsEditor draft={draft} onDraftChange={onDraftChange} />
        ) : null}
      </div>

      <StepNavigation
        onBack={onBack}
        onNext={onNext}
        backLabel="Back: Step 1"
        nextLabel="Next: Step 3 (Payout)"
      />
    </div>
  );
}

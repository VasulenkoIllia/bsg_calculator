import { MiniToggle, NumberField } from "../../../calculator/index.js";
import type { DocumentWizardTemplateData, PayinRegionMode } from "../../types.js";
import {
  PAYIN_REGION_LABELS,
  type PayinRegionKey,
  resolveEnabledPayinRegionMode,
  resolvePayinTableMode,
  StepNavigation
} from "../shared.js";

function PayinRegionEditor({
  region,
  draft,
  onDraftChange
}: {
  region: PayinRegionKey;
  draft: DocumentWizardTemplateData;
  onDraftChange: (next: DocumentWizardTemplateData) => void;
}) {
  const regionLabel = PAYIN_REGION_LABELS[region];
  const pricing = draft.payinPricing[region];

  const updatePricing = (
    updater: (
      current: DocumentWizardTemplateData["payinPricing"][PayinRegionKey]
    ) => DocumentWizardTemplateData["payinPricing"][PayinRegionKey]
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

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          <input
            className="h-4 w-4 accent-blue-600"
            type="checkbox"
            checked={pricing.trxFeeEnabled}
            onChange={event =>
              updatePricing(current => ({ ...current, trxFeeEnabled: event.target.checked }))
            }
          />
          TRX fee enabled
        </label>

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
            <NumberField
              label="TRX C/D (€)"
              value={pricing.single.trxCc}
              onChange={value =>
                updatePricing(current => ({
                  ...current,
                  single: { ...current.single, trxCc: value }
                }))
              }
              min={0}
              step={0.01}
            />
            <NumberField
              label="TRX APM (€)"
              value={pricing.single.trxApm}
              onChange={value =>
                updatePricing(current => ({
                  ...current,
                  single: { ...current.single, trxApm: value }
                }))
              }
              min={0}
              step={0.01}
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
                    <NumberField
                      label="TRX C/D (€)"
                      value={tier.trxCc}
                      onChange={value =>
                        updatePricing(current => ({
                          ...current,
                          tiers: current.tiers.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, trxCc: value } : item
                          ) as typeof current.tiers
                        }))
                      }
                      min={0}
                      step={0.01}
                    />
                    <NumberField
                      label="TRX APM (€)"
                      value={tier.trxApm}
                      onChange={value =>
                        updatePricing(current => ({
                          ...current,
                          tiers: current.tiers.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, trxApm: value } : item
                          ) as typeof current.tiers
                        }))
                      }
                      min={0}
                      step={0.01}
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

export function PayinStep({
  draft,
  onDraftChange,
  onBack,
  onNext
}: {
  draft: DocumentWizardTemplateData;
  onDraftChange: (next: DocumentWizardTemplateData) => void;
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
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          <input
            className="h-4 w-4 accent-blue-600"
            type="checkbox"
            checked={payinEnabled}
            onChange={event => setPayinEnabled(event.target.checked)}
          />
          Enable Payin Section
        </label>

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

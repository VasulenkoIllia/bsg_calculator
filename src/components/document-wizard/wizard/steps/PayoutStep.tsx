import { MiniToggle, NumberField } from "../../../calculator/index.js";
import type { DocumentTemplatePayload } from "../../types.js";
import { StepNavigation } from "../shared.js";

export function PayoutStep({
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
  const payoutEnabled = draft.calculatorType.payout;
  const pricing = draft.payoutPricing;

  const updatePricing = (
    updater: (current: DocumentTemplatePayload["payoutPricing"]) => DocumentTemplatePayload["payoutPricing"]
  ) => {
    const nextPricing = updater(pricing);
    onDraftChange({
      ...draft,
      payoutPricing: nextPricing,
      layout: {
        ...draft.layout,
        payout: {
          regionMode: payoutEnabled ? "global" : "none",
          tableMode: nextPricing.rateMode === "tiered" ? "globalTiered" : "globalFlat"
        }
      }
    });
  };

  const setPayoutEnabled = (enabled: boolean) => {
    onDraftChange({
      ...draft,
      calculatorType: {
        ...draft.calculatorType,
        payout: enabled
      },
      layout: {
        ...draft.layout,
        payout: {
          regionMode: enabled ? "global" : "none",
          tableMode: draft.payoutPricing.rateMode === "tiered" ? "globalTiered" : "globalFlat"
        }
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-slate-900">Step 3. Payout</h3>
      <p className="mt-1 text-sm text-slate-600">
        Payout in this flow is global-only; confirm rate mode and values.
      </p>

      <div className="mt-4 grid gap-4">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          <input
            className="h-4 w-4 accent-blue-600"
            type="checkbox"
            checked={payoutEnabled}
            onChange={event => setPayoutEnabled(event.target.checked)}
          />
          Enable Payout Section
        </label>

        {payoutEnabled ? (
          <>
            <div>
              <span className="field-label">Rate Type</span>
              <div className="flex flex-wrap gap-2">
                <MiniToggle
                  label="Single"
                  selected={pricing.rateMode === "single"}
                  onSelect={() => updatePricing(current => ({ ...current, rateMode: "single" }))}
                  ariaLabel="Payout single rate"
                />
                <MiniToggle
                  label="Tiered"
                  selected={pricing.rateMode === "tiered"}
                  onSelect={() => updatePricing(current => ({ ...current, rateMode: "tiered" }))}
                  ariaLabel="Payout tiered rate"
                />
              </div>
            </div>

            {pricing.rateMode === "single" ? (
              <div className="grid gap-3 md:grid-cols-2">
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
                  max={5}
                  step={0.05}
                />
                <NumberField
                  label="TRX Fee (€)"
                  value={pricing.single.trxFee}
                  onChange={value =>
                    updatePricing(current => ({
                      ...current,
                      single: { ...current.single, trxFee: value }
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
                      key={`wizard-payout-tier-${index}`}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <p className="text-sm font-bold text-slate-700">Tier {index + 1}</p>
                      <div className="mt-2 grid gap-3 md:grid-cols-2">
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
                          max={5}
                          step={0.05}
                        />
                        <NumberField
                          label="TRX Fee (€)"
                          value={tier.trxFee}
                          onChange={value =>
                            updatePricing(current => ({
                              ...current,
                              tiers: current.tiers.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, trxFee: value } : item
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
          </>
        ) : null}
      </div>

      <StepNavigation
        onBack={onBack}
        onNext={onNext}
        backLabel="Back: Step 2"
        nextLabel="Next: Step 4 (Other Fees)"
      />
    </div>
  );
}

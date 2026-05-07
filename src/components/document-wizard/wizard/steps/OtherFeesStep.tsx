import { MiniToggle, NumberField } from "../../../calculator/index.js";
import type { DocumentTemplatePayload } from "../../types.js";
import { FeeFieldWithNa, StepNavigation } from "../shared.js";

export function OtherFeesStep({
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
  const updateContractSummary = (
    patch: Partial<DocumentTemplatePayload["contractSummary"]>
  ) => {
    onDraftChange({
      ...draft,
      contractSummary: {
        ...draft.contractSummary,
        ...patch
      }
    });
  };

  const updateToggles = (patch: Partial<DocumentTemplatePayload["toggles"]>) => {
    onDraftChange({
      ...draft,
      toggles: {
        ...draft.toggles,
        ...patch
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-slate-900">Step 4. Other Services & Fees</h3>
      <p className="mt-1 text-sm text-slate-600">
        These values control cards in section 3 and fee visibility in the final PDF.
      </p>

      <div className="mt-4 grid gap-4">
        {draft.calculatorType.payout ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                className="h-4 w-4 accent-blue-600"
                type="checkbox"
                checked={draft.toggles.payoutMinimumFeeEnabled}
                onChange={event =>
                  updateToggles({ payoutMinimumFeeEnabled: event.target.checked })
                }
              />
              Payout Minimum Fee (Per Transaction)
            </label>
            <div className="mt-3">
              <FeeFieldWithNa
                label="Minimum Fee per Transaction (€)"
                value={draft.toggles.payoutMinimumFeePerTransaction}
                na={draft.toggles.payoutMinimumFeePerTransactionNa}
                onValueChange={value =>
                  updateToggles({ payoutMinimumFeePerTransaction: Math.max(0, value) })
                }
                onNaChange={na => updateToggles({ payoutMinimumFeePerTransactionNa: na })}
                min={0}
                step={0.1}
                ariaPrefix="payout-min-fee"
              />
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-800">Contract Summary Fees</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <NumberField
              label="Account Setup Fee (€)"
              value={draft.contractSummary.accountSetupFee}
              onChange={value => updateContractSummary({ accountSetupFee: value })}
              min={0}
              step={1}
            />
            <NumberField
              label="Refund Cost (€)"
              value={draft.contractSummary.refundCost}
              onChange={value => updateContractSummary({ refundCost: value })}
              min={0}
              step={0.01}
            />
            <NumberField
              label="Dispute / Chargeback Cost (€)"
              value={draft.contractSummary.disputeCost}
              onChange={value => updateContractSummary({ disputeCost: value })}
              min={0}
              step={0.01}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input
              className="h-4 w-4 accent-blue-600"
              type="checkbox"
              checked={draft.toggles.threeDsEnabled}
              onChange={event => updateToggles({ threeDsEnabled: event.target.checked })}
            />
            3D Secure (3DS)
          </label>
          <div className="mt-3">
            <NumberField
              label="3DS Fee per successful transaction (€)"
              value={draft.toggles.threeDsRevenuePerSuccessfulTransaction}
              onChange={value =>
                updateToggles({
                  threeDsRevenuePerSuccessfulTransaction: value
                })
              }
              min={0}
              step={0.01}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input
              className="h-4 w-4 accent-blue-600"
              type="checkbox"
              checked={draft.toggles.settlementIncluded}
              onChange={event => updateToggles({ settlementIncluded: event.target.checked })}
            />
            Settlement Included in Pricing
          </label>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                className="h-4 w-4 accent-blue-600"
                type="checkbox"
                checked={draft.toggles.settlementFeeEnabled}
                onChange={event => updateToggles({ settlementFeeEnabled: event.target.checked })}
                disabled={draft.toggles.settlementIncluded}
              />
              Settlement Fee Enabled
            </label>
            <NumberField
              label="Settlement Rate (%)"
              value={draft.toggles.settlementFeeRatePercent}
              onChange={value => updateToggles({ settlementFeeRatePercent: value })}
              min={0}
              max={2}
              step={0.01}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input
              className="h-4 w-4 accent-blue-600"
              type="checkbox"
              checked={draft.toggles.monthlyMinimumFeeEnabled}
              onChange={event => updateToggles({ monthlyMinimumFeeEnabled: event.target.checked })}
            />
            Monthly Minimum Fee
          </label>
          <div className="mt-3">
            <NumberField
              label="Minimum Monthly Revenue (€)"
              value={draft.toggles.monthlyMinimumFeeAmount}
              onChange={value => updateToggles({ monthlyMinimumFeeAmount: value })}
              min={0}
              step={1}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input
              className="h-4 w-4 accent-blue-600"
              type="checkbox"
              checked={draft.toggles.failedTrxEnabled}
              onChange={event => updateToggles({ failedTrxEnabled: event.target.checked })}
            />
            Failed TRX Charging
          </label>
          <div className="mt-3 grid gap-3">
            <div>
              <span className="field-label">Charging Mode</span>
              <div className="flex flex-wrap gap-2">
                <MiniToggle
                  label="Over limit only"
                  selected={draft.toggles.failedTrxMode === "overLimitOnly"}
                  onSelect={() => updateToggles({ failedTrxMode: "overLimitOnly" })}
                  ariaLabel="Failed trx mode over limit only"
                />
                <MiniToggle
                  label="All failed volume"
                  selected={draft.toggles.failedTrxMode === "allFailedVolume"}
                  onSelect={() => updateToggles({ failedTrxMode: "allFailedVolume" })}
                  ariaLabel="Failed trx mode all failed volume"
                />
              </div>
            </div>
            <NumberField
              label="Over Limit Threshold (%)"
              value={draft.toggles.failedTrxOverLimitThresholdPercent}
              onChange={value => updateToggles({ failedTrxOverLimitThresholdPercent: value })}
              min={0}
              max={100}
              step={1}
            />
          </div>
        </div>
      </div>

      <StepNavigation
        onBack={onBack}
        onNext={onNext}
        backLabel="Back: Step 3"
        nextLabel="Next: Step 5 (Terms)"
      />
    </div>
  );
}

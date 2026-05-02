import { MiniToggle, NumberField } from "../../../calculator/index.js";
import type { DocumentTemplatePayload } from "../../types.js";
import { parseNullableNumber, SETTLEMENT_PERIOD_OPTIONS, StepNavigation } from "../shared.js";

export function TermsStep({
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

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-slate-900">Step 5. Terms & Limitations</h3>
      <p className="mt-1 text-sm text-slate-600">
        Terms block controls section 4 in generated PDF.
      </p>

      <div className="mt-4 grid gap-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="block">
            <span className="field-label">Settlement Period</span>
            <select
              className="field-input"
              value={draft.contractSummary.settlementPeriod}
              onChange={event => updateContractSummary({ settlementPeriod: event.target.value })}
            >
              {SETTLEMENT_PERIOD_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-800">Legal Terms (rendered in Section 4)</p>
          <p className="mt-1 text-xs text-slate-500">
            Defaults match the standard BSG offer template. Edit per contract if a clause needs to differ.
          </p>
          <div className="mt-3 grid gap-3">
            <label>
              <span className="field-label">Settlement Note</span>
              <input
                className="field-input"
                type="text"
                value={draft.contractSummary.settlementNote}
                onChange={event => updateContractSummary({ settlementNote: event.target.value })}
                aria-label="Settlement note"
              />
            </label>
            <label>
              <span className="field-label">Client Type</span>
              <input
                className="field-input"
                type="text"
                value={draft.contractSummary.clientType}
                onChange={event => updateContractSummary({ clientType: event.target.value })}
                aria-label="Client type"
              />
            </label>
            <label>
              <span className="field-label">Restricted Jurisdictions</span>
              <input
                className="field-input"
                type="text"
                value={draft.contractSummary.restrictedJurisdictions}
                onChange={event =>
                  updateContractSummary({ restrictedJurisdictions: event.target.value })
                }
                aria-label="Restricted jurisdictions"
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-800">Transaction Limits</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <NumberField
              label="Min. Collection Transaction Size (€)"
              value={draft.contractSummary.collectionLimitMin}
              onChange={value => updateContractSummary({ collectionLimitMin: value })}
              min={0}
              step={1}
            />
            <NumberField
              label="Max. Collection Transaction Size (€)"
              value={draft.contractSummary.collectionLimitMax}
              onChange={value => updateContractSummary({ collectionLimitMax: value })}
              min={0}
              step={1}
            />
            <NumberField
              label="Min. Payout Transaction Size (€)"
              value={draft.contractSummary.payoutLimitMin}
              onChange={value => updateContractSummary({ payoutLimitMin: value })}
              min={0}
              step={1}
            />
            <label>
              <span className="field-label">Max. Payout Transaction Size (€) (optional)</span>
              <input
                className="field-input"
                type="text"
                inputMode="decimal"
                value={draft.contractSummary.payoutLimitMax ?? ""}
                onChange={event =>
                  updateContractSummary({ payoutLimitMax: parseNullableNumber(event.target.value) })
                }
                aria-label="Max payout transaction size"
                placeholder="leave empty to hide in calculator mode"
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-800">Rolling Reserve</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <NumberField
              label="Reserve Percent (%)"
              value={draft.contractSummary.rollingReservePercent}
              onChange={value => updateContractSummary({ rollingReservePercent: value })}
              min={0}
              max={100}
              step={1}
            />
            <NumberField
              label="Hold Days"
              value={draft.contractSummary.rollingReserveHoldDays}
              onChange={value => updateContractSummary({ rollingReserveHoldDays: value })}
              min={0}
              step={1}
            />
            <label>
              <span className="field-label">Reserve Cap (€) (optional)</span>
              <input
                className="field-input"
                type="text"
                inputMode="decimal"
                value={draft.contractSummary.rollingReserveCap ?? ""}
                onChange={event =>
                  updateContractSummary({ rollingReserveCap: parseNullableNumber(event.target.value) })
                }
                aria-label="Rolling reserve cap"
                placeholder="leave empty to hide in calculator mode"
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-800">Payin Minimum Fee Contract Mode</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <MiniToggle
              label="Overall"
              selected={draft.contractSummary.payoutMinimumFeeMode === "overall"}
              onSelect={() => updateContractSummary({ payoutMinimumFeeMode: "overall" })}
              ariaLabel="Payin minimum fee overall mode"
            />
            <MiniToggle
              label="By Region"
              selected={draft.contractSummary.payoutMinimumFeeMode === "byRegion"}
              onSelect={() => updateContractSummary({ payoutMinimumFeeMode: "byRegion" })}
              ariaLabel="Payin minimum fee by region mode"
            />
          </div>

          {draft.contractSummary.payoutMinimumFeeMode === "overall" ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <NumberField
                label="Threshold (M)"
                value={draft.contractSummary.payoutMinimumFeeThresholdMillion}
                onChange={value => updateContractSummary({ payoutMinimumFeeThresholdMillion: value })}
                min={0}
                step={0.1}
              />
              <NumberField
                label="Fee per transaction (€)"
                value={draft.contractSummary.payoutMinimumFeePerTransaction}
                onChange={value => updateContractSummary({ payoutMinimumFeePerTransaction: value })}
                min={0}
                step={0.01}
              />
            </div>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <NumberField
                label="EU Threshold (M)"
                value={draft.contractSummary.payoutMinimumFeeEuThresholdMillion}
                onChange={value =>
                  updateContractSummary({ payoutMinimumFeeEuThresholdMillion: value })
                }
                min={0}
                step={0.1}
              />
              <NumberField
                label="EU Fee per transaction (€)"
                value={draft.contractSummary.payoutMinimumFeeEuPerTransaction}
                onChange={value => updateContractSummary({ payoutMinimumFeeEuPerTransaction: value })}
                min={0}
                step={0.01}
              />
              <NumberField
                label="WW Threshold (M)"
                value={draft.contractSummary.payoutMinimumFeeWwThresholdMillion}
                onChange={value =>
                  updateContractSummary({ payoutMinimumFeeWwThresholdMillion: value })
                }
                min={0}
                step={0.1}
              />
              <NumberField
                label="WW Fee per transaction (€)"
                value={draft.contractSummary.payoutMinimumFeeWwPerTransaction}
                onChange={value => updateContractSummary({ payoutMinimumFeeWwPerTransaction: value })}
                min={0}
                step={0.01}
              />
            </div>
          )}
        </div>
      </div>

      <StepNavigation
        onBack={onBack}
        onNext={onNext}
        backLabel="Back: Step 4"
        nextLabel="Next: Step 6 (Preview)"
      />
    </div>
  );
}

import { MiniToggle, NumberField } from "../../../calculator/index.js";
import type { DocumentTemplatePayload } from "../../types.js";
import {
  FeeFieldWithNa,
  FeeModeNote,
  makeValueModeUpdater,
  StepNavigation,
  ToggleCheckbox
} from "../shared.js";

// The six section-3 fee cards that share the uniform Value / Waived /
// N/A mode selector + custom note. Keys match DocumentWizardValueModes
// AND DocumentWizardFeeNotes so a fee's mode + note line up.
type FeeKey =
  | "accountSetupFee"
  | "refundCost"
  | "disputeCost"
  | "threeDsFee"
  | "settlementFee"
  | "monthlyMinimumFee";

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

  const updateMode = makeValueModeUpdater(draft, onDraftChange);
  const updateFeeNote = (key: FeeKey, text: string) =>
    onDraftChange({
      ...draft,
      feeNotes: { ...(draft.feeNotes ?? {}), [key]: text }
    });

  // FAILED TRANSACTION CHARGING has its own memo (feeNotes.failedTrx),
  // separate from the six Value/Waived/N/A fees above.
  const updateFailedTrxNote = (text: string) =>
    onDraftChange({
      ...draft,
      feeNotes: { ...(draft.feeNotes ?? {}), failedTrx: text }
    });

  // Uniform Value / Waived / N/A selector + custom note for one fee.
  const renderFeeModeNote = (key: FeeKey, notePlaceholder?: string) => (
    <FeeModeNote
      mode={draft.valueModes?.[key] ?? "value"}
      onModeChange={mode => updateMode(key, mode)}
      note={draft.feeNotes?.[key] ?? ""}
      onNoteChange={text => updateFeeNote(key, text)}
      ariaPrefix={key}
      notePlaceholder={notePlaceholder}
    />
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-slate-900">Step 4. Other Services & Fees</h3>
      <p className="mt-1 text-sm text-slate-600">
        These values control cards in section 3 and fee visibility in the final PDF.
      </p>

      <div className="mt-4 grid gap-4">
        {draft.calculatorType.payout ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <ToggleCheckbox
              checked={draft.toggles.payoutMinimumFeeEnabled}
              onChange={enabled => updateToggles({ payoutMinimumFeeEnabled: enabled })}
              label="Payout Minimum Fee (Per Transaction)"
            />
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
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div>
              <NumberField
                label="Account Setup Fee (€)"
                value={draft.contractSummary.accountSetupFee}
                onChange={value => updateContractSummary({ accountSetupFee: value })}
                min={0}
                step={1}
              />
              {renderFeeModeNote("accountSetupFee")}
            </div>
            <div>
              <NumberField
                label="Refund Cost (€)"
                value={draft.contractSummary.refundCost}
                onChange={value => updateContractSummary({ refundCost: value })}
                min={0}
                step={0.01}
              />
              {renderFeeModeNote("refundCost")}
            </div>
            <div>
              <NumberField
                label="Dispute / Chargeback Cost (€)"
                value={draft.contractSummary.disputeCost}
                onChange={value => updateContractSummary({ disputeCost: value })}
                min={0}
                step={0.01}
              />
              {renderFeeModeNote("disputeCost")}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <ToggleCheckbox
            checked={draft.toggles.threeDsEnabled}
            onChange={enabled => updateToggles({ threeDsEnabled: enabled })}
            label="3D Secure (3DS)"
          />
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
          {renderFeeModeNote("threeDsFee")}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <ToggleCheckbox
            checked={draft.toggles.settlementIncluded}
            onChange={enabled => updateToggles({ settlementIncluded: enabled })}
            label="Settlement Included in Pricing"
          />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <ToggleCheckbox
              checked={draft.toggles.settlementFeeEnabled}
              onChange={enabled => updateToggles({ settlementFeeEnabled: enabled })}
              label="Settlement Fee Enabled"
              disabled={draft.toggles.settlementIncluded}
            />
            <NumberField
              label="Settlement Rate (%)"
              value={draft.toggles.settlementFeeRatePercent}
              onChange={value => updateToggles({ settlementFeeRatePercent: value })}
              min={0}
              max={2}
              step={0.01}
            />
          </div>
          {renderFeeModeNote("settlementFee")}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <ToggleCheckbox
            checked={draft.toggles.monthlyMinimumFeeEnabled}
            onChange={enabled => updateToggles({ monthlyMinimumFeeEnabled: enabled })}
            label="Monthly Minimum Fee"
          />
          <div className="mt-3">
            <NumberField
              label="Minimum Monthly Revenue (€)"
              value={draft.toggles.monthlyMinimumFeeAmount}
              onChange={value => updateToggles({ monthlyMinimumFeeAmount: value })}
              min={0}
              step={1}
            />
          </div>
          {renderFeeModeNote(
            "monthlyMinimumFee",
            "· NA if processing volume is over 1M /mo"
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <ToggleCheckbox
            checked={draft.toggles.failedTrxEnabled}
            onChange={enabled => updateToggles({ failedTrxEnabled: enabled })}
            label="Failed TRX Charging"
          />
          {draft.toggles.failedTrxEnabled ? (
            <div className="mt-3 grid gap-3">
              <div>
                <span className="field-label">Charging Mode</span>
                <div className="flex flex-wrap gap-2">
                  <MiniToggle
                    label="Free"
                    selected={draft.toggles.failedTrxMode === "free"}
                    onSelect={() => updateToggles({ failedTrxMode: "free" })}
                    ariaLabel="Failed trx mode free"
                  />
                  <MiniToggle
                    label="Under limit only"
                    selected={draft.toggles.failedTrxMode === "overLimitOnly"}
                    onSelect={() => updateToggles({ failedTrxMode: "overLimitOnly" })}
                    ariaLabel="Failed trx mode over limit only"
                  />
                  <MiniToggle
                    label="All Failed volume"
                    selected={draft.toggles.failedTrxMode === "allFailedVolume"}
                    onSelect={() => updateToggles({ failedTrxMode: "allFailedVolume" })}
                    ariaLabel="Failed trx mode all failed volume"
                  />
                </div>
              </div>
              {draft.toggles.failedTrxMode === "overLimitOnly" ? (
                <NumberField
                  label="Under Limit Threshold (%)"
                  value={draft.toggles.failedTrxOverLimitThresholdPercent}
                  onChange={value => updateToggles({ failedTrxOverLimitThresholdPercent: value })}
                  min={0}
                  max={100}
                  step={1}
                />
              ) : null}
              {/* Raw input (not the shared FeeModeNote): Failed TRX has
                  its own on/off + 3-mode selector above, so it doesn't
                  use the Value/Waived/N/A control the six other fees do. */}
              <div>
                <span className="field-label">Memo (optional)</span>
                <input
                  className="field-input"
                  type="text"
                  value={draft.feeNotes?.failedTrx ?? ""}
                  onChange={event => updateFailedTrxNote(event.target.value)}
                  placeholder="Custom note rendered under the card value"
                  aria-label="Failed trx memo"
                />
              </div>
            </div>
          ) : null}
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

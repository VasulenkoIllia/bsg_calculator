import { MiniToggle, NumberField } from "../../../../calculator/index.js";
import type { DocumentTemplatePayload } from "../../../types.js";

// Step 5 → Payin Minimum Fee Contract Mode card. Picks Overall vs By
// Region, exposes the threshold/fee inputs (with a region-aware lock
// rule), and the per-region "show as N/A" checkboxes.
//
// Lock rule:
//   - overall mode: shared inputs lock when BOTH region NA flags are on
//   - byRegion mode: each region's pair locks based on its own flag
// "Show … as N/A" checkboxes are never disabled — the user can flip
// them at any time.
export function PayinMinimumFeeSection({
  draft,
  onDraftChange
}: {
  draft: DocumentTemplatePayload;
  onDraftChange: (next: DocumentTemplatePayload) => void;
}) {
  const update = (patch: Partial<DocumentTemplatePayload["contractSummary"]>) =>
    onDraftChange({
      ...draft,
      contractSummary: { ...draft.contractSummary, ...patch }
    });

  const euNa = draft.contractSummary.payoutMinimumFeeEuNa;
  const wwNa = draft.contractSummary.payoutMinimumFeeWwNa;
  const overallLocked = euNa && wwNa;
  const isOverall = draft.contractSummary.payoutMinimumFeeMode === "overall";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-bold text-slate-800">Payin Minimum Fee Contract Mode</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <MiniToggle
          label="Overall"
          selected={isOverall}
          onSelect={() => update({ payoutMinimumFeeMode: "overall" })}
          ariaLabel="Payin minimum fee overall mode"
        />
        <MiniToggle
          label="By Region"
          selected={!isOverall}
          onSelect={() => update({ payoutMinimumFeeMode: "byRegion" })}
          ariaLabel="Payin minimum fee by region mode"
        />
      </div>

      {isOverall ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <NumberField
            label="Threshold (M)"
            value={draft.contractSummary.payoutMinimumFeeThresholdMillion}
            onChange={value => update({ payoutMinimumFeeThresholdMillion: value })}
            min={0}
            step={0.1}
            readOnly={overallLocked}
            helper={
              overallLocked
                ? "Locked — both regions render MIN. TRX FEE as N/A"
                : undefined
            }
          />
          <NumberField
            label="Fee per transaction (€)"
            value={draft.contractSummary.payoutMinimumFeePerTransaction}
            onChange={value => update({ payoutMinimumFeePerTransaction: value })}
            min={0}
            step={0.01}
            readOnly={overallLocked}
            helper={
              overallLocked
                ? "Locked — both regions render MIN. TRX FEE as N/A"
                : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <NumberField
            label="EU Threshold (M)"
            value={draft.contractSummary.payoutMinimumFeeEuThresholdMillion}
            onChange={value => update({ payoutMinimumFeeEuThresholdMillion: value })}
            min={0}
            step={0.1}
            readOnly={euNa}
            helper={euNa ? "Locked — EEA + UK row renders as N/A" : undefined}
          />
          <NumberField
            label="EU Fee per transaction (€)"
            value={draft.contractSummary.payoutMinimumFeeEuPerTransaction}
            onChange={value => update({ payoutMinimumFeeEuPerTransaction: value })}
            min={0}
            step={0.01}
            readOnly={euNa}
            helper={euNa ? "Locked — EEA + UK row renders as N/A" : undefined}
          />
          <NumberField
            label="WW Threshold (M)"
            value={draft.contractSummary.payoutMinimumFeeWwThresholdMillion}
            onChange={value => update({ payoutMinimumFeeWwThresholdMillion: value })}
            min={0}
            step={0.1}
            readOnly={wwNa}
            helper={wwNa ? "Locked — Global row renders as N/A" : undefined}
          />
          <NumberField
            label="WW Fee per transaction (€)"
            value={draft.contractSummary.payoutMinimumFeeWwPerTransaction}
            onChange={value => update({ payoutMinimumFeeWwPerTransaction: value })}
            min={0}
            step={0.01}
            readOnly={wwNa}
            helper={wwNa ? "Locked — Global row renders as N/A" : undefined}
          />
        </div>
      )}

      {/* Per-region "show as N/A" toggles. Independent of mode. */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs font-medium text-slate-600">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-blue-600"
            checked={euNa}
            onChange={event => update({ payoutMinimumFeeEuNa: event.target.checked })}
          />
          Show EEA + UK MIN. TRX FEE as N/A
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-blue-600"
            checked={wwNa}
            onChange={event => update({ payoutMinimumFeeWwNa: event.target.checked })}
          />
          Show Global MIN. TRX FEE as N/A
        </label>
      </div>
    </div>
  );
}

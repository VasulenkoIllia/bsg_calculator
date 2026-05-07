import type { DocumentTemplatePayload, ValueMode } from "../../../types.js";
import { ModedNumericField } from "../../shared.js";

// Step 5 → Transaction Limits card. Four ModedNumericField rows with
// Number / N/A / TBD pickers. Each writes:
//   - the numeric value into contractSummary.{collection,payout}Limit{Min,Max}
//   - the mode into valueModes.{collectionLimitMin, collectionLimitMax,
//     payoutLimitMin, payoutLimitMax}
// Empty + value mode hides the row in the PDF (no auto-defaults).
export function TransactionLimitsSection({
  draft,
  onDraftChange
}: {
  draft: DocumentTemplatePayload;
  onDraftChange: (next: DocumentTemplatePayload) => void;
}) {
  const updateContract = (patch: Partial<DocumentTemplatePayload["contractSummary"]>) =>
    onDraftChange({
      ...draft,
      contractSummary: { ...draft.contractSummary, ...patch }
    });
  const updateMode = (
    key: keyof NonNullable<DocumentTemplatePayload["valueModes"]>,
    mode: ValueMode
  ) =>
    onDraftChange({
      ...draft,
      valueModes: { ...(draft.valueModes ?? {}), [key]: mode }
    });

  const collectionLimitMinMode: ValueMode =
    draft.valueModes?.collectionLimitMin ?? "value";
  const collectionLimitMaxMode: ValueMode =
    draft.valueModes?.collectionLimitMax ?? "value";
  const payoutLimitMinMode: ValueMode = draft.valueModes?.payoutLimitMin ?? "value";
  const payoutLimitMaxMode: ValueMode = draft.valueModes?.payoutLimitMax ?? "value";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-bold text-slate-800">Transaction Limits</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ModedNumericField
          label="Min. Collection Transaction Size (€)"
          value={draft.contractSummary.collectionLimitMin}
          mode={collectionLimitMinMode}
          onValueChange={value => updateContract({ collectionLimitMin: value ?? 0 })}
          onModeChange={mode => updateMode("collectionLimitMin", mode)}
          min={0}
          step={1}
          ariaPrefix="collection-limit-min"
        />
        <ModedNumericField
          label="Max. Collection Transaction Size (€)"
          value={draft.contractSummary.collectionLimitMax}
          mode={collectionLimitMaxMode}
          onValueChange={value => updateContract({ collectionLimitMax: value ?? 0 })}
          onModeChange={mode => updateMode("collectionLimitMax", mode)}
          min={0}
          step={1}
          ariaPrefix="collection-limit-max"
        />
        <ModedNumericField
          label="Min. Payout Transaction Size (€)"
          value={draft.contractSummary.payoutLimitMin}
          mode={payoutLimitMinMode}
          onValueChange={value => updateContract({ payoutLimitMin: value ?? 0 })}
          onModeChange={mode => updateMode("payoutLimitMin", mode)}
          min={0}
          step={1}
          ariaPrefix="payout-limit-min"
        />
        <ModedNumericField
          label="Max. Payout Transaction Size (€)"
          value={draft.contractSummary.payoutLimitMax}
          mode={payoutLimitMaxMode}
          onValueChange={value => updateContract({ payoutLimitMax: value })}
          onModeChange={mode => updateMode("payoutLimitMax", mode)}
          min={0}
          step={1}
          ariaPrefix="payout-limit-max"
        />
      </div>
    </div>
  );
}

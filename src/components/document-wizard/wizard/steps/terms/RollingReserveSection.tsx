import { NumberField } from "../../../../calculator/index.js";
import type { DocumentTemplatePayload, ValueMode } from "../../../types.js";
import { ModedNumericField } from "../../shared.js";

// Step 5 → Rolling Reserve card. Plain percent + days inputs and a
// ModedNumericField for the optional Reserve Cap (Number / N/A / TBD).
export function RollingReserveSection({
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

  const reserveCapMode: ValueMode = draft.valueModes?.rollingReserveCap ?? "value";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-bold text-slate-800">Rolling Reserve</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <NumberField
          label="Reserve Percent (%)"
          value={draft.contractSummary.rollingReservePercent}
          onChange={value => updateContract({ rollingReservePercent: value })}
          min={0}
          max={100}
          step={1}
        />
        <NumberField
          label="Hold Days"
          value={draft.contractSummary.rollingReserveHoldDays}
          onChange={value => updateContract({ rollingReserveHoldDays: value })}
          min={0}
          step={1}
        />
        <ModedNumericField
          label="Reserve Cap (€)"
          value={draft.contractSummary.rollingReserveCap}
          mode={reserveCapMode}
          onValueChange={value => updateContract({ rollingReserveCap: value })}
          onModeChange={mode => updateMode("rollingReserveCap", mode)}
          min={0}
          step={1}
          ariaPrefix="rolling-reserve-cap"
        />
      </div>
    </div>
  );
}

import type { DocumentTemplatePayload } from "../../../types.js";
import { SETTLEMENT_PERIOD_OPTIONS } from "../../shared.js";

// Step 5 → "Settlement Period" + Legal Terms (note / client type /
// restricted jurisdictions). Plain text inputs that map straight onto
// `contractSummary` fields. Splitting Settlement Period out of the
// Legal Terms card matches the original visual grouping.
export function TermsLegalSection({
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

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="block">
          <span className="field-label">Settlement Period</span>
          <select
            className="field-input"
            value={draft.contractSummary.settlementPeriod}
            onChange={event => update({ settlementPeriod: event.target.value })}
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
              onChange={event => update({ settlementNote: event.target.value })}
              aria-label="Settlement note"
            />
          </label>
          <label>
            <span className="field-label">Client Type</span>
            <input
              className="field-input"
              type="text"
              value={draft.contractSummary.clientType}
              onChange={event => update({ clientType: event.target.value })}
              aria-label="Client type"
            />
          </label>
          <label>
            <span className="field-label">Restricted Jurisdictions</span>
            <input
              className="field-input"
              type="text"
              value={draft.contractSummary.restrictedJurisdictions}
              onChange={event => update({ restrictedJurisdictions: event.target.value })}
              aria-label="Restricted jurisdictions"
            />
          </label>
        </div>
      </div>
    </>
  );
}

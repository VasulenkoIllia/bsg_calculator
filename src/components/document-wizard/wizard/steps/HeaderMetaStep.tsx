import type { ChangeEvent } from "react";
import type { DocumentHeaderMetaDraft, DocumentWizardTemplateData } from "../../types.js";
import { StepNavigation } from "../shared.js";

export function HeaderMetaStep({
  draft,
  onDraftChange,
  onRefreshFromCalculator,
  onContinueToPayin,
  onContinueToPreview
}: {
  draft: DocumentWizardTemplateData;
  onDraftChange: (next: DocumentWizardTemplateData) => void;
  onRefreshFromCalculator: () => void;
  onContinueToPayin: () => void;
  onContinueToPreview: () => void;
}) {
  const update = <K extends keyof DocumentHeaderMetaDraft>(
    field: K,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    onDraftChange({
      ...draft,
      header: {
        ...draft.header,
        [field]: event.target.value
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-slate-900">Step 1. Header / Meta</h3>
      <p className="mt-1 text-sm text-slate-600">
        Data is auto-filled from calculator and can be adjusted before PDF generation.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label>
          <span className="field-label">Document Type</span>
          <input
            className="field-input"
            value={draft.header.documentType}
            readOnly
            aria-label="Document Type"
          />
        </label>
        <label>
          <span className="field-label">Document Number</span>
          <input
            className="field-input"
            value={draft.header.documentNumber}
            onChange={event => update("documentNumber", event)}
            aria-label="Document Number"
          />
        </label>
        <label>
          <span className="field-label">Document Date</span>
          <input
            className="field-input"
            type="date"
            value={draft.header.documentDateIso}
            onChange={event => update("documentDateIso", event)}
            aria-label="Document Date"
          />
        </label>
        <label>
          <span className="field-label">Collection Model</span>
          <input
            className="field-input"
            value={draft.header.collectionModel}
            onChange={event => update("collectionModel", event)}
            aria-label="Collection Model"
          />
        </label>
        <label className="md:col-span-2">
          <span className="field-label">Collection Frequency</span>
          <input
            className="field-input"
            value={draft.header.collectionFrequency}
            onChange={event => update("collectionFrequency", event)}
            aria-label="Collection Frequency"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRefreshFromCalculator}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Refill From Calculator
        </button>
        <button
          type="button"
          onClick={onContinueToPreview}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Jump to Preview
        </button>
      </div>

      <StepNavigation onNext={onContinueToPayin} nextLabel="Next: Step 2 (Payin)" />
    </div>
  );
}

import type { ChangeEvent } from "react";
import { DOCUMENT_TYPE_HINTS, DOCUMENT_TYPE_LABELS } from "../../legalDefaults.js";
import type { DocumentScope } from "../../legalDefaults.js";
import type { DocumentHeaderMetaDraft, DocumentTemplatePayload } from "../../types.js";
import { StepNavigation } from "../shared.js";

const SCOPE_VALUES: DocumentScope[] = ["offer", "agreement", "offerAndAgreement"];

export function HeaderMetaStep({
  draft,
  onDraftChange,
  onRefreshFromCalculator,
  onContinueToNext,
  onContinueToPreview,
  nextStepLabel
}: {
  draft: DocumentTemplatePayload;
  onDraftChange: (next: DocumentTemplatePayload) => void;
  onRefreshFromCalculator: () => void;
  onContinueToNext: () => void;
  onContinueToPreview: () => void;
  nextStepLabel: string;
}) {
  const manualSource = draft.layout.source === "manual";
  const scope = draft.documentScope;
  const showPricingMeta = scope === "offer" || scope === "offerAndAgreement";

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

  const handleDocumentTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextScope = event.target.value as DocumentScope;
    onDraftChange({
      ...draft,
      documentScope: nextScope,
      header: {
        ...draft.header,
        documentType: DOCUMENT_TYPE_LABELS[nextScope]
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-slate-900">Step 1. Header / Meta</h3>
      <p className="mt-1 text-sm text-slate-600">
        {manualSource
          ? "Manual mode starts from selected baseline. You can optionally pull current calculator values."
          : "Data is auto-filled from calculator and can be adjusted before PDF generation."}
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="field-label">Document Type</span>
          <select
            className="field-input"
            value={scope}
            onChange={handleDocumentTypeChange}
            aria-label="Document Type"
          >
            {SCOPE_VALUES.map(value => (
              <option key={value} value={value}>
                {DOCUMENT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            {DOCUMENT_TYPE_HINTS[scope]}
          </span>
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
        {showPricingMeta ? (
          <>
            <label>
              <span className="field-label">Collection Model</span>
              <input
                className="field-input"
                value={draft.header.collectionModel}
                onChange={event => update("collectionModel", event)}
                aria-label="Collection Model"
              />
            </label>
            <label>
              <span className="field-label">Collection Frequency</span>
              <input
                className="field-input"
                value={draft.header.collectionFrequency}
                onChange={event => update("collectionFrequency", event)}
                aria-label="Collection Frequency"
              />
            </label>
          </>
        ) : (
          <p className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Collection Model and Frequency are pricing-specific and are hidden when the
            document type is "Terms of Agreement" only.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRefreshFromCalculator}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {manualSource ? "Fill From Calculator" : "Refill From Calculator"}
        </button>
        <button
          type="button"
          onClick={onContinueToPreview}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Jump to Preview
        </button>
      </div>

      <StepNavigation onNext={onContinueToNext} nextLabel={nextStepLabel} />
    </div>
  );
}

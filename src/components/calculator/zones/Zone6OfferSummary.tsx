import { ZoneSection } from "../index.js";
import type { ZoneSectionNavigation } from "../types.js";

export interface Zone6OfferSummaryProps {
  expanded: boolean;
  onToggle: () => void;
  navigation?: ZoneSectionNavigation;
  clientNotes: string;
  onClientNotesChange: (value: string) => void;
  offerSummaryText: string;
  offerSummaryActionMessage: string | null;
  onCopy: () => void;
  onOpenWizard?: () => void;
  /**
   * Persist the current calculator state to the backend
   * (POST /api/v1/calculator-configs via SaveCalculatorModal). Optional
   * because the calculator can run without a backend (legacy / offline
   * use); when the prop is omitted the button is hidden.
   *
   * Sprint 6.2-FIX (2026-05-18): the calculator page does NOT create
   * documents directly. Document creation is the wizard's job — calc
   * page persists ONLY the calculator entity, then "Open Contract
   * Wizard" navigates to /wizard?calc=<id> with the config id as a
   * link so the wizard knows which calc the saved document is
   * derived from (FK on documents.calculator_config_id).
   */
  onSaveCalculator?: () => void;
}

export function Zone6OfferSummary({
  expanded,
  onToggle,
  navigation,
  clientNotes,
  onClientNotesChange,
  offerSummaryText,
  offerSummaryActionMessage,
  onCopy,
  onOpenWizard,
  onSaveCalculator
}: Zone6OfferSummaryProps) {
  return (
    <ZoneSection
      id="zone6"
      title="Zone 6: Offer Summary"
      subtitle="Auto-generated proposal text based on active sections and enabled options."
      expanded={expanded}
      onToggle={onToggle}
      navigation={navigation}
      headerClassName="border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-blue-50 px-5 py-4 md:px-7"
      contentClassName="p-5 md:p-7"
    >
      <div className="grid gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">
            Add optional notes that will be included in the generated offer text.
          </p>
          <label className="mt-3 block">
            <span className="field-label">Client Notes</span>
            <textarea
              aria-label="Client Notes"
              className="field-input min-h-[96px] resize-y text-sm font-medium leading-6 text-slate-800"
              value={clientNotes}
              onChange={event => onClientNotesChange(event.target.value)}
              placeholder="Add client-specific notes for the proposal..."
            />
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-lg font-bold text-slate-900">Export Actions</h3>
          <p className="mt-1 text-sm text-slate-600">
            Save the draft to the backend, open the wizard for a full
            offer/agreement, or copy the summary text.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {onSaveCalculator ? (
              <button
                type="button"
                onClick={onSaveCalculator}
                className="rounded-xl border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Save calculator
              </button>
            ) : null}
            {onOpenWizard ? (
              <button
                type="button"
                onClick={onOpenWizard}
                className="rounded-xl border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Open Contract Wizard
              </button>
            ) : null}
            <button
              type="button"
              onClick={onCopy}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Copy to Clipboard
            </button>
          </div>
          {offerSummaryActionMessage ? (
            <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              {offerSummaryActionMessage}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-lg font-bold text-slate-900">Offer Summary Preview</h3>
          <p className="mt-1 text-sm text-slate-600">
            Regenerates automatically after every input change.
          </p>
          <label className="mt-3 block">
            <span className="field-label">Offer Summary Preview</span>
            <textarea
              aria-label="Offer Summary Preview"
              readOnly
              className="field-input min-h-[560px] resize-y whitespace-pre font-mono text-xs leading-6 text-slate-800"
              value={offerSummaryText}
            />
          </label>
        </div>
      </div>
    </ZoneSection>
  );
}

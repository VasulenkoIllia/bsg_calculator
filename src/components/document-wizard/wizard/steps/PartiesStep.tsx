import { useState, type ChangeEvent } from "react";
import {
  AGREEMENT_PARTY_PLACEHOLDERS,
  BSG_ENTITY,
  DEFAULT_AGREEMENT_PARTIES
} from "../../legalDefaults.js";
import type { AgreementParties } from "../../legalDefaults.js";
import type { DocumentTemplatePayload } from "../../types.js";
import { fieldInputClass, StepNavigation } from "../shared.js";

export function PartiesStep({
  draft,
  onDraftChange,
  onBack,
  onNext,
  backLabel,
  nextLabel
}: {
  draft: DocumentTemplatePayload;
  onDraftChange: (next: DocumentTemplatePayload) => void;
  onBack: () => void;
  onNext: () => void;
  backLabel: string;
  nextLabel: string;
}) {
  const parties = draft.agreementParties;
  // Service Provider Co-entity defaults to KASEF PAY INC and is rarely
  // overridden — the wizard locks the fields by default to prevent
  // accidental edits. The user must flip the "Edit" checkbox to make
  // them writable. The flag is local to this step (not persisted) so
  // the lock re-engages on every wizard re-entry.
  const [coEntityEditUnlocked, setCoEntityEditUnlocked] = useState(false);
  // The four co-entity fields stay visually in sync via the shared
  // `fieldInputClass(locked)` helper from `wizard/shared.tsx`.
  const lockedInputClass = fieldInputClass(!coEntityEditUnlocked);

  const update = <K extends keyof AgreementParties>(
    field: K,
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    onDraftChange({
      ...draft,
      agreementParties: {
        ...parties,
        [field]: event.target.value
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-slate-900">Parties &amp; Signatures</h3>
      <p className="mt-1 text-sm text-slate-600">
        Counterparty details rendered in the agreement&apos;s parties block and signature panels.
        Leave merchant fields blank to keep MSA placeholders in the preview. Co-entity fields
        ship with KASEF PAY defaults — change them per contract if a different acquiring entity
        is involved.
      </p>

      <div className="mt-4 grid gap-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-800">{BSG_ENTITY.name}</p>
          <p className="mt-1 text-xs text-slate-600">
            BSG identity is fixed and rendered as a static value across all contracts.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-800">Service Provider Co-entity</p>
              <p className="mt-1 text-xs text-slate-600">
                Defaults to KASEF PAY INC. Override only if a different acquiring/processing
                partner is used for this contract.
              </p>
            </div>
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-blue-600"
                checked={coEntityEditUnlocked}
                onChange={event => setCoEntityEditUnlocked(event.target.checked)}
                aria-label="Edit co-entity fields"
              />
              Edit
            </label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label>
              <span className="field-label">Legal Name</span>
              <input
                className={lockedInputClass}
                value={parties.serviceProviderCoEntityName}
                onChange={event => update("serviceProviderCoEntityName", event)}
                placeholder={DEFAULT_AGREEMENT_PARTIES.serviceProviderCoEntityName}
                aria-label="Co-entity legal name"
                readOnly={!coEntityEditUnlocked}
                aria-readonly={!coEntityEditUnlocked}
              />
            </label>
            <label>
              <span className="field-label">Short Label (in quotes)</span>
              <input
                className={lockedInputClass}
                value={parties.serviceProviderCoEntityShortLabel}
                onChange={event => update("serviceProviderCoEntityShortLabel", event)}
                placeholder={DEFAULT_AGREEMENT_PARTIES.serviceProviderCoEntityShortLabel}
                aria-label="Co-entity short label"
                readOnly={!coEntityEditUnlocked}
                aria-readonly={!coEntityEditUnlocked}
              />
            </label>
            <label>
              <span className="field-label">Jurisdiction</span>
              <input
                className={lockedInputClass}
                value={parties.serviceProviderCoEntityJurisdiction}
                onChange={event => update("serviceProviderCoEntityJurisdiction", event)}
                placeholder={DEFAULT_AGREEMENT_PARTIES.serviceProviderCoEntityJurisdiction}
                aria-label="Co-entity jurisdiction"
                readOnly={!coEntityEditUnlocked}
                aria-readonly={!coEntityEditUnlocked}
              />
            </label>
            <label>
              <span className="field-label">Registered Office</span>
              <input
                className={lockedInputClass}
                value={parties.serviceProviderCoEntityAddress}
                onChange={event => update("serviceProviderCoEntityAddress", event)}
                placeholder={DEFAULT_AGREEMENT_PARTIES.serviceProviderCoEntityAddress}
                aria-label="Co-entity registered office"
                readOnly={!coEntityEditUnlocked}
                aria-readonly={!coEntityEditUnlocked}
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-800">Merchant</p>
          <p className="mt-1 text-xs text-slate-600">
            Leave fields blank to keep the spec placeholder in the preview. These values will
            normally come from HubSpot / DB once the backend phase lands.
          </p>
          <div className="mt-3 grid gap-3">
            <label>
              <span className="field-label">Legal Name</span>
              <span className="mt-1 block text-xs text-slate-500">
                {"Enter the full legal name of client company"}
              </span>
              <input
                className="field-input"
                value={parties.merchantLegalName}
                onChange={event => update("merchantLegalName", event)}
                placeholder={AGREEMENT_PARTY_PLACEHOLDERS.merchantLegalName}
                aria-label="Merchant legal name"
              />
            </label>
            <label>
              <span className="field-label">Jurisdiction</span>
              <span className="mt-1 block text-xs text-slate-500">
                {'Enter the country of incorporation to complete the statement: "…a company incorporated under the laws of ______"'}
              </span>
              <input
                className="field-input"
                value={parties.merchantJurisdiction}
                onChange={event => update("merchantJurisdiction", event)}
                placeholder="e.g. Cyprus"
                aria-label="Merchant jurisdiction"
              />
            </label>
            <label>
              <span className="field-label">Registered Office</span>
              <span className="mt-1 block text-xs text-slate-500">
                {'Enter the full registered address to complete the statement: "…having its registered office at ______"'}
              </span>
              <textarea
                className="field-input"
                rows={2}
                value={parties.merchantRegisteredAddress}
                onChange={event => update("merchantRegisteredAddress", event)}
                placeholder="Full registered address"
                aria-label="Merchant registered office"
              />
            </label>
          </div>
        </div>
      </div>

      <StepNavigation
        onBack={onBack}
        onNext={onNext}
        backLabel={backLabel}
        nextLabel={nextLabel}
      />
    </div>
  );
}

import type { ChangeEvent } from "react";
import {
  AGREEMENT_PARTY_PLACEHOLDERS,
  BSG_ENTITY,
  DEFAULT_AGREEMENT_PARTIES
} from "../../legalDefaults.js";
import type { AgreementParties } from "../../legalDefaults.js";
import type { DocumentTemplatePayload } from "../../types.js";
import { StepNavigation } from "../shared.js";

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
          <p className="text-sm font-bold text-slate-800">Service Provider Co-entity</p>
          <p className="mt-1 text-xs text-slate-600">
            Defaults to KASEF PAY INC. Override only if a different acquiring/processing
            partner is used for this contract.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label>
              <span className="field-label">Legal Name</span>
              <input
                className="field-input"
                value={parties.serviceProviderCoEntityName}
                onChange={event => update("serviceProviderCoEntityName", event)}
                placeholder={DEFAULT_AGREEMENT_PARTIES.serviceProviderCoEntityName}
                aria-label="Co-entity legal name"
              />
            </label>
            <label>
              <span className="field-label">Short Label (in quotes)</span>
              <input
                className="field-input"
                value={parties.serviceProviderCoEntityShortLabel}
                onChange={event => update("serviceProviderCoEntityShortLabel", event)}
                placeholder={DEFAULT_AGREEMENT_PARTIES.serviceProviderCoEntityShortLabel}
                aria-label="Co-entity short label"
              />
            </label>
            <label>
              <span className="field-label">Jurisdiction</span>
              <input
                className="field-input"
                value={parties.serviceProviderCoEntityJurisdiction}
                onChange={event => update("serviceProviderCoEntityJurisdiction", event)}
                placeholder={DEFAULT_AGREEMENT_PARTIES.serviceProviderCoEntityJurisdiction}
                aria-label="Co-entity jurisdiction"
              />
            </label>
            <label>
              <span className="field-label">Registered Office</span>
              <input
                className="field-input"
                value={parties.serviceProviderCoEntityAddress}
                onChange={event => update("serviceProviderCoEntityAddress", event)}
                placeholder={DEFAULT_AGREEMENT_PARTIES.serviceProviderCoEntityAddress}
                aria-label="Co-entity registered office"
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
              <input
                className="field-input"
                value={parties.merchantJurisdiction}
                onChange={event => update("merchantJurisdiction", event)}
                placeholder="e.g. England and Wales"
                aria-label="Merchant jurisdiction"
              />
            </label>
            <label>
              <span className="field-label">Registered Office</span>
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

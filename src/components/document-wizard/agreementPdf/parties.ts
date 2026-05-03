import { escapeHtml } from "../../calculator/formatUtils.js";
import {
  AGREEMENT_PARTY_PLACEHOLDERS,
  BSG_ENTITY,
  DEFAULT_AGREEMENT_PARTIES
} from "../legalDefaults.js";
import type { DocumentTemplatePayload } from "../types.js";
import { renderFieldWithDefault, renderPartyField } from "./highlightVar.js";

// Opening parties block — mirrors DRAFT TEXT.docx 1:1.
// Starts with a bold uppercase opener (no separate "Parties" heading), then
// BSG, KASEF PAY (or override), and the Merchant paragraph with placeholders.
export function buildPartiesBlock(payload: DocumentTemplatePayload): string {
  const parties = payload.agreementParties;

  const merchantName = renderPartyField(
    parties.merchantLegalName,
    AGREEMENT_PARTY_PLACEHOLDERS.merchantLegalName
  );
  const merchantJurisdiction = renderPartyField(
    parties.merchantJurisdiction,
    AGREEMENT_PARTY_PLACEHOLDERS.merchantJurisdiction
  );
  const merchantAddress = renderPartyField(
    parties.merchantRegisteredAddress,
    AGREEMENT_PARTY_PLACEHOLDERS.merchantRegisteredAddress
  );

  const coEntityName = renderFieldWithDefault(
    parties.serviceProviderCoEntityName,
    DEFAULT_AGREEMENT_PARTIES.serviceProviderCoEntityName
  );
  const coEntityJurisdiction = renderFieldWithDefault(
    parties.serviceProviderCoEntityJurisdiction,
    DEFAULT_AGREEMENT_PARTIES.serviceProviderCoEntityJurisdiction
  );
  const coEntityAddress = renderFieldWithDefault(
    parties.serviceProviderCoEntityAddress,
    DEFAULT_AGREEMENT_PARTIES.serviceProviderCoEntityAddress
  );
  const coEntityShortLabel = renderFieldWithDefault(
    parties.serviceProviderCoEntityShortLabel,
    DEFAULT_AGREEMENT_PARTIES.serviceProviderCoEntityShortLabel
  );

  return `<section class="agreement-section">
    <p class="agreement-p agreement-p-bold">THIS SERVICE AGREEMENT (THE “AGREEMENT”) IS ENTERED INTO BETWEEN:</p>
    <p class="agreement-p">${escapeHtml(BSG_ENTITY.name)}, a company incorporated under the laws of ${escapeHtml(BSG_ENTITY.jurisdiction)}, having its registered office at ${escapeHtml(BSG_ENTITY.registeredOffice)} (“${escapeHtml(BSG_ENTITY.shortLabel)}”), acting as a technical gateway and merchant onboarding service provider,</p>
    <p class="agreement-p">and</p>
    <p class="agreement-p">${coEntityName}, a company incorporated under the laws of ${coEntityJurisdiction}, having its registered office at ${coEntityAddress} (“${coEntityShortLabel}”), acting as an acquiring, processing and settling service provider,</p>
    <p class="agreement-p">each a “Service Provider Entity” and together the “Service Provider”,</p>
    <p class="agreement-p">and</p>
    <p class="agreement-p">${merchantName}, a company incorporated under the laws of ${merchantJurisdiction}, having its registered office at ${merchantAddress}, the “Merchant”.</p>
  </section>`;
}

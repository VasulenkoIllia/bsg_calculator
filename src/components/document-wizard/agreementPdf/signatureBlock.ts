import {
  AGREEMENT_PARTY_PLACEHOLDERS,
  BSG_ENTITY,
  DEFAULT_AGREEMENT_PARTIES
} from "../legalDefaults.js";
import type { DocumentTemplatePayload } from "../types.js";
import { renderDefaultField, renderFieldWithDefault, renderPartyField } from "./highlightVar.js";

function renderSignaturePanel(headingHtml: string): string {
  // The fill line is a CSS border-bottom (`.signature-blank`, flex:1) that
  // stretches to the panel's right edge — NOT literal underscores — so every
  // line starts (fixed-width label) and ends (right edge) on the same x in
  // all three panels. The blank span is intentionally empty.
  return `<div class="signature-panel">
    <p class="signature-name">${headingHtml}</p>
    <p class="signature-line"><span class="signature-label">Date:</span><span class="signature-blank"></span></p>
    <p class="signature-line"><span class="signature-label">Name:</span><span class="signature-blank"></span></p>
    <p class="signature-line"><span class="signature-label">Title:</span><span class="signature-blank"></span></p>
    <p class="signature-line"><span class="signature-label">Signature:</span><span class="signature-blank"></span></p>
  </div>`;
}

export function buildSignatureBlock(payload: DocumentTemplatePayload): string {
  const parties = payload.agreementParties;

  const bsgHeading = renderDefaultField(BSG_ENTITY.name);
  const coEntityHeading = renderFieldWithDefault(
    parties.serviceProviderCoEntityName,
    DEFAULT_AGREEMENT_PARTIES.serviceProviderCoEntityName
  );
  const merchantHeading = renderPartyField(
    parties.merchantLegalName,
    AGREEMENT_PARTY_PLACEHOLDERS.merchantLegalName
  );

  return `<section class="agreement-section">
    <p class="agreement-p">By signing below you confirm having read, understood and agreed to all of the above.</p>
    <div class="signature-grid">
      ${renderSignaturePanel(bsgHeading)}
      ${renderSignaturePanel(coEntityHeading)}
      ${renderSignaturePanel(merchantHeading)}
    </div>
  </section>`;
}

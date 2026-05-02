import { escapeHtml } from "../calculator/formatUtils.js";
import {
  buildPdfUiKitStyles,
  renderFooter,
  renderMetaItem
} from "./pdf-kit/primitives.js";
import { OFFER_REFERENCE_TOKENS } from "./pdf-kit/tokens.js";
import type { DocumentTemplatePayload, DocumentWizardLayout } from "./types.js";
import { formatDisplayDate, resolveModelHeaderLabel } from "./offerPdf/formatters.js";
import { resolveLayout } from "./offerPdf/layoutResolution.js";
import { buildPayinSection } from "./offerPdf/sections/payin.js";
import { buildPayoutSection } from "./offerPdf/sections/payout.js";
import { buildOtherServicesSection } from "./offerPdf/sections/fees.js";
import { buildTermsSection } from "./offerPdf/sections/terms.js";

const OFFER_CONFIDENTIAL_TITLE = "CONFIDENTIAL · PAYMENT INFRASTRUCTURE";
const OFFER_SUBTITLE =
  "Card Acquiring, Payout Infrastructure & Settlement Terms — structured for scale-up and enterprise merchants operating globally.";

function buildBody(data: DocumentTemplatePayload, layout: DocumentWizardLayout): string {
  const sections: string[] = [];

  const payin = buildPayinSection(data, layout);
  if (payin) sections.push(payin);

  const payout = buildPayoutSection(data, layout);
  if (payout) sections.push(payout);

  const services = buildOtherServicesSection(data, layout);
  if (services) sections.push(services);

  const terms = buildTermsSection(data, layout);
  if (terms) sections.push(terms);

  return sections.join("");
}

export function buildOfferPdfHtml(data: DocumentTemplatePayload): string {
  const layout = resolveLayout(data);
  const body = buildBody(data, layout);
  const modelLabel = resolveModelHeaderLabel(data.header.collectionModel);
  const displayDate = formatDisplayDate(data.header.documentDateIso);
  const styles = buildPdfUiKitStyles(OFFER_REFERENCE_TOKENS);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(data.header.documentNumber)}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="sheet">
    <header class="offer-header">
      <div class="offer-top-line"></div>
      <p class="offer-eyebrow">${OFFER_CONFIDENTIAL_TITLE}</p>
      <h1 class="offer-title">Service<br/><span class="accent">Agreement</span></h1>
      <p class="offer-subtitle">${escapeHtml(OFFER_SUBTITLE)}</p>
      <div class="meta-grid">
        ${renderMetaItem({ label: "DOCUMENT TYPE", value: data.header.documentType })}
        ${renderMetaItem({ label: modelLabel, value: data.header.collectionModel })}
        ${renderMetaItem({ label: "COLLECTION FREQUENCY", value: data.header.collectionFrequency })}
        ${renderMetaItem({ label: "DOCUMENT NUMBER", value: data.header.documentNumber })}
        ${renderMetaItem({ label: "DOCUMENT DATE", value: displayDate })}
      </div>
      <p class="meta-note">
        All fees are collected on a daily basis unless otherwise instructed in writing. Rates are subject to applicable interchange and scheme fees under the IC++ model unless otherwise instructed in writing.
      </p>
    </header>

    ${body}
    ${renderFooter(data.header.documentNumber)}
  </div>
</body>
</html>`;
}

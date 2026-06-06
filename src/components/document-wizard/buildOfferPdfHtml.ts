import { escapeHtml } from "../../shared/html.js";
import { hasExplicitOfferValidity, offerValidTillIso } from "../../shared/offerValidity.js";
import { buildAgreementBodyHtml } from "./agreementPdf/index.js";
import {
  buildPdfUiKitStyles,
  renderMetaItem
} from "./pdf-kit/primitives.js";
import { OFFER_REFERENCE_TOKENS } from "./pdf-kit/tokens.js";
import type { DocumentTemplatePayload, DocumentWizardLayout } from "./types.js";
import { formatDisplayDate, resolveModelHeaderLabel } from "./offerPdf/formatters.js";
import { resolveLayout } from "./offerPdf/layoutResolution.js";
import {
  buildPayinAdditionalSection,
  buildPayinCustomNoteHtml,
  buildPayinSection
} from "./offerPdf/sections/payin.js";
import {
  buildPayoutCustomNoteHtml,
  buildPayoutSection
} from "./offerPdf/sections/payout.js";
import { buildOtherServicesSection } from "./offerPdf/sections/fees.js";
import { buildTermsSection } from "./offerPdf/sections/terms.js";

const OFFER_CONFIDENTIAL_TITLE = "CONFIDENTIAL · PAYMENT INFRASTRUCTURE";
const OFFER_SUBTITLE =
  "Card Acquiring, Payout Infrastructure & Settlement Terms — structured for scale-up and enterprise merchants operating globally.";

// One top-level OFFER section, wrapped by the orchestrator into its
// own `<tr><td>` row.
interface OfferBodyRow {
  html: string;
}

// Returns each top-level OFFER section (Card Acquiring / Additional
// Card Acquiring / Pay Out / Other Services & Fees / Terms &
// Limitations) as its own row. The orchestrator wraps each row in its
// own `<tr><td>` inside `table.page-layout > tbody`, giving the print
// engine clean break points between sections. Page breaks are NOT
// forced — see the NATURAL FLOW note in the function body.
function buildOfferBodyRows(
  data: DocumentTemplatePayload,
  layout: DocumentWizardLayout
): OfferBodyRow[] {
  // NATURAL FLOW (2026-05-30): no forced page breaks inside the offer.
  // Each `.offer-section` carries `break-inside: avoid`, so a section
  // is never split mid-table — the print engine simply pushes a whole
  // section to the next page when it doesn't fit, and otherwise lets
  // sections flow continuously. This replaces the old compact-era
  // `force-page-break-before` heuristics, which assumed a fixed 2-page
  // budget and orphaned content (e.g. a lone custom note on an
  // otherwise-empty page) once the universal full-size layout +
  // standardized 10mm section gaps changed section heights. Custom
  // notes stay as their own rows so a long note never drags its
  // section's `break-inside: avoid` across a page boundary.
  const rows: OfferBodyRow[] = [];

  const payin = buildPayinSection(data, layout);
  if (payin) rows.push({ html: payin });

  const payinNote = buildPayinCustomNoteHtml(data);
  if (payinNote) rows.push({ html: payinNote });

  const payinAdditional = buildPayinAdditionalSection(data);
  if (payinAdditional) rows.push({ html: payinAdditional });

  const payout = buildPayoutSection(data, layout);
  if (payout) rows.push({ html: payout });

  const payoutNote = buildPayoutCustomNoteHtml(data);
  if (payoutNote) rows.push({ html: payoutNote });

  const services = buildOtherServicesSection(data, layout);
  if (services) rows.push({ html: services });

  const terms = buildTermsSection(data, layout);
  if (terms) rows.push({ html: terms });

  return rows;
}

// Pricing meta (Collection Model + Frequency) is shown for both scopes because
// pricing sections are always present. Kept as a helper so future scope
// additions stay explicit.
function shouldShowPricingMeta(_scope: DocumentTemplatePayload["documentScope"]): boolean {
  return true;
}

export interface BuildOfferPdfHtmlOptions {
  // When true, the rendered body carries `class="highlight-variables"` so that
  // CSS in `@media screen` highlights substituted variables. Print stylesheet
  // strips highlights regardless. Default: false.
  highlightVariables?: boolean;
}

export function buildOfferPdfHtml(
  data: DocumentTemplatePayload,
  options: BuildOfferPdfHtmlOptions = {}
): string {
  const layout = resolveLayout(data);
  const modelLabel = resolveModelHeaderLabel(data.header.collectionModel);
  const displayDate = formatDisplayDate(data.header.documentDateIso);
  const styles = buildPdfUiKitStyles(OFFER_REFERENCE_TOKENS);
  const scope = data.documentScope;
  const bodyClass = options.highlightVariables ? "highlight-variables" : "";

  // Pricing sections are always rendered. The MSA appendix is appended only
  // for the bundle scope. There is no agreement-only output by product design.
  const includeAgreement = scope === "offerAndAgreement";

  const offerSectionRows = buildOfferBodyRows(data, layout);
  const agreementBody = includeAgreement ? buildAgreementBodyHtml(data) : "";

  // Wrap each top-level block in its own <tr><td>. The wrapping
  // <table> gives the print engine natural per-row break points
  // between sections. The running footer is rendered by Puppeteer via
  // `footerTemplate` (pdf.service.ts) and lives in the @page bottom
  // margin — no <tfoot> here.
  const wrap = (innerHtml: string) =>
    `<tr><td class="page-content-cell">${innerHtml}</td></tr>`;

  const showPricingMeta = shouldShowPricingMeta(scope);
  // Cover meta-grid: DOCUMENT TYPE + pricing meta (MODEL, FREQUENCY) —
  // exactly 3 cells on a single row. DOCUMENT NUMBER + DATE were moved
  // up beside the title (see `titleAside`, 2026-05-30), which freed the
  // old second grid row. When pricing meta is hidden the grid collapses
  // to just DOCUMENT TYPE.
  const metaItems = [
    renderMetaItem({ label: "DOCUMENT TYPE", value: data.header.documentType }),
    showPricingMeta
      ? renderMetaItem({ label: modelLabel, value: data.header.collectionModel })
      : "",
    showPricingMeta
      ? renderMetaItem({ label: "COLLECTION FREQUENCY", value: data.header.collectionFrequency })
      : ""
  ]
    .filter(Boolean)
    .join("");

  // "Offer valid till" — only on the standalone Commercial Pricing Schedule
  // (offer scope) AND only when the document carries an explicit validity.
  // Documents stored before this feature have none, so they are not
  // retroactively labeled. Derived from the document date + the chosen day
  // count; neutral color (no valid/expired styling in the static PDF).
  const offerValidTillItem =
    scope === "offer" && hasExplicitOfferValidity(data.header.offerValidDays)
      ? `<div class="title-aside-item">
          <span class="title-aside-label">OFFER VALID TILL</span>
          <span class="title-aside-value">${escapeHtml(
            formatDisplayDate(offerValidTillIso(data.header.documentDateIso, data.header.offerValidDays))
          )}</span>
        </div>`
      : "";

  // DOCUMENT NUMBER + DATE (+ OFFER VALID TILL for offers) rendered
  // top-right, opposite the title.
  const titleAside = `<div class="offer-title-aside">
        <div class="title-aside-item">
          <span class="title-aside-label">DOCUMENT NUMBER</span>
          <span class="title-aside-value">${escapeHtml(data.header.documentNumber)}</span>
        </div>
        <div class="title-aside-item">
          <span class="title-aside-label">DOCUMENT DATE</span>
          <span class="title-aside-value">${escapeHtml(displayDate)}</span>
        </div>
        ${offerValidTillItem}
      </div>`;

  const metaNote = `<p class="meta-note">
        All fees are collected on a daily basis unless otherwise instructed in writing. Rates are subject to applicable interchange and scheme fees under the IC++ model unless otherwise instructed in writing.
      </p>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(data.header.documentNumber)}</title>
  <style>${styles}</style>
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}>
  <table class="page-layout">
    <tbody class="page-layout-body">
      ${wrap(`<div class="sheet">
            <header class="offer-header">
              <div class="offer-top-line"></div>
              <p class="offer-eyebrow">${OFFER_CONFIDENTIAL_TITLE}</p>
              <div class="offer-title-row">
                <h1 class="offer-title">Service<br/><span class="accent">Agreement</span></h1>
                ${titleAside}
              </div>
              <p class="offer-subtitle">${escapeHtml(OFFER_SUBTITLE)}</p>
              <div class="meta-grid">${metaItems}</div>
              ${metaNote}
            </header>
          </div>`)}
      ${offerSectionRows
        .map(row => wrap(`<div class="sheet">${row.html}</div>`))
        .join("\n      ")}
      ${agreementBody ? wrap(`<div class="sheet">${agreementBody}</div>`) : ""}
    </tbody>
  </table>
</body>
</html>`;
}

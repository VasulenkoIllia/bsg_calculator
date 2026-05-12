import { escapeHtml } from "../../shared/html.js";
import { buildAgreementBodyHtml } from "./agreementPdf/index.js";
import {
  buildPdfUiKitStyles,
  renderFooter,
  renderMetaItem
} from "./pdf-kit/primitives.js";
import { OFFER_REFERENCE_TOKENS } from "./pdf-kit/tokens.js";
import type { DocumentTemplatePayload, DocumentWizardLayout } from "./types.js";
import { formatDisplayDate, resolveModelHeaderLabel } from "./offerPdf/formatters.js";
import { resolveLayout } from "./offerPdf/layoutResolution.js";
import { buildPayinCustomNoteHtml, buildPayinSection } from "./offerPdf/sections/payin.js";
import {
  buildPayoutCustomNoteHtml,
  buildPayoutSection
} from "./offerPdf/sections/payout.js";
import { buildOtherServicesSection } from "./offerPdf/sections/fees.js";
import { buildTermsSection } from "./offerPdf/sections/terms.js";

const OFFER_CONFIDENTIAL_TITLE = "CONFIDENTIAL · PAYMENT INFRASTRUCTURE";
const OFFER_SUBTITLE =
  "Card Acquiring, Payout Infrastructure & Settlement Terms — structured for scale-up and enterprise merchants operating globally.";

// One body row to be wrapped by the orchestrator. `breakBefore: true`
// makes the row start on a new printed page (force-page-break-before
// CSS class). Used to push the Pay Out section onto page 2 when the
// Card Acquiring section is heavy (tiered + both regions).
interface OfferBodyRow {
  html: string;
  breakBefore?: boolean;
}

// Returns each top-level OFFER section (Card Acquiring / Pay Out /
// Other Services & Fees / Terms & Limitations) as its own row. The
// orchestrator wraps each row in a separate `<tr><td>` inside
// `table.page-layout > tbody` so Chrome's print engine has natural
// break points between rows — that is what makes `<tfoot>` reliably
// repeat the disclaimer footer on every page.
//
// Page-budget rule (2026-05-08):
//   Tiered payin  (tableMode = byRegionTiered / flatTiered):
//     page 1 = header + section 1 + payin custom note
//     page 2 = section 2 + payout custom note + sections 3 + 4
//   Non-tiered payin (tableMode = byRegionFlat / flatSingle):
//     page 1 = header + sections 1 + 2 + their notes
//     page 2 = sections 3 + 4
// Both halves of the rule are implemented as `breakBefore` flags on
// the Pay Out and Other Services & Fees rows respectively. Light
// payin + missing payin section falls back to natural flow.
function buildOfferBodyRows(
  data: DocumentTemplatePayload,
  layout: DocumentWizardLayout
): OfferBodyRow[] {
  const rows: OfferBodyRow[] = [];

  const payin = buildPayinSection(data, layout);
  const payinIsPresent = payin.length > 0;
  const payinHasTiers =
    layout.payin.tableMode === "byRegionTiered" ||
    layout.payin.tableMode === "flatTiered";
  const heavyPayin = payinIsPresent && payinHasTiers;
  const lightPayin = payinIsPresent && !payinHasTiers;

  if (payin) rows.push({ html: payin });
  const payinNote = buildPayinCustomNoteHtml(data);
  if (payinNote) rows.push({ html: payinNote });

  const payout = buildPayoutSection(data, layout);
  if (payout) rows.push({ html: payout, breakBefore: heavyPayin });
  const payoutNote = buildPayoutCustomNoteHtml(data);
  if (payoutNote) rows.push({ html: payoutNote });

  const services = buildOtherServicesSection(data, layout);
  if (services) rows.push({ html: services, breakBefore: lightPayin });

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

  // Wrap each top-level block in its own <tr><td>. Multiple TRs give
  // Chrome's print engine the natural break points it needs to repeat
  // the disclaimer footer (in <tfoot>) on every page. When the row
  // has `breakBefore`, the TR carries the `force-page-break-before`
  // class so it starts on a fresh page.
  const wrap = (innerHtml: string, opts: { breakBefore?: boolean } = {}) => {
    const trClass = opts.breakBefore ? ' class="force-page-break-before"' : "";
    return `<tr${trClass}><td class="page-content-cell">${innerHtml}</td></tr>`;
  };

  const showPricingMeta = shouldShowPricingMeta(scope);
  // Order: identification first (NUMBER, DATE, TYPE), then pricing meta
  // (MODEL, FREQUENCY). When pricing meta is hidden, the grid collapses
  // to a single 3-column row with no empty trailing cell. When pricing
  // meta is shown the grid has exactly 5 items; the .meta-item rule in
  // styles.ts widens the 5th item to fill the empty 6th column.
  const metaItems = [
    renderMetaItem({ label: "DOCUMENT NUMBER", value: data.header.documentNumber }),
    renderMetaItem({ label: "DOCUMENT DATE", value: displayDate }),
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
    <tfoot class="page-layout-foot">
      <tr>
        <td class="page-footer-cell">${renderFooter(data.header.documentNumber)}</td>
      </tr>
    </tfoot>
    <tbody class="page-layout-body">
      ${wrap(`<div class="sheet">
            <header class="offer-header">
              <div class="offer-top-line"></div>
              <p class="offer-eyebrow">${OFFER_CONFIDENTIAL_TITLE}</p>
              <h1 class="offer-title">Service<br/><span class="accent">Agreement</span></h1>
              <p class="offer-subtitle">${escapeHtml(OFFER_SUBTITLE)}</p>
              <div class="meta-grid">${metaItems}</div>
              ${metaNote}
            </header>
          </div>`)}
      ${offerSectionRows
        .map(row => wrap(`<div class="sheet">${row.html}</div>`, { breakBefore: row.breakBefore }))
        .join("\n      ")}
      ${agreementBody ? wrap(`<div class="sheet">${agreementBody}</div>`) : ""}
    </tbody>
  </table>
</body>
</html>`;
}

import { describe, expect, it } from "vitest";
import { buildOfferPdfHtml } from "../buildOfferPdfHtml.js";
import {
  buildDocumentTemplatePayloadManualBlank,
  buildDocumentTemplatePayloadManualDefaults
} from "../fromCalculator.js";
import type { DocumentTemplatePayload } from "../types.js";
import { buildAgreementBodyHtml } from "./index.js";

function withScope(
  draft: DocumentTemplatePayload,
  scope: DocumentTemplatePayload["documentScope"]
): DocumentTemplatePayload {
  return {
    ...draft,
    documentScope: scope,
    header: { ...draft.header }
  };
}

describe("buildAgreementBodyHtml", () => {
  it("renders all MSA sections, opening parties block, and signature block", () => {
    const draft = buildDocumentTemplatePayloadManualDefaults();
    const html = buildAgreementBodyHtml(draft);

    expect(html).toContain("agreement-body");
    // Parties block opens with the bold uppercase opener (no separate heading).
    expect(html).toContain("THIS SERVICE AGREEMENT (THE “AGREEMENT”) IS ENTERED INTO BETWEEN");
    expect(html).toContain("Overview of this Agreement");
    expect(html).toContain("Your Service Provider Account");
    expect(html).toContain("Validation and Underwriting");
    expect(html).toContain("Your Relationship with Your Customers");
    expect(html).toContain("Responsibilities and Disclosures to Your Customers");
    expect(html).toContain("Payment");
    expect(html).toContain("Customer Data Restrictions");
    expect(html).toContain("Term and Termination");
    expect(html).toContain("Intellectual Property Rights");
    expect(html).toContain("Representations and Warranties");
    expect(html).toContain("Indemnification");
    expect(html).toContain("Confidentiality");
    expect(html).toContain("Limitation of Liability");
    expect(html).toContain("Dispute Resolution");
    expect(html).toContain("Other");
    expect(html).toContain("By signing below");
    expect(html).toContain("signature-grid");
  });

  it("renders Dispute Resolution sub-headings as standalone uppercase headings", () => {
    const draft = buildDocumentTemplatePayloadManualDefaults();
    const html = buildAgreementBodyHtml(draft);

    expect(html).toContain('<h3 class="agreement-h3">Binding Arbitration</h3>');
    expect(html).toContain('<h3 class="agreement-h3">Class Action Waiver</h3>');
    expect(html).toContain('<h3 class="agreement-h3">Choice of Law/No Jury Trial</h3>');
    expect(html).toContain('<h3 class="agreement-h3">Injunctive Relief/Attorneys’ Fees</h3>');
  });

  it("renders Payment sub-sections as inline bold leads, not standalone headings", () => {
    const draft = buildDocumentTemplatePayloadManualDefaults();
    const html = buildAgreementBodyHtml(draft);

    expect(html).toContain('<span class="agreement-lead">Tax Levy.</span>');
    expect(html).toContain('<span class="agreement-lead">Taxes Generally.</span>');
    expect(html).toContain('<span class="agreement-lead">Transaction Taxes.</span>');
    expect(html).toContain('<span class="agreement-lead">Withholding Taxes.</span>');
    expect(html).not.toContain('<h3 class="agreement-h3">Tax Levy</h3>');
  });

  it("renders bullet lists for itemised clauses", () => {
    const draft = buildDocumentTemplatePayloadManualDefaults();
    const html = buildAgreementBodyHtml(draft);

    expect(html).toContain('<ul class="agreement-list">');
    // Responsibilities list (5 items in draft).
    expect(html).toContain("accurately communicate, and not misrepresent");
    // Reps & Warranties list with nested sub-list (Merchant Offering: free from defects, ...).
    expect(html).toContain('<ul class="agreement-sublist">');
    expect(html).toContain("free from defects in workmanship");
  });

  it("renders Payment sub-sections (Tax Levy / Taxes Generally / etc)", () => {
    const draft = buildDocumentTemplatePayloadManualDefaults();
    const html = buildAgreementBodyHtml(draft);

    expect(html).toContain("Tax Levy");
    expect(html).toContain("Taxes Generally");
    expect(html).toContain("Transaction Taxes");
    expect(html).toContain("Withholding Taxes");
  });

  it("renders Dispute Resolution sub-sections", () => {
    const draft = buildDocumentTemplatePayloadManualDefaults();
    const html = buildAgreementBodyHtml(draft);

    expect(html).toContain("Binding Arbitration");
    expect(html).toContain("Class Action Waiver");
    expect(html).toContain("Choice of Law");
    expect(html).toContain("Injunctive Relief");
  });

  it("renders BSG static identity and KASEF PAY co-entity defaults", () => {
    const draft = buildDocumentTemplatePayloadManualDefaults();
    const html = buildAgreementBodyHtml(draft);

    expect(html).toContain("Black Stripe Group LTD");
    expect(html).toContain("United Kingdom");
    expect(html).toContain("KASEF PAY INC");
    expect(html).toContain("British Columbia, Canada");
  });

  it("falls back to merchant placeholders when fields are blank", () => {
    const draft = buildDocumentTemplatePayloadManualBlank();
    const html = buildAgreementBodyHtml(draft);

    expect(html).toContain("[Merchant legal name]");
    expect(html).toContain("var-placeholder");
  });

  it("substitutes filled merchant fields and marks them as filled", () => {
    const draft = buildDocumentTemplatePayloadManualBlank();
    draft.agreementParties = {
      ...draft.agreementParties,
      merchantLegalName: "Acme Corp",
      merchantJurisdiction: "Delaware",
      merchantRegisteredAddress: "1 Wall St, NY, USA"
    };
    const html = buildAgreementBodyHtml(draft);

    expect(html).toContain("Acme Corp");
    expect(html).toContain("Delaware");
    expect(html).toContain("1 Wall St, NY, USA");
    expect(html).toContain("var-filled");
  });

  it("marks co-entity fields as default when matching shipped defaults", () => {
    const draft = buildDocumentTemplatePayloadManualDefaults();
    const html = buildAgreementBodyHtml(draft);

    expect(html).toMatch(/var-default[^"]*">KASEF PAY INC</);
  });

  it("marks co-entity fields as filled when overridden", () => {
    const draft = buildDocumentTemplatePayloadManualDefaults();
    draft.agreementParties = {
      ...draft.agreementParties,
      serviceProviderCoEntityName: "Other Acquirer Ltd"
    };
    const html = buildAgreementBodyHtml(draft);

    expect(html).toMatch(/var-filled[^"]*">Other Acquirer Ltd</);
  });
});

describe("buildOfferPdfHtml — scope-aware composition", () => {
  // Markers that only appear in the rendered DOM (not in CSS or subtitle):
  const PAYIN_SECTION_MARKER = "Card Acquiring — Credit / Debit Cards, APM &amp; E-wallet";
  const AGREEMENT_BODY_MARKER = '<div class="agreement-body">';

  it("offer scope renders pricing sections only, no agreement body", () => {
    const draft = withScope(buildDocumentTemplatePayloadManualDefaults(), "offer");
    const html = buildOfferPdfHtml(draft);

    expect(html).toContain(PAYIN_SECTION_MARKER);
    expect(html).toContain("Other Services &amp; Fees");
    expect(html).not.toContain(AGREEMENT_BODY_MARKER);
    expect(html).not.toContain("Binding Arbitration");
    expect(html).toContain("COLLECTION MODEL");
    expect(html).toContain("COLLECTION FREQUENCY");
  });

  it("offerAndAgreement scope renders both bodies in one document, pricing before MSA", () => {
    const draft = withScope(buildDocumentTemplatePayloadManualDefaults(), "offerAndAgreement");
    const html = buildOfferPdfHtml(draft);

    expect(html).toContain(PAYIN_SECTION_MARKER);
    expect(html).toContain(AGREEMENT_BODY_MARKER);
    expect(html).toContain("Binding Arbitration");
    expect(html).toContain("COLLECTION MODEL");
    expect(html.indexOf(PAYIN_SECTION_MARKER)).toBeLessThan(html.indexOf(AGREEMENT_BODY_MARKER));
  });

  it("highlightVariables option adds body class for screen-only highlight", () => {
    const draft = withScope(buildDocumentTemplatePayloadManualBlank(), "offerAndAgreement");

    const withHighlight = buildOfferPdfHtml(draft, { highlightVariables: true });
    const withoutHighlight = buildOfferPdfHtml(draft);

    expect(withHighlight).toContain('<body class="highlight-variables">');
    expect(withoutHighlight).toContain("<body>");
    expect(withoutHighlight).not.toContain('class="highlight-variables"');
  });
});

describe("hide-if-empty column rule", () => {
  it("payout MINIMUM FEE column is hidden when payoutMinimumFeeEnabled toggle is off", () => {
    const draft = withScope(buildDocumentTemplatePayloadManualDefaults(), "offer");
    // manualDefaults seed: payoutMinimumFeeEnabled = false → column must hide.
    expect(draft.toggles.payoutMinimumFeeEnabled).toBe(false);

    const html = buildOfferPdfHtml(draft);
    expect(html).not.toContain("MINIMUM FEE");
  });

  it("payout MINIMUM FEE column is shown when toggle is on with positive value", () => {
    const draft = withScope(buildDocumentTemplatePayloadManualDefaults(), "offer");
    draft.toggles.payoutMinimumFeeEnabled = true;
    draft.toggles.payoutMinimumFeePerTransaction = 2.5;

    const html = buildOfferPdfHtml(draft);
    expect(html).toContain("MINIMUM FEE");
    expect(html).toContain("€2.50");
  });

  it("payin MIN. TRANSACTION FEE column is hidden when no threshold/fee pair is configured", () => {
    const draft = withScope(buildDocumentTemplatePayloadManualBlank(), "offer");
    // manualBlank seed: all payin minimum-fee fields are 0 → column must hide.
    const html = buildOfferPdfHtml(draft);
    expect(html).not.toContain("MIN. TRANSACTION FEE");
  });

  it("payin MIN. TRANSACTION FEE column is shown when defaults provide threshold + fee", () => {
    const draft = withScope(buildDocumentTemplatePayloadManualDefaults(), "offer");
    // manualDefaults seed pre-fills 2.5M / €1.00 in overall mode.
    const html = buildOfferPdfHtml(draft);
    expect(html).toContain("MIN. TRANSACTION FEE");
    expect(html).toContain("≤2.5M: €1.00");
  });
});

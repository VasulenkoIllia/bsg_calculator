# AGREEMENT (Service Agreement) Structure

Date: 2026-05-02
Status: Reference for the planned AGREEMENT renderer. Source: `Extended Schedule 4 - MSA format.docx`.

## 1. What this document is

The AGREEMENT (`Commercial Pricing Schedule Terms of Agreement` per spec section 6.1) is the long-form contract that bundles:

1. The OFFER body (Sections 1–4 — same layout used today).
2. The Master Service Agreement (MSA) legal text — ~10 pages of standard clauses.
3. A 3-party signature block.

In the reference set, AGREEMENT is observed as 11-page bundles in `ZenCreator Commercial Offer 1.1`, `ATOM Commercial Offer 1.0 and MSA`, and `CEI Commercial Offer 1.0 and MSA_Director Signed`.

## 2. Top-level structure

```
[Page 1–2 / 1–3]    OFFER body
                     ├── Header (CONFIDENTIAL · PAYMENT INFRASTRUCTURE / Service Agreement)
                     ├── Section 1 — Card Acquiring (Payin)
                     ├── Section 2 — Card Acquiring (Payout)
                     ├── Section 3 — Other Services & Fees
                     └── Section 4 — Terms & Limitations
[Page 3+]           MSA appendix (Service Agreement long-form text)
[Last page]         Signature block (3 parties)
```

The same OFFER renderer is reused for pages 1–2/3. The MSA appendix is appended after Section 4 and uses the same `print-footer`, so page-of-N numbering keeps working without special casing.

## 3. MSA section list (canonical)

Section names extracted from `Extended Schedule 4 - MSA format.docx`. Each section is a heading followed by 1–N paragraphs. Order is fixed.

1. **Parties identification** — names, registered addresses of BSG, the second Service Provider entity (e.g. KASEF PAY INC), and the Merchant.
2. **Overview of this agreement** — incorporation of Terms and Conditions; amendment policy.
3. **Your Service Provider Account** — onboarding KYC requirements and preliminary-account rules.
4. **Validation and Underwriting** — request-additional-info clauses; third-party data retrieval.
5. **Your Relationship with Your Customers** — Merchant's responsibilities; Transaction definition.
6. **Responsibilities and Disclosures to Your Customers** — communication, receipts, refund/return policy; recurring billing rules.
7. **Payment** — five sub-clauses:
   - Tax Levy
   - Taxes Generally
   - Transaction Taxes
   - Withholding Taxes
   - Payment terms (offset/withhold rules; payment via invoice)
8. **Customer Data Restrictions** — data handling; breach notification; termination return-or-destroy.
9. **Term and Termination** — open-ended Term; either-party termination rules.
10. **Intellectual Property Rights** — Merchant IP / Third Party IP / Service Provider IP licenses; Feedback assignment.
11. **Representations and Warranties** — 13 lettered representations from Merchant.
12. **Indemnification** — Merchant indemnifies Service Provider for nine listed categories.
13. **Confidentiality** — non-disclosure; injunctive relief.
14. **Limitation of Liability** — uppercase paragraph; 6-month cap; 90-day claim window.
15. **Dispute Resolution** — sub-sections:
    - Binding Arbitration (LCIA, London)
    - Class Action Waiver
    - Choice of Law / No Jury Trial
    - Injunctive Relief / Attorneys' Fees
16. **Other** — independent contractors, joint and several liability, entire agreement, assignment, severability, blanket warranty disclaimer.
17. **Signature block** — three signature panels:
    - `Black Stripe Group LTD` (BSG)
    - `KASEF PAY INC` (or other Service Provider co-entity per contract)
    - `[Merchant's legal name]`
    - Each panel: `Date`, `Name`, `Title`, `Signature` (4 lines).

## 4. Variable placeholders

The MSA template is mostly static, but the following fields vary per contract:

| Placeholder | Source | Notes |
|---|---|---|
| Merchant legal name | wizard input | appears in parties block and signature block |
| Merchant jurisdiction | wizard input | "a company incorporated under the laws of [*]" |
| Merchant registered address | wizard input | "having its registered office at [*]" |
| Service Provider co-entity name | wizard input or default `KASEF PAY INC` | second Service Provider Entity |
| Service Provider co-entity jurisdiction | wizard input | currently `British Columbia, Canada` |
| Service Provider co-entity address | wizard input | currently `3200 - 650 West Georgia Street, Vancouver BC V6B 4P7, Canada` |

BSG details (`Black Stripe Group LTD`, UK address) are the same across all contracts and can stay as constants in the renderer.

### Counterparty data availability (current phase)

These party fields are **not yet available** from any system source — neither calculator, nor backend, nor HubSpot. Until the data layer is built (Phase 8 + HubSpot phase), the wizard collects them manually in Step 7 (Parties & Signatures). When the user leaves a field blank, the renderer falls back to the bracketed placeholder used in the source MSA template (`[Merchant legal name]`, `[*]`), so the rendered AGREEMENT remains usable as a draft.

The same caveat applies to any OFFER text that names a counterparty (e.g. on cover pages or party headers when those are added in the future). The handling pattern stays the same: manual wizard input now → automatic fill from HubSpot/DB once those exist.

## 5. Visual rules (proposed)

1. Reuse the OFFER paper, header, and footer.
2. MSA section headings: same color and weight as OFFER section badges, smaller font (≈14pt instead of 49px).
3. Body paragraphs: 10–11pt, line-height 1.45, justified or left-aligned (consistent with reference samples).
4. Capitalized clauses (Limitation of Liability, Class Action Waiver, etc.) preserved verbatim.
5. Signature block: 3 columns, equal width, with bordered panels matching the OFFER `terms-item` style.

## 6. Proposed implementation

```
src/components/document-wizard/
├── buildOfferPdfHtml.ts                # existing — orchestrator
├── offerPdf/                           # existing
└── agreementPdf/
    ├── index.ts                        # buildAgreementAppendixHtml(payload)
    ├── parties.ts                      # parties block
    ├── sections/                       # one file per MSA section (1..16)
    │   ├── overview.ts
    │   ├── account.ts
    │   ├── underwriting.ts
    │   ├── customerRelationship.ts
    │   ├── customerDisclosures.ts
    │   ├── payment.ts
    │   ├── customerData.ts
    │   ├── termAndTermination.ts
    │   ├── ip.ts
    │   ├── repsAndWarranties.ts
    │   ├── indemnification.ts
    │   ├── confidentiality.ts
    │   ├── limitationOfLiability.ts
    │   ├── disputeResolution.ts
    │   └── other.ts
    └── signatureBlock.ts
```

Wizard payload extension:

```
documentScope: "offer" | "agreement";
agreementParties?: {
  merchantLegalName: string;
  merchantJurisdiction: string;       // e.g. "England and Wales"
  merchantRegisteredAddress: string;
  serviceProviderCoEntityName: string;       // default "KASEF PAY INC"
  serviceProviderCoEntityJurisdiction: string; // default "British Columbia, Canada"
  serviceProviderCoEntityAddress: string;    // default "3200 - 650 West Georgia Street, Vancouver BC V6B 4P7, Canada"
};
```

Renderer wiring:

```ts
function buildBody(data, layout) {
  const offerBody = [payinSection, payoutSection, feesSection, termsSection].filter(Boolean).join("");
  if (data.documentScope !== "agreement") return offerBody;
  return offerBody + buildAgreementAppendixHtml(data);
}
```

The existing footer (`renderFooter`) keeps emitting per-page numbers because CSS `counter(pages)` works regardless of how many sections are added.

## 7. Out-of-scope (current phase)

1. **Editing of MSA clause body** — the template body is treated as static text. Edits to specific clauses (e.g. arbitration jurisdiction switch) would be a future enhancement.
2. **Translation / localization** — only English.
3. **Customer-specific addenda or schedules** — not modeled. The Schedule 4 docx itself is one such addendum format; the Phase 7 implementation handles the agreement body only.
4. **E-signature integration** — the rendered PDF carries blank signature lines. Sign.com or DocuSign integration is a separate phase.

## 8. References

- Source template: `Extended Schedule 4 - MSA format.docx` (provided 2026-05-02).
- Sample bundles: `ZenCreator Commercial Offer 1.1 (3).pdf`, `ATOM Commercial Offer 1.0 and MSA.pdf`, `CEI Commercial Offer 1.0 and MSA_Director Signed.pdf`.
- Implementation plan: `docs/phase_07_unified_document_pipeline_plan.md` (will be extended once AGREEMENT scope is approved).

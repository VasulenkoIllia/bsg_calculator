# Offer + Terms of Agreement — Document Structure

Date: 2026-05-03 (refreshed)
Status: Reference for the AGREEMENT renderer.
Source of truth: **`DRAFT TEXT.docx`** (provided 2026-05-03). Visual style aligned to the signed `CEI Commercial Offer 1.0 and MSA (for signature).pdf` and `ZenCreator Commercial Offer 1.1 (signed).pdf` references.

## 1. What this document is

The system supports exactly **two** document types (per product decision 2026-05-03):

1. **Offer** — `Commercial Pricing Schedule`. Sections 1–4 of pricing only.
2. **Offer + Terms of Agreement** — `Commercial Pricing Schedule + Terms of Agreement`. Sections 1–4 of pricing + Master Service Agreement long-form legal body + 3-party signature block.

There is no standalone "agreement-only" output. Every contract carries the pricing schedule.

This file describes the structure of the second, larger output. In the reference set the bundle is observed as 11-page documents in `ZenCreator Commercial Offer 1.1`, `ATOM Commercial Offer 1.0 and MSA`, and `CEI Commercial Offer 1.0 and MSA_Director Signed`.

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

## 5. Visual rules (current implementation, matches DRAFT TEXT.docx)

1. Reuse the OFFER paper, header, and footer.
2. **Opening line** (`THIS SERVICE AGREEMENT (THE "AGREEMENT") IS ENTERED INTO BETWEEN:`): bold uppercase paragraph, no separate "Parties" heading.
3. **Main section headings** (`OVERVIEW OF THIS AGREEMENT`, `PAYMENT`, `INDEMNIFICATION`, …): bold black 11pt rendered uppercase via CSS `text-transform`. Top margin 22pt to separate from previous block. Source data is title case for readability.
4. **Two subsection styles**:
   - **Inline bold leads** — `Tax Levy.`, `Taxes Generally.`, `Transaction Taxes.`, `Withholding Taxes.` open the first paragraph of the Payment block. Rendered via `<span class="agreement-lead">…</span>` on the same paragraph.
   - **Standalone uppercase headings** — `BINDING ARBITRATION`, `CLASS ACTION WAIVER`, `CHOICE OF LAW/NO JURY TRIAL`, `INJUNCTIVE RELIEF/ATTORNEYS' FEES` appear as their own lines under Dispute Resolution. Rendered via `<h3 class="agreement-h3">…</h3>` with CSS uppercase.
5. **Body paragraphs**: 10.5pt, line-height 1.5, fully justified, 14pt bottom margin.
6. **Bullet lists** (`<ul class="agreement-list">`): used wherever the draft has itemised clauses — `(i)–(v)` Responsibilities, `(a)–(m)` Representations & Warranties, `(a)–(i)` Indemnification, etc. List item `(m)` of Reps & Warranties carries a nested `<ul class="agreement-sublist">` for the three Merchant Offering qualities.
7. **Capitalized clauses** (Limitation of Liability body, Class Action Waiver, Choice of Law list) preserved verbatim in uppercase as in source MSA.
8. **Signature block**: 3 columns, equal width, with bordered panels.

### Future user-supplied template

The user will later supply an updated MSA template where every editable variable is wrapped as `[variable]`. When that template arrives:

- The wizard's Parties step will expose those variables as labeled inputs.
- The renderer substitutes them inline, using the existing `var-filled` / `var-default` / `var-placeholder` highlight styles for screen preview.
- Final PDF stays clean (highlights screen-only).

The current renderer already supports this pattern for the parties block (Merchant legal name / jurisdiction / address, Service Provider co-entity name / jurisdiction / address). Adding new variables is additive — extend `AgreementParties` in `legalDefaults.ts`, add inputs in `PartiesStep`, reference them in `sections.ts` text via the same substitution helper.

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
documentScope: "offer" | "offerAndAgreement";
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
  if (data.documentScope === "offerAndAgreement") {
    return offerBody + buildAgreementAppendixHtml(data);
  }
  return offerBody;
}
```

The existing footer (`renderFooter`) keeps emitting per-page numbers because CSS `counter(pages)` works regardless of how many sections are added.

## 7. Out-of-scope (current phase)

1. **Editing of MSA clause body** — the template body is treated as static text. Edits to specific clauses (e.g. arbitration jurisdiction switch) would be a future enhancement.
2. **Translation / localization** — only English.
3. **Customer-specific addenda or schedules** — not modeled. The Schedule 4 docx itself is one such addendum format; the Phase 7 implementation handles the agreement body only.
4. **E-signature integration** — the rendered PDF carries blank signature lines. Sign.com or DocuSign integration is a separate phase.

## 8. References

- **Authoritative source**: `DRAFT TEXT.docx` (provided 2026-05-03). Earlier `Extended Schedule 4 - MSA format.docx` superseded by this draft.
- Visual baseline: `CEI Commercial Offer 1.0 and MSA (for signature).pdf` and `ZenCreator Commercial Offer 1.1 (signed).pdf`.
- Reference bundle samples (older): `ZenCreator Commercial Offer 1.1 (3).pdf`, `ATOM Commercial Offer 1.0 and MSA.pdf`, `CEI Commercial Offer 1.0 and MSA_Director Signed.pdf`.
- Implementation plan: [phase_07_unified_document_pipeline_plan.md](phase_07_unified_document_pipeline_plan.md).

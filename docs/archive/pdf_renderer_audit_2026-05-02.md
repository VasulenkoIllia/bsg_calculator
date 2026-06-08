# PDF Renderer Audit — Visual Fidelity vs 8 Reference Samples

Date: 2026-05-02 (triaged 2026-05-03)
Status: Triaged. Most findings closed per product direction; one flagged for decision.

## Purpose

Each finding below was discovered by comparing the current OFFER renderer (`src/components/document-wizard/buildOfferPdfHtml.ts` + `offerPdf/sections/*` + `pdf-kit/*`) against the 8 reference PDFs listed in [pdf_rendering_logic_matrix.md](pdf_rendering_logic_matrix.md).

## Triage rule (2026-05-03)

> Reference PDFs are taken as source of truth for **layout, blocks, modules, design** — not for values. Concrete values come from the calculator (when source = calculator) or from manual wizard input (when source = manual). Findings that point at sample-specific values are closed without action.

## Resolved (no action)

The following findings are closed under the triage rule:

| ID | Topic | Reason for closure |
|---|---|---|
| F3.1 | `· NA if processing volume is over 1M /mo` annotation under MMAF | Sample-specific value, not template structure. Calculator-driven path renders only what the calculator defines. |
| F3.2 | `Waived for EU only` / `MMAF to be charged from 4th month` extras under cards | Same — sample-specific values. |
| F3.3 | "Waived" default when `accountSetupFee` is zero | Confirmed: hide-if-empty is the intended behavior. |
| F4.4 | `Rolling Reserve Cap` defaulting to `TBD` | Confirmed: hide-if-empty. |
| F4.5 | `Max. Payout Transaction Size` defaulting to `N/A` | Confirmed: hide-if-empty. |
| F1.1 | Section 1 free-form footnote (Aron, Finera) | Sample-specific text. Section footnote feature not added. |
| F4.6 | Section 4 free-form footnote (Finera) | Same. |
| F1.2 | Column-header markers `*` / `**` for footnote linkage | Tied to F1.1/F4.6 — closed. |
| F4.7 | Spelling drift `bank` / `banking holidays` | Variation of `Settlement Note` text. Decided alongside F4.1 (see below). |

## ✅ Resolved 2026-05-03

### F4.1 / F4.2 / F4.3 — Section 4 legal-text fields lifted into payload

Decision: **promote to payload** (option 2). Implemented:

- New module `src/components/document-wizard/legalDefaults.ts` holding `DEFAULT_DOCUMENT_LEGAL_TERMS` and `DocumentScope`.
- `DocumentTemplatePayload.contractSummary` extended with `settlementNote`, `clientType`, `restrictedJurisdictions`.
- All three `buildDocumentTemplatePayload*` builders seed defaults from the new constants.
- Step 5 (Terms) gained a "Legal Terms (rendered in Section 4)" panel with editable inputs.
- Renderer (`offerPdf/sections/terms.ts`) now reads from payload; the previous `TERMS_DEFAULTS` constant block was removed.
- Existing test fixtures in `fromCalculator.test.ts` updated to include the new fields.

Calculator math untouched. Verified with `npm run verify` (typecheck + lint + 151/151 tests + build).

### FN.1 — Document number placeholder comment

Decision: **add comment** (no functional change). Implemented:

- Documented `defaultDraftNumber()` in `fromCalculator.ts` as a Phase 1 placeholder; replacement target is the Phase 8 backend numbering service.

### Foundation for FA.1 (AGREEMENT)

Implemented:
- New `documentScope: "offer" | "offerAndAgreement"` field added to `DocumentTemplatePayload` and seeded by all three builders. Default value: `offer`.
- No UI / renderer change yet — Phase 2 will add the Step 1 dropdown, Step "Parties & Signatures", and the `agreementPdf/` module per [agreement_structure.md](agreement_structure.md).

## ✅ Phase 2 delivered (2026-05-03)

### FA.1 — AGREEMENT renderer + Document Type dropdown
Implemented:
- `Document Type` dropdown in Step 1 drives `documentScope` (`offer` / `agreement` / `offerAndAgreement`). No separate "Scope" field.
- Static MSA body text in `agreementPdf/sections.ts` (16 sections + sub-sections); only counterparty placeholders are user-editable.
- `agreementPdf/parties.ts` and `agreementPdf/signatureBlock.ts` substitute placeholders with values.
- Scope-aware renderer in `buildOfferPdfHtml.ts`:
  - `offer` → unchanged behavior.
  - `agreement` → header (without pricing meta) + AGREEMENT body + footer.
  - `offerAndAgreement` → both bodies in one document.
- New `Parties & Signatures` wizard step shown only for `agreement` / `offerAndAgreement`.
- Pricing wizard steps (Payin/Payout/Other Fees/Terms) hidden when scope is `agreement`.
- Variable highlight toggle in preview (yellow = filled, indigo = default, orange = unfilled placeholder). Print stylesheet strips highlight so generated PDF stays clean.

Verification: `npm run verify` green (typecheck + lint + 151/151 tests + build).

(Original Phase 2 plan kept below for historical reference.)

### FA.1 🟥 AGREEMENT (long-form) renderer + document-scope dropdown

- **Confirmed by product**: needed.
- **Spec**: see [agreement_structure.md](agreement_structure.md).
- **UI**: dropdown in Step 1 (Header / Meta) — `Commercial Pricing Schedule (Offer)` vs `Service Agreement (Offer + MSA)`.
- **Internal change**: `documentScope: "offer" | "offerAndAgreement"` on `DocumentTemplatePayload` controls whether the MSA appendix + 3-party signature block is appended after the pricing schedule.
- **Counterparty data caveat**: party fields (Merchant legal name, jurisdiction, address; Service Provider co-entity details) are **not yet available** in the system — they will arrive with the backend / DB / HubSpot phase. For now the AGREEMENT renderer must accept manual input via the wizard (Step 7 — "Parties & Signatures"), with optional field-level placeholders (e.g. `[Merchant legal name]`) when the user has nothing to enter.
- The same caveat applies to OFFER fields that name a counterparty — those entries will become real once we have the data layer.

## Recommended next steps (Phase 2)

1. Step 1 dropdown — `Offer` / `Agreement` / `Offer + Agreement` — bound to existing `documentScope` field.
2. New "Parties & Signatures" wizard step — visible only when `documentScope ∈ {agreement, offerAndAgreement}`.
3. `agreementPdf/` module per [agreement_structure.md](agreement_structure.md):
   - 14 section files (`overview.ts` … `other.ts`),
   - `parties.ts` and `signatureBlock.ts`,
   - placeholder substitution only — MSA body text stays static.
4. Scope-aware orchestrator:
   - `offer` → render Sections 1–4 only (today's behavior).
   - `agreement` → render header + MSA appendix + signature block (no pricing).
   - `offerAndAgreement` → render Sections 1–4 + MSA appendix + signature block in one document.
5. Stepper adapts to scope (skips pricing steps when scope = `agreement`).
6. (Deferred) DOCX export pipeline — separate phase, not blocking.

Keep all other items closed unless a future sample reveals a new structural shape.

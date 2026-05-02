# PDF Rendering Logic Matrix

Date: 2026-05-02  
Status: Active (derived from specification + 8 reference commercial offers)

## 1. Sources used

Specification:

- `technical_specification_bsg.docx` (section 6 + section 9)

Reference PDFs:

- `ZenCreator Commercial Offer 1.1 (3).pdf`
- `Aron Group Commercial Offer 1.0 (2).pdf`
- `CEI Commercial Offer 1.0 and MSA_Director Signed.pdf`
- `Finera Commercial Offer 1.0.pdf`
- `ATOM Commercial Offer 1.0 and MSA.pdf`
- `Pay.cc Commercial Offer 1.1.pdf`
- `SoftGaming Commercial Offer 1.0.docx.pdf`
- `TodaPay Commercial Offer 1.0.pdf`

Extraction notes:

- 7 files contain selectable text and were parsed with `pdftotext -layout`.
- CEI PDF has no text layer; OCR was used via `tesseract` on rasterized pages.

## 2. Stable visual baseline across all references

1. A4 page format.
2. Header start with `CONFIDENTIAL · PAYMENT INFRASTRUCTURE`.
3. Title block `Service Agreement`.
4. Core section order is fixed:
   - Section 1: Payin,
   - Section 2: Payout,
   - Section 3: Other Services & Fees,
   - Section 4: Terms & Limitations.
5. Table style is consistent with spec tokens:
   - header `#366092`,
   - body stripes `white / #F5F5F5`,
   - borders `#CCCCCC`,
   - compact 9–10pt data typography.
6. Footer contains confidentiality notice + page marker.

## 3. Observed per-file deltas (content, not template fork)

### ZenCreator
- Header uses `SETTLEMENT MODEL` and value `IC++ / Interchange Plus`.
- Payin: EU + Global, tiered (Up to 1M / 1M-3M / Above 3M).
- Payout: fixed `2%`, `€0.50`, minimum `€2.50`.
- Other fees include setup `€1,000` and monthly min as `NA`.
- Terms include `T+3`, min payout `€60`.

### Aron Group
- Header uses `COLLECTION MODEL` and value `IC++ / Blended`.
- Payin: EU + Global, tiered (Up to 10M / 10M-25M / Above 25M).
- Includes min-transaction-fee footnote under section 1.
- Payout fixed `2%`, `€0.50`, minimum `€2.50`.
- Terms include `T+4`.

### CEI (OCR)
- Structure matches standard 4-section offer.
- Payin appears tiered EU + Global with same 10M/25M boundaries.
- Payout appears `1.8%`, `€0.50`, minimum `€2.00`.
- Terms include `T+3`, min payout appears `€20`.

### Finera
- Payin tiered EU + Global; includes decline-fee footnote marker `**`.
- Payout fixed `2%`, `€0.50`, `€2.50`.
- Other fees: settlement `Waived`, monthly min `Waived`.
- Terms add condition line for decline-fee removal.

### ATOM
- Payin tiered EU + Global (10M/25M).
- Payout fixed `1.8%`, `€0.50`, `€2.00`.
- Monthly minimum fee `Waived`.
- Terms: min payout `€50`.

### Pay.cc
- Payin tiered EU + Global (10M/25M).
- Payout fixed `2%`, `€0.50`, `€2.50`.
- Terms: `T+4`.

### SoftGaming
- Header uses `SETTLEMENT MODEL` and value `IC++ / Interchange Plus`.
- Payin tiered EU + Global.
- Payout fixed `2%`, `€0.50`, `€2.50`.
- Other fees: setup `€2,000`, monthly minimum `€5,000`.

### TodaPay
- Payin tiered EU + Global with custom boundaries (5M/7M).
- Payout fixed `2%`, `€0.50`, `€2.50`.
- Settlement fee includes note `Waived for EU only`.
- Terms: `T+4`.

## 4. Rendering modes matrix (single shared template)

Rules are driven by data shape only; no template branching by customer.

### Section 1 (Payin)

1. `tiers + regions`:
- Region column is shown (`EU`, `Global`).
- Tier column is shown.
- Rows are region x tier.

2. `no tiers + regions`:
- Region column is shown.
- Tier column is hidden or set to `Non-tiered, fixed`.
- One row per region.

3. `tiers + no regions`:
- Region column is hidden.
- Tier column is shown.
- Rows are tier-only.

4. `no tiers + no regions`:
- Region and tier columns are hidden.
- Single fixed row.

### Section 2 (Payout)

1. `global + fixed`:
- Matches references: one global fixed row.

2. `global + tiered`:
- Tier column enabled.
- One global row per tier.

3. `disabled`:
- Full section omitted.

## 5. Missing data rule

For `source=calculator` mode:

1. If value is absent, corresponding row/card is not rendered.
2. Generator must not inject synthetic placeholders (`TBD`, `N/A`, `Waived`) unless mode is explicitly set by user.

For `source=manual` or `source=clone` mode:

1. Value modes may be used explicitly per field:
   - `value`, `waived`, `na`, `tbd`.

## 6. Implementation mapping

Implemented in frontend renderer module:

- `src/components/document-wizard/types.ts`
  - `DocumentWizardLayout`
  - value-mode types
- `src/components/document-wizard/fromCalculator.ts`
  - calculator -> layout normalization
- `src/components/document-wizard/buildOfferPdfHtml.ts`
  - modular section builders
  - mode-based table rendering
  - calculator-source missing-data suppression

## 7. Scope boundary

This matrix covers OFFER template behavior only (section 6.1 + 9.4 from spec).  
AGREEMENT long-form variants stay out of current phase scope.

# Calculator — Deferred Changes Log

Tracks changes that have been applied to the **OFFER PDF templates** and the
**Document Wizard** but NOT to the calculator itself, because the calculator
math/business logic is frozen by product (see user memory:
`feedback_calculator_frozen.md`).

When we unfreeze the calculator and revisit it, this list is the punch list of
parity changes to apply there too so the calculator UI / formula display match
the PDF + Wizard wording.

> **Convention:** Each entry must record the date, user request, what changed
> in PDF/Wizard, and the exact files/symbols that need to mirror the change in
> the calculator. Always include line numbers when possible.

---

## 1. Region label: `EU` → `EEA + UK`

- **Date:** 2026-05-07
- **User request:** "EU – замена на EEA + UK" (visible in OFFER PDF region
  column under `Card Acquiring — Credit / Debit Cards, APM & E-wallet`).
- **Already applied (PDF + Wizard):**
  - `src/components/document-wizard/offerPdf/sections/payin.ts` — `label: "EU"`
    → `label: "EEA + UK"` in `resolvePayinRegionContexts` (region label in the
    pricing table).
  - `src/components/document-wizard/wizard/shared.tsx` —
    `PAYIN_REGION_LABELS.eu: "EU"` → `"EEA + UK"` (used by the Wizard's
    PayinStep when the user picks a region).
  - `src/components/document-wizard/buildPdfUiKitHtml.ts` — `<td>● EU</td>`
    → `<td>● EEA + UK</td>` in the design-reference page.
  - `src/components/document-wizard/fromCalculator.test.ts` — test assertion
    `expect(html).toContain("● EU")` updated to `"● EEA + UK"`.
- **Pending in calculator (do NOT touch until calculator is unfrozen):**
  - `src/components/calculator/derived/buildPayinSubtree.ts` — `regionLabel`
    parameter still typed as `"EU" | "WW"` and used in:
    - line ~44, ~99: function signatures `regionLabel: "EU" | "WW"`.
    - line ~382-383: `buildPayinCostFormula("EU", …)` and
      `buildPayinCostChildren("eu", "EU", …)` — formula display strings.
  - `src/components/calculator/zones/Zone3PricingConfiguration.tsx` —
    `regionLabel="EU"` prop passed to a child component (line ~133).
  - Any test/snapshot that checks the calculator's formula display text
    containing `"EU"`.
- **Notes for the calculator change:**
  - The internal data key `eu` should stay (do not rename the type union
    `"eu" | "ww"` or any state field).
  - Only the **display label** moves from `"EU"` to `"EEA + UK"`. Consider
    splitting `regionLabel: "EU" | "WW"` into `regionCode: "eu" | "ww"`
    plus a derived display label so the calculator and PDF share one
    canonical label source.

---

## 2. Percentage display: always 2 decimals

- **Date:** 2026-05-07
- **User request:** "приведи всі відсотки в візарді в пдф до одного вигляду
  що б було 0.01 6.00 всі відсотки з 2 значеннями після коми" — show every
  percentage with exactly two decimal places (e.g. `5.00%`, `4.50%`,
  `0.30%`, `0.01%`).
- **Already applied (PDF + Wizard):**
  - `src/components/document-wizard/offerPdf/formatters.ts` — `formatPercent`
    rewritten: dropped the `Number.isInteger` shortcut and the
    `minimumFractionDigits: 1` branch; now always uses
    `minimumFractionDigits: fractionDigits` (default 2).
  - `src/components/document-wizard/offerPdf/sections/terms.ts` — call
    `formatPercent(summary.rollingReservePercent)` (was `..., 0`) so
    Rolling Reserve renders as `10.00% · 90 days`.
  - `src/components/document-wizard/offerPdf/sections/fees.ts` — call
    `formatPercent(data.toggles.failedTrxOverLimitThresholdPercent)`
    (was `..., 0`) so Failed TRX renders as `Over limit only (70.00%)`.
  - `src/components/document-wizard/fromCalculator.test.ts` — assertion
    updated from `"Over limit only (70%)"` to `"Over limit only (70.00%)"`.
- **Pending in calculator (do NOT touch until calculator is unfrozen):**
  - `src/components/calculator/NumberField.tsx` — wizard percentage inputs
    re-use this calculator-owned component, which displays via
    `formatInputNumber` (`min 0 / max 2` decimals — so `5` shows as `5`
    instead of `5.00` when the field is blurred).
  - `src/components/calculator/numberUtils.ts:formatInputNumber` —
    central format helper. Add a `minimumFractionDigits` parameter (or
    a sibling `formatPercentInput` helper) so percentage inputs in the
    Wizard's PayinStep / PayoutStep / TermsStep / OtherFeesStep can be
    pinned to 2 decimals on blur, matching the PDF.
  - Calculator zones that show formula-rendered percentages (e.g.
    `buildPayinSubtree.ts` formula display lines like `MDR × volume = …`)
    should also normalise to 2 decimals once the calculator is unfrozen.
- **Notes for the calculator change:**
  - Keep underlying numeric values untouched (only display formatting
    changes). All math/business logic stays as-is.
  - Consider extracting a single `formatDisplayPercent(value, digits=2)`
    helper that both the calculator and the PDF call — eliminates
    drift between the two.

---

## 3. Per-fee "N/A" toggles (TRX fee + MIN. TRX fee)

- **Date:** 2026-05-07
- **User request:** introduce explicit "N/A" checkboxes next to each
  fee input so the OFFER PDF can render the literal `N/A` for any
  individual fee value while keeping the rest of the row populated
  (e.g. `C/D: €0.50 / APM: N/A`). Three states per cell:
    1. value present → display value
    2. value empty → block hidden by global hide-if-empty rule
    3. N/A toggle on → display "N/A"
- **Already applied (PDF + Wizard):**
  - `src/components/document-wizard/types.ts` — added boolean flags
    next to numeric fee fields:
    - `PayinFeeBlock.trxCcNa`, `PayinFeeBlock.trxApmNa`
      (used by both `single` and each tier in `payinPricing.eu/ww`)
    - `PayoutFeeBlock.trxFeeNa` (single + each tier)
    - `contractSummary.payoutMinimumFeeEuNa`,
      `contractSummary.payoutMinimumFeeWwNa` (per-region NA for
      MIN. TRANSACTION FEE on the payin table; works in both
      `payoutMinimumFeeMode: "overall"` and `"byRegion"`)
    - `toggles.payoutMinimumFeePerTransactionNa` (payout MINIMUM FEE)
  - `src/components/document-wizard/seedHelpers.ts`,
    `manualSeeds.ts`, `fromCalculator.ts` — every NA flag defaults to
    `false`. The calculator never emits N/A; the wizard exposes the
    toggles for the user to flip.
  - `src/components/document-wizard/offerPdf/sections/payin.ts` —
    new helpers `renderTrxFeeCell` and `renderMinFeeCell`. The
    minimum-fee result is now a discriminated union
    `{ kind: "value" | "na" } | null` so `kind: "na"` renders the
    string "N/A" without the threshold-based two-line format.
  - `src/components/document-wizard/offerPdf/sections/payout.ts` —
    new helper `renderPayoutTrxFee` plus `resolveMinimumFeeLabel`
    short-circuiting on `payoutMinimumFeePerTransactionNa`.
  - `src/components/document-wizard/wizard/shared.tsx` — new shared
    UI component `FeeFieldWithNa` (NumberField + checkbox + readonly
    state when N/A is on).
  - `src/components/document-wizard/wizard/steps/PayinStep.tsx`,
    `PayoutStep.tsx`, `OtherFeesStep.tsx`, `TermsStep.tsx` — every
    fee input swapped over to `FeeFieldWithNa` (or paired with a
    plain checkbox where the field is too small for the wrapper, as
    in the per-region MIN. TRX FEE row in `TermsStep`).
  - `TermsStep.tsx` Threshold/Fee inputs lock per the rule: in
    `overall` mode the shared pair locks only when BOTH region NA
    flags are on; in `byRegion` mode each region's pair locks
    based on its own flag.
  - `src/components/document-wizard/fromCalculator.test.ts` — new
    test group "N/A toggles" with six cases covering payin C/D,
    payin APM, tier-level NA, payin MIN. TRX FEE per region, payout
    TRX Fee, and payout MIN. FEE.
- **Pending in calculator (do NOT touch until calculator is unfrozen):**
  - The calculator owns the underlying numeric fee values
    (`trxCc`, `trxApm`, `trxFee`, `payoutMinimumFeePerTransaction`,
    region-specific `payoutMinimumFee*PerTransaction`). It has no
    notion of a "N/A" mode and continues to emit only numbers. No
    change needed — but if we ever want the calculator to import an
    existing wizard payload back into calculator state, we will need
    to drop the NA flags during the inverse mapping.
  - If the `NumberField` is ever extended with a built-in "N/A"
    checkbox, the wizard's `FeeFieldWithNa` wrapper can be retired
    and the calculator's own price inputs (Zone 3 etc.) can use the
    same control.
- **Notes for the calculator change:**
  - The wizard payload's `*Na` flags are display-only — they do not
    affect calculator math at all. When/if the calculator is
    unfrozen and we add an "N/A" view to it, keep the math (volume
    and revenue formulas) computing on the numeric fields only.

---

## 4. 2026-05-12 product update batch (resolved — applied across calc + wizard + PDF)

The 2026-05-12 batch (Commits A/B/C/D — see `docs/decisions.md`)
intentionally moved synchronously across calculator + wizard + PDF.
Logged here for completeness in case any item needs to be reverted.

### 4.1 Settlement default `T+2` → `T+3` (Commit A)

- **Date:** 2026-05-12
- **User request:** change the default settlement period everywhere.
- **Applied in:**
  - `src/domain/calculator/zone4/otherFeesAndLimits.ts` —
    `DEFAULT_CONTRACT_SUMMARY_SETTINGS.settlementPeriod = "T+3"`.
  - `src/components/document-wizard/fromCalculator.test.ts` — fixture
    `settlementPeriod` and two `expect(html).toContain("Daily, T+3")`
    assertions updated.
- **Revert:** flip `"T+3"` back to `"T+2"` in those three lines.

### 4.2 Label rename: `Client Type` → `Traffic Type` (Commit B)

- **Date:** 2026-05-12
- **User request:** rename label only; data key stays.
- **Applied in (label-only — no schema change):**
  - `src/components/document-wizard/wizard/steps/terms/TermsLegalSection.tsx`
    (Step 5 — line ~53/59).
  - `src/components/document-wizard/offerPdf/sections/terms.ts`
    (Contract Summary item label).
  - `src/components/document-wizard/buildPdfUiKitHtml.ts` (UI-kit ref).
- **Data key untouched:** `contractSummary.clientType` and the default
  `"STD"` are preserved on the payload — saved drafts still work.
- **Revert:** swap the three label strings back to `"Client Type"`.

### 4.3 Label rename: `Over limit only` → `Under limit only` (Commit C)

- **Date:** 2026-05-12
- **User request:** rename label only; logic stays.
- **Applied in (label-only — no logic change):**
  - `src/components/calculator/zones/zone4/Zone4RevenueAffectingFees.tsx`
    (Zone 4 charging mode mini-toggle + threshold field + helper text).
  - `src/components/document-wizard/wizard/steps/OtherFeesStep.tsx`
    (Step 4 charging mode + threshold).
  - `src/components/document-wizard/offerPdf/sections/fees.ts`
    (PDF card value for FAILED TRX CHARGING).
  - `src/domain/calculator/zone6/offerSummary.ts` (Offer Summary line).
- **Data key untouched:** `failedTrxMode: "overLimitOnly"` and the
  underlying threshold semantics are unchanged.
- **Known mismatch (intentional for now):** the label now reads "Under
  limit only" but the calculation still treats the threshold as the
  *upper* cap. Product asked to defer the logic flip; tracked as a
  follow-up in `docs/decisions.md` (2026-05-12 entry).
- **Revert:** swap the strings back to `"Over Limit Only"` /
  `"Over Limit Threshold"` in those five locations.

### 4.4 New feature: Dedicated Countries (UK + CH) split (Commit D)

- **Date:** 2026-05-12
- **User request:** new opt-in checkbox on EU Blended that splits the
  EU scheme cost between the standard portion and a UK + Switzerland
  portion charged at a separate coefficient (default `1.30%`, editable).
- **Applied across calc + wizard + PDF:**
  - Domain types (`src/domain/calculator/zone3/pricingConfiguration.ts`,
    `src/domain/calculator/zone5/types.ts`) gained an optional
    `dedicatedCountries` block and the
    `DEFAULT_DEDICATED_COUNTRIES_COEFFICIENT_PERCENT = 1.30` constant.
  - Math updated in `zone5/payin.ts` and the preview in
    `zone3/pricingConfiguration.ts` — when disabled/absent, formulas
    collapse to the pre-feature `volume × schemeFeesPercent`.
  - Calculator state (`useCalculatorState.ts`) gained
    `setPayinRegionDedicatedCountriesField`; UI block in
    `PayinRegionPricingPanel.tsx` (EU only). Wired through
    `Zone3PricingConfiguration.tsx` and `pages/CalculatorPage.tsx`.
  - Wizard payload type `PayinRegionPricing` mirrors the same block;
    UI block in `PayinStep.tsx` (EU only). `fromCalculator.ts` and
    `seedHelpers.ts` propagate the field with a defensive clone.
  - Tests: 8 new cases (`zone3/pricingConfiguration.test.ts` +
    `zone5/profitability.test.ts`) cover backward-compat (field
    absent / `enabled: false`) and new-behaviour splits.
- **Revert:** see the full revert plan in the 2026-05-12 entry of
  `docs/decisions.md` (delete the new type fields, restore the
  original two-line `schemeFees` formula, drop the UI blocks, drop
  the setter, delete the new test cases).

<!-- Append further deferred changes below using the same template:

## N. Short title

- **Date:** YYYY-MM-DD
- **User request:** ...
- **Already applied (PDF + Wizard):** ...
- **Pending in calculator:** file paths + line numbers + symbols
- **Notes for the calculator change:** any constraints or migration hints
-->

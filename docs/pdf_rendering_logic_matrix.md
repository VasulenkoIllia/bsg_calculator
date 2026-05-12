# PDF Rendering Logic Matrix

Date: 2026-05-07 (refreshed for 2026-05-07 visual pass + custom blocks + custom notes)
Status: Active. Derived from specification + 8 reference commercial offers + MSA docx + 2026-05-07 product additions.

## 1. Sources used

Specification:
- `technical_specification_bsg.docx` v2.0 — sections 6 + 9.

Reference PDFs (commercial offer sheets):
- `ZenCreator Commercial Offer 1.1 (3).pdf` — 11 pages, OFFER + bundled AGREEMENT (MSA).
- `Aron Group Commercial Offer 1.0 (2).pdf` — 2 pages, OFFER only.
- `CEI Commercial Offer 1.0 and MSA_Director Signed.pdf` — 11 pages, OFFER + AGREEMENT (signed). Text layer absent; OCR via `tesseract`.
- `Finera Commercial Offer 1.0.pdf` — 2 pages, OFFER only.
- `ATOM Commercial Offer 1.0 and MSA.pdf` — 11 pages, OFFER + AGREEMENT.
- `Pay.cc Commercial Offer 1.1.pdf` — 2 pages, OFFER only.
- `SoftGaming Commercial Offer 1.0.docx.pdf` — 2 pages, OFFER only.
- `TodaPay Commercial Offer 1.0.pdf` — 2 pages, OFFER only.

AGREEMENT body source (long-form MSA legal text):
- `Extended Schedule 4 - MSA format.docx` — canonical Service Agreement template (11 sections + 3-party signature block). See `docs/agreement_structure.md`.

## 2. Document types observed

| Code | Length | Composition | Samples |
|---|---|---|---|
| **OFFER** | 1–2 pages | Sections 1–4 only (Payin / Payout / Other Fees / Terms) | Aron, Finera, Pay.cc, SoftGaming, TodaPay |
| **AGREEMENT** | 11 pages typical | Sections 1–4 + bundled MSA legal text + signature blocks | ZenCreator, ATOM, CEI |

The OFFER and AGREEMENT share the same Sections 1–4 layout. AGREEMENT adds the MSA appendix and 3-party signature pages. **Templates do not fork**; AGREEMENT is OFFER + appended MSA section.

## 3. Stable visual baseline across all references

1. A4 page format.
2. Header begins with `CONFIDENTIAL · PAYMENT INFRASTRUCTURE`.
3. Title block: `Service / Agreement` (two lines, accent color on "Agreement").
4. Subtitle: `Card Acquiring, Payout Infrastructure & Settlement Terms — structured for scale-up and enterprise merchants operating globally.`
5. Meta grid with 5 cells in a 3-column layout: `DOCUMENT NUMBER`, `DOCUMENT DATE`, `DOCUMENT TYPE` (top row), then `COLLECTION MODEL`/`SETTLEMENT MODEL`, `COLLECTION FREQUENCY` (bottom row spanning 2 cells; 6th slot intentionally borderless). Container border is top + left only; item borders form the rest, so the empty 6th slot does not draw a closed rectangle.
6. Followed by amber/blue note: `All fees are collected on a daily basis unless otherwise instructed in writing. Rates are subject to applicable interchange and scheme fees under the IC++ model unless otherwise instructed in writing.`
7. Sections 1–4 with numeric badges and right-aligned variant tag.
8. **Per-page footer** (repeated on every printed page via `<table class="page-layout">` + `<tfoot>`): full confidentiality notice + meta line `CONFIDENTIAL · BSG-XXXXX`. Page counter (`Page N of M`) lives in the `@page { @bottom-right }` margin box because `counter(page)` inside `<tfoot>` evaluates to 0 in Chrome (Chromium issue 678485).
   - Each top-level OFFER block (header / sections 1–4 / agreement / per-section custom note) is wrapped in **its own `<tr><td>` row** inside `<tbody>` so Chrome's print engine has reliable break points. A single-row `<tbody>` made the per-page footer disappear when content overflowed across pages.
   - Custom notes are emitted as **siblings of the corresponding section**, not children. Each note lives in its own `<tr>` so a long note can flow across pages without dragging the section's `page-break-inside: avoid` rule down with it.

### 3.1 Colour scheme (2026-05-07)

| Element | Class | Colour |
|---|---|---|
| Small uppercase labels (REGION, METHODS, REFUND, DOCUMENT NUMBER, …) | `--label-color` | `#2358EA` |
| Tier 1 row (model, label, trx fee) — also single-mode default | `tier-color-1` | `#2358EA` |
| Tier 2 row | `tier-color-2` | `#3F38E3` |
| Tier 3 row | `tier-color-3` | `#7D2AEB` |
| MDR percent (every tier, single mode) | (default body colour) | `var(--text-primary)` `#0F172A` |
| `N/A` text wherever it appears (fee tables, terms grid, fee cards) | `value-na` | `var(--text-muted)` `#6B7280` |
| Cell subtitle (APM list, "All Visa & Mastercard", "Non-tiered, fixed", "Credit / Debit & APM") | `cell-subtitle` | `var(--text-light)` `#9CA3AF` |
| Custom Terms blocks (user-picked) | `terms-value-{blue,black,orange}` | `#2358EA` / `var(--text-primary)` / `#DB7712` |
| Section custom note (user free-form, under each pricing table) | `section-custom-note` | `var(--text-light)` `#9CA3AF` |

Percent format: always exactly 2 decimals (`5.00%`, `4.50%`, `0.30%`, `0.01%`) — `formatPercent` in `offerPdf/formatters.ts`.

### 3.2 Per-fee N/A toggles

Every numeric fee value in the OFFER PDF is paired with a boolean `*Na` flag on the wizard payload. Three render states:

1. flag false + value > 0 → display the formatted value
2. flag false + value = 0/empty → row hides via the global hide-if-empty rule
3. flag true → display the literal `N/A` (in `value-na` gray)

Flag wins over the value; the user toggles flags via `FeeFieldWithNa` (boolean) or `ModedNumericField` (Number / N/A / TBD picker for `number | null` fields).

### 3.3 Region label

`payinPricing.eu` is data-key only — the user-facing label is `EEA + UK` (changed from `EU` on 2026-05-07). Lives in `wizard/shared.tsx:PAYIN_REGION_LABELS` and the OFFER renderer's `payinRegionContexts`.

### 3.4 Page-budget strategy

Page 1 is laid out around the payin section's "weight" — whether the
Card Acquiring table has tiers:

| `layout.payin.tableMode` | Has tiers? | Page-1 content | Page-2 content | Forced break |
|---|---|---|---|---|
| `byRegionTiered` | yes (6 rows, both regions) | header + section 1 + payin custom note | section 2 + payout note + sections 3 + 4 | before Pay Out |
| `flatTiered` | yes (3 rows, one region) | header + section 1 + payin custom note | section 2 + payout note + sections 3 + 4 | before Pay Out |
| `byRegionFlat` | no (2 rows, both regions) | header + sections 1 + 2 + their notes | sections 3 + 4 | before Other Services & Fees |
| `flatSingle` | no (1 row) | header + sections 1 + 2 + their notes | sections 3 + 4 | before Other Services & Fees |

Implementation: the orchestrator marks the corresponding row's `<tr>`
with `force-page-break-before` (CSS `page-break-before: always`). When
the payin section is absent (`calculatorType.payin === false`), no
forced break fires — sections flow naturally.

### 3.5 Auto-compact mode (added 2026-05-08)

Each `<section class="offer-section">` carries an optional `compact`
modifier class. CSS in `pdf-kit/styles.ts` shrinks padding, font
sizes (th/td 9pt → 8pt, h2 14pt → 12pt, etc.), and line-heights by
~20% without removing content. Standard colour rules
(accent-text / tier-color / value-na / cell-subtitle) are
unaffected.

Activation rules (data-driven, computed at render time):

| Section | Compact when |
|---|---|
| Card Acquiring (payin) | `totalRows >= 4` (tiered + both regions = 6, tiered + one region = 3) OR (`totalRows >= 2` AND has custom note) |
| Pay Out (payout) | `showTierColumn` (3 tiered rows) OR has custom note |
| Terms & Limitations | `items.length >= 8` (built-ins + custom blocks) |
| Other Services & Fees | never (cards layout already efficient at 3 per row) |

The preset is calibrated against worst-case fills (payin 6 rows,
payout 3 rows, terms ~10 built-ins + N custom blocks) so a busy
offer fits page 1 (header + sections 1 + 2) without spilling onto
page 2 just for vertical-spacing reasons.

## 4. Per-sample variation matrix

### 4.1 Header model label and value

| Sample | Header label | Value |
|---|---|---|
| ZenCreator | `SETTLEMENT MODEL` | `IC++ / Interchange Plus` |
| Aron Group | `COLLECTION MODEL` | `IC++ / Blended` |
| CEI | `COLLECTION MODEL` | `IC++ / Blended` |
| Finera | `COLLECTION MODEL` | `IC++ / Blended` |
| ATOM | `COLLECTION MODEL` | `IC++ / Blended` |
| Pay.cc | `COLLECTION MODEL` | `IC++ / Blended` |
| SoftGaming | `SETTLEMENT MODEL` | `IC++ / Interchange Plus` |
| TodaPay | `COLLECTION MODEL` | `IC++ / Blended` |

Rule: when the value contains "Interchange Plus", the label is `SETTLEMENT MODEL`; otherwise `COLLECTION MODEL`. Already implemented in `offerPdf/formatters.ts:resolveModelHeaderLabel`.

### 4.2 Section 1 (Payin) tier boundaries

| Sample | Tier 1 | Tier 2 | Tier 3 | Regions |
|---|---|---|---|---|
| ZenCreator | Up to €1M | €1M–€3M | Above €3M | EU + Global |
| Aron Group | Up to €10M | €10M–€25M | Above €25M | EU + Global |
| CEI | Up to €10M | €10M–€25M | Above €25M | EU + Global |
| Finera | Up to €10M | €10M–€25M | Above €25M | EU + Global |
| ATOM | Up to €10M | €10M–€25M | Above €25M | EU + Global |
| Pay.cc | Up to €10M | €10M–€25M | Above €25M | EU + Global |
| SoftGaming | Up to €10M | €10M–€25M | Above €25M | EU + Global |
| TodaPay | Up to €5M | €5M–€7M | Above €7M | EU + Global |

All samples use 3 tiers, both regions. Boundaries are arbitrary — `byRegionTiered` mode handles this; the calculator already exposes editable `tier1UpToMillion` / `tier2UpToMillion`.

### 4.3 Section 1 (Payin) per-tier MDR

Examples (full table omitted; see source files). Range observed: 2.5%–5.5%. Both Blended (most) and IC++ (mixed within same document) appear. Our renderer correctly renders the per-region model (Blended/IC++) and per-tier MDR.

### 4.4 Section 1 (Payin) TRX FEE

Common pattern: `C/D: €0.30` and `APM: €0.35` for all tiers.
Variations:
- ZenCreator and SoftGaming: `C/D` varies per tier (`€0.35 / €0.30 / €0.25`).
- Finera: `C/D` varies per tier (`€0.35 / €0.30 / €0.25`).

Already supported by `payinPricing.tiers[].trxCc` / `trxApm`.

### 4.5 Section 1 (Payin) MIN. TRANSACTION FEE

Identical across all samples: `≤2.5M: €1.00 / >2.5M: N/A`.

### 4.6 Section 1 footnotes (annotations under the table)

| Sample | Footnote |
|---|---|
| ZenCreator | none |
| Aron Group | `*Min. Transaction fee applies to successful transaction fees only up to the Min. total amount processed in every bracket. The Min. Transaction fee is waived once total amount processed surpasses the Min. total amount processed.` |
| CEI | none |
| Finera | header marker `**`, footnote: `** Transaction fee on declined transactions to be waived according to terms and limitations in section 4` |
| ATOM | none |
| Pay.cc | none |
| SoftGaming | none |
| TodaPay | none |

**Closed (2026-05-07)**: free-form section note is now supported via
`contractSummary.payinCustomNoteEnabled / payinCustomNoteText` for
Section 1 and `payoutCustomNoteEnabled / payoutCustomNoteText` for
Section 2. Renderer emits `<p class="section-custom-note">…</p>` (muted
gray, pre-wrap) under the table when the toggle is on and the text is
non-blank. Wizard exposes the `SectionCustomNoteCard` primitive at the
bottom of Step 2 (Payin) and Step 3 (Payout).

### 4.7 Section 2 (Payout)

All 8 samples use **non-tiered fixed rate, Global region only**. No tiered payout sample exists in the reference set, even though our renderer supports `globalTiered`.

| Sample | MDR | TRX | Min Fee |
|---|---|---|---|
| ZenCreator | 2% | €0.50 | €2.50 |
| Aron Group | 2% | €0.50 | €2.50 |
| CEI | 1.8% | €0.50 | €2.00 |
| Finera | 2% | €0.50 | €2.50 |
| ATOM | 1.8% | €0.50 | €2.00 |
| Pay.cc | 2% | €0.50 | €2.50 |
| SoftGaming | 2% | €0.50 | €2.50 |
| TodaPay | 2% | €0.50 | €2.50 |

### 4.8 Section 3 (Other Services & Fees)

Card values across samples:

| Card | ZenCreator | Aron | CEI | Finera | ATOM | Pay.cc | SoftGaming | TodaPay |
|---|---|---|---|---|---|---|---|---|
| ACCOUNT SETUP | €1,000 | Waived | Waived | Waived | Waived | Waived | €2,000 | Waived |
| REFUND | €15 | €15 | €15 | €15 | €15 | €15 | €15 | €15 |
| DISPUTE / CHARGEBACK | €60 | €70 | €70 | €70 | €70 | €70 | €70 | €70 |
| 3D SECURE | €0.05 | €0.05 | €0.05 | €0.05 | €0.05 | €0.05 | €0.05 | €0.05 |
| SETTLEMENT | 0.5% | 0.3% | 0.3% | Waived | 0.3% | 0.3% | 0.3% | 0.3% |
| MIN. MONTHLY | NA | €5,000 | Waived | Waived | Waived | Waived | €5,000 | Waived |

### 4.9 Section 3 per-card secondary subtitles

Observed extra annotation lines under values (rendered as small note below the primary subtitle):

| Card | Annotation | Samples |
|---|---|---|
| MIN. MONTHLY ACCOUNT FEE | `· NA if processing volume is over 1M /mo` | **all 8 samples** |
| MIN. MONTHLY ACCOUNT FEE | `· MMAF to be charged from 4th month` | Aron only |
| SETTLEMENT | `Waived for EU only` | TodaPay only |

**Renderer gap**: `FeeCardItem` only supports a single `subtitle`. Cards do not support secondary annotation lines.

### 4.10 Section 4 (Terms & Limitations)

| Field | Variants observed |
|---|---|
| Settlement | `Daily, T+3` (4 samples), `Daily, T+4` (3 samples), `Daily, T+3` (CEI) |
| Settlement Note | `Does not apply on weekends` / `…and bank holidays` / `…and banking holidays` (3 spellings) |
| Traffic Type | `STD` (7 samples), `New + Returning` (ZenCreator only). Renamed from "Client Type" on 2026-05-12 — label only; payload key `clientType` and the default `"STD"` stay. See `docs/decisions.md`. |
| Restricted Jurisdictions | `OFAC, US` (most), `OFAC, Sanctioned` (ZenCreator only) |
| Min. Collection | `€1 EUR` (all) |
| Max. Collection | `€2,500 EUR` (all) |
| Min. Payout | `€60 EUR` (most), `€50 EUR` (ATOM), `€20 EUR` (CEI) |
| Max. Payout | `N/A` (all) |
| Rolling Reserve | `10% · 180 days` (all) |
| Rolling Reserve Cap | `TBD` (all) |
| Footnote line | Finera: `** Decline fee removal - After 3 months of processing 2M/m and having min 80% approved transactions` |

**Renderer gap status (2026-05-07)**:
- ✅ **Closed**: Settlement Note / Traffic Type (renamed 2026-05-12,
  was "Client Type") / Restricted Jurisdictions — editable
  per-contract in TermsStep (`TermsLegalSection`); renderer reads from
  `contractSummary.{settlementNote, clientType, restrictedJurisdictions}`.
  Note: the payload key is still `clientType`; only the visible label
  changed.
- ✅ **Closed**: `Max. Payout`, `Rolling Reserve Cap`, and the four
  Transaction Limits use `ModedNumericField` (Number / N/A / TBD) in
  TermsStep. The user picks N/A explicitly when they want it; the
  renderer reads `valueModes.{collectionLimitMin/Max,
  payoutLimitMin/Max, rollingReserveCap}` via `resolveModeValue`. No
  more auto-defaults.
- ✅ **Closed**: free-form footnote line under Section 4 is supported
  via `contractSummary.customTermsItems: CustomTermsItem[]`. Each item
  is `{ id, label, value, color: "blue"|"black"|"orange" }` and renders
  in the same 2-column terms-grid below the built-in rows. Wizard
  exposes the `CustomTermsBlocksSection` (add / edit / remove +
  Blue/Black/Orange picker).

## 5. Rendering modes matrix (OFFER, single shared template)

Rules are driven by data shape only; no template branching by customer.

### 5.1 Section 1 (Payin)

1. `tiers + regions`: Region column shown, Tier column shown, rows = region × tier.
2. `no tiers + regions`: Region column shown, Tier column hidden or `Non-tiered, fixed`, one row per region.
3. `tiers + no regions`: Region column hidden, Tier column shown, rows = tier-only.
4. `no tiers + no regions`: Region and Tier columns hidden, single fixed row.

### 5.2 Section 2 (Payout)

1. `global + fixed`: one global fixed row (matches all 8 samples).
2. `global + tiered`: tier column enabled, one global row per tier (no sample yet — supported).
3. `disabled`: full section omitted.

### 5.3 Missing-data behavior

For `source=calculator`:
1. If a value is absent, the corresponding row/card is not rendered.
2. The renderer must NOT inject synthetic placeholders unless the user opts in.

For `source=manual` or `source=clone`:
1. Per-field value modes (`value` / `waived` / `na` / `tbd`) may be applied explicitly.

## 6. Document scope (OFFER vs AGREEMENT)

| Document scope | Sections rendered | Page count target |
|---|---|---|
| `OFFER` | Header + Sections 1–4 + Footer | 1–3 pages |
| `AGREEMENT` | OFFER body + MSA legal appendix + Signature block | 9–15 pages |

The MSA appendix is the canonical Service Agreement long-form text. See [agreement_structure.md](agreement_structure.md) for sections, placeholder fields, and signature block layout.

## 7. Renderer gap summary (for product decision)

A grouped list of discrepancies between the current OFFER renderer and the 8 samples is maintained separately as a snapshot:
- See [pdf_renderer_audit_2026-05-02.md](pdf_renderer_audit_2026-05-02.md).

## 8. Implementation mapping

OFFER renderer layout:
- `src/components/document-wizard/buildOfferPdfHtml.ts` — orchestrator.
  Wraps content in `<table class="page-layout">` with the disclaimer
  footer in `<tfoot>`. Each top-level block (header / OFFER section /
  agreement body / per-section custom note) lives in its own
  `<tr><td>` row inside `<tbody>` via the `wrap()` helper +
  `buildOfferBodyRows()` — that layout is what makes Chrome reliably
  repeat the footer on every printed page.
- `src/components/document-wizard/offerPdf/formatters.ts` — money /
  percent (`#.##%`) / date helpers + `resolveModeValue` for
  Number / N/A / TBD / Waived sentinels.
- `src/components/document-wizard/offerPdf/layoutResolution.ts` —
  calculator-mode layout fallback.
- `src/components/document-wizard/offerPdf/tierColor.ts` — shared
  `tierColorClass(index)` used by both payin + payout tiered
  renderers.
- `src/components/document-wizard/offerPdf/sections/{payin,payout,fees,terms}.ts`
  — per-section builders. `payin.ts` / `payout.ts` also expose
  `hasPayin/PayoutCustomNote(data)` predicates and
  `buildPayin/PayoutCustomNoteHtml(data)` renderers so the orchestrator
  can place each note in its own `<tr>`. `terms.ts` appends the user's
  `customTermsItems` after the built-in rows in the same terms grid.
- `src/components/document-wizard/pdf-kit/` — visual primitives + style
  tokens. CSS in `pdf-kit/styles.ts` defines `--label-color`,
  `tier-color-{1,2,3}`, `value-na`, `cell-subtitle`,
  `terms-value-{blue,black,orange}`, `section-custom-note`,
  `@page { @bottom-right }` page counter.
- `src/lib/printHtmlViaIframe.ts` — hidden iframe + Blob URL print
  path (replaces popup-based print to avoid popup blockers and
  Safari `srcdoc` bugs).

AGREEMENT renderer:
- `src/components/document-wizard/agreementPdf/` — `index.ts`
  orchestrator, `sections.ts` (long-form MSA body), `parties.ts`
  (counterparty preamble), `signatureBlock.ts` (3-party signature
  panel), `highlightVar.ts` (variable substitution).
- `agreementPdf` runs only when `documentScope === "offerAndAgreement"`;
  the `.agreement-body` carries `page-break-before: always` in print so
  the MSA always starts on a fresh page.

## 9. Scope boundary

This matrix covers OFFER + AGREEMENT body composition. Backend numbering, persistence, RBAC, and HubSpot integration remain out of scope (see `spec_v2_alignment.md`).

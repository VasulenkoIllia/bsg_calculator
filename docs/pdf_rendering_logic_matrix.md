# PDF Rendering Logic Matrix

Date: 2026-05-30 (refreshed for the universal-layout redesign — compact mode removed, Puppeteer running header/footer, natural page flow, ValueMode + feeNotes)
Status: Active. Derived from specification + 8 reference commercial offers + MSA docx + the 2026-05-30 "Be There Solutions Commercial Offer 1.1" reference redesign.

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
3. Title block: `Service / Agreement` (two lines, accent color on "Agreement"). Enlarged to **50pt** (from 32pt) on 2026-06-11 to fill the spare cover space; the top-right meta aside is far narrower than the free width so there is no collision and page counts are unchanged (verified incl. the heaviest config: tiered both-regions + payin custom note still fits on page 1).
4. Subtitle: `Card Acquiring, Payout Infrastructure & Settlement Terms — structured for scale-up and enterprise merchants operating globally.` Rendered **justified** (`text-align: justify`, 2026-06-11).
5. Cover meta laid out in two parts (redesigned 2026-05-30): `DOCUMENT NUMBER` + `DOCUMENT DATE` sit **top-right, opposite the Service / Agreement title** (`.offer-title-aside` — right-aligned label/value pairs in a flex `.offer-title-row`); the bordered meta-grid below holds the remaining **3 cells on a single row** — `DOCUMENT TYPE`, `COLLECTION MODEL`/`SETTLEMENT MODEL`, `COLLECTION FREQUENCY`. Container border is top + left only; item borders form the rest. Removing the old second meta row freed ~64px, redistributed into proportionally larger cover + section gaps (`--space-header-gap` 8→11px, `--space-section-gap` 6→8mm) with **no change to page counts**.
6. Followed by amber/blue note: `All fees are collected on a daily basis unless otherwise instructed in writing. Rates are subject to applicable interchange and scheme fees under the IC++ model unless otherwise instructed in writing.`
7. Sections 1–4 with numeric badges and right-aligned variant tag.
8. **Running header + footer** — repeated on every printed page, rendered by **Puppeteer page templates** (`buildHeaderTemplate()` / `buildFooterTemplate()` in `server/modules/pdf/pdf.service.ts`), NOT in the document HTML. The header is a thin purple accent bar (`border-top: 4px solid var(--accent)`, 20 mm side inset, on every page incl. the Agreement). The footer carries the full confidentiality disclaimer + a single **right-aligned** meta line `CONFIDENTIAL · Page N of M` (the document number was removed from the footer 2026-05-30 — it now lives in the cover top-right + the PDF `<title>`). Both live in the `@page` top/bottom margins (top 20 mm / bottom 26 mm), so they never affect content flow and never overlap the body.
   - The old in-HTML `<tfoot>` footer (and its Chromium `counter()` workaround for issue 678485) was **removed 2026-05-30** when the footer moved to the Puppeteer template.
   - Each top-level OFFER block (header / sections 1–4 / agreement / per-section custom note) is still wrapped in **its own `<tr><td>` row** inside `<tbody>` so the print engine has reliable break points between sections.
   - Custom notes are emitted as **siblings of the corresponding section**, not children. Each note lives in its own `<tr>` so a long note can flow across pages without dragging the section's `break-inside: avoid` rule down with it.

### 3.1 Colour scheme (2026-05-30)

| Element | Class | Colour |
|---|---|---|
| Small uppercase labels (REGION, METHODS, REFUND, DOCUMENT NUMBER, …) | `--label-color` | `#9aa3b5` (grey — changed from blue `#2358EA` on 2026-05-30) |
| Card Acquiring region value (`● EEA + UK` / `● Global`, incl. section 1.1) | `cell-region` | `var(--label-color)` `#9aa3b5`, **normal weight** (2026-06-11 — was bold black, now matches the REGION header) |
| Tier 1 row (model, label, trx fee) — also single-mode default | `tier-color-1` | `#2358EA` |
| Tier 2 row | `tier-color-2` | `#3F38E3` |
| Tier 3 row | `tier-color-3` | `#7D2AEB` |
| MDR / RATE percent (every tier, single mode) | `cell-rate` | `var(--text-primary)` `#0F172A`, **bold** (2026-06-11 — was plain body weight; the model label stays tier-coloured) |
| `N/A` in payin / fee tables (e.g. MIN. TRX FEE) | `value-na` | `var(--text-muted)` `#6B7280` |
| Terms grid values (built-in + custom) | `terms-value-{blue,black,orange}` | pricing → purple `var(--accent)` `#4f46e5` (key still named "blue"; changed from `#2358EA` 2026-05-30), risk/attention → orange `#DB7712`, sentinel `N/A`/`TBD` → black `var(--text-primary)` |
| Fee card value | `fee-value` | `var(--text-primary)`, 18 pt |
| Fee card subtitle note (operator free-form) | `fee-subtitle` | `var(--accent)` |
| Pay Out card value (non-tiered) | `payout-card-value` | `var(--accent)`, 22 pt |
| Cell subtitle (APM list, "Non-tiered, fixed", …) | `cell-subtitle` | `var(--text-light)` `#9CA3AF` |
| Section custom note (user free-form, under each pricing table) | `section-custom-note` | `var(--text-light)` `#9CA3AF` |

**Built-in terms colour rule (2026-05-30):** each field has a "natural" colour (pricing values → purple `--accent`, risk fields such as Restricted Jurisdictions / Rolling Reserve → orange), but a sentinel value (`N/A` / `TBD`) always renders **black** — see `termColor()` in `offerPdf/sections/terms.ts`. The `termColor` key for pricing is still named `"blue"` but renders the purple accent (reference look — the values are not the `#2358EA` table blue). The terms grid no longer wraps `N/A` in muted-grey `value-na`.

Percent format: always exactly 2 decimals (`5.00%`, `4.50%`, `0.30%`, `0.01%`) — `formatPercent` in `offerPdf/formatters.ts`.

### 3.2 Per-fee value modes + custom notes (2026-05-30)

Fee and limit values resolve through a shared **`ValueMode`** (`value` | `waived` | `na` | `tbd`) stored in `payload.valueModes`, rendered by `resolveModeValue()`:

1. `value` + amount > 0 → display the formatted amount
2. `value` + amount = 0/empty → row/card hides via the hide-if-empty rule
3. `waived` → literal `Waived`
4. `na` → literal `N/A`; `tbd` → literal `TBD`

The mode wins over the raw amount. In Section 3 the six fee cards (Account Setup, Refund, Dispute / Chargeback, 3DS, Settlement, Min. Monthly Account Fee) each expose a **Value / Waived / N/A** toggle plus an optional **custom subtitle note** stored in `payload.feeNotes` (`DocumentWizardFeeNotes`) and rendered as a second `fee-subtitle` line.

**Defaults + provider-cost floors (2026-05-31):** the wizard seeds provider-cost defaults and enforces hard input minimums — a manager can only mark UP from cost (`document-wizard/wizardDefaults.ts` is the single source for both the UI `min` and the seed default). The six fee cards are **shown by default** (3DS / Settlement / Monthly Min default ON but stay toggleable). **ACCOUNT SETUP always renders**, showing `Waived` when its value resolves empty (value-mode + 0). **Payout Minimum Fee (Per Transaction) now also defaults ON** (€2.50, 2026-06-11): flipped at the single source of truth `DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG.enabled` so the calculator default state and the wizard (manual seed + from-calculator) match uniformly; the ZERO/blank presets keep it off intentionally. Floors: Refund ≥ 10, Dispute ≥ 50, 3DS ≥ 0.03, and payin TRX C/D ≥ 0.22 / APM ≥ 0.27 on every construction (single / tiered / both regions / section 1.1). Terms defaults: Restricted Jurisdictions "OFAC, US, Israel", Rolling Reserve 180 days, Max Payout → N/A, Reserve Cap → TBD. Wizard-layer only — the calculator stays frozen; calculator-sourced documents carry the calculator's pricing values. (The one sanctioned exception is the Payout Minimum Fee default above — an operator-approved change to a single calculator default, applied at the shared constant so both layers stay in sync.) See `docs/decisions.md`.

**FAILED TRANSACTION CHARGING** is the exception — instead of Value/Waived/N/A it has its own on/off toggle + a **3-mode selector** and an operator memo:

| `toggles.failedTrxMode` | Card value | Notes |
|---|---|---|
| toggle **off** | — | card **omitted entirely** (changed 2026-05-30 from the old `0` placeholder) |
| `free` | `€0.00` | `formatEuro(0)` |
| `overLimitOnly` | `Under limit only N.NN%` | parentheses removed 2026-05-30 |
| `allFailedVolume` | `All Failed volume` | — |

Always carries a fixed `Per transaction` subtitle plus an optional operator memo (`feeNotes.failedTrx`) on the second subtitle line. Wizard-only — the calculator's failed-trx revenue math (`FailedTrxChargingMode`, 2-valued) is frozen and `"free"` never flows back to it.

Limit/terms fields (Min/Max Collection & Payout size, Rolling Reserve Cap) use the same modes via `ModedNumericField` (Number / N/A / TBD). The legacy per-field boolean `*Na` flags were superseded by `valueModes`.

### 3.3 Region label

`payinPricing.eu` is data-key only — the user-facing label is `EEA + UK` (changed from `EU` on 2026-05-07). Lives in `wizard/shared.tsx:PAYIN_REGION_LABELS` and the OFFER renderer's `payinRegionContexts`.

### 3.4 Page flow — natural, no forced breaks (2026-05-30)

There is **one universal full-size layout** and **no compact mode**.
Page breaks are not forced or budgeted; the document grows to as many
pages as the data needs and looks identical at every data volume
(fewer fields → fewer pages, same sizing).

- Each `<section class="offer-section">` carries `break-inside: avoid`,
  so a numbered section is never split mid-table — the print engine
  pushes a whole section to the next page when it doesn't fit, and
  otherwise lets sections flow continuously.
- Inter-section spacing is one standardized token,
  `--space-section-gap` (6 mm), applied uniformly on every page.
- Custom notes stay in their own `<tr>` rows (siblings of their
  section) so a long note never drags its section's
  `break-inside: avoid` across a page boundary.
- A section with no data returns `""` and is omitted entirely (e.g.
  Pay Out when payout is disabled), so sparse documents never leave
  empty frames.

This replaced the previous *force-page-break + auto-compact* heuristics
(both removed 2026-05-30), which assumed a fixed 2-page budget and
orphaned content once section heights changed. `buildOfferBodyRows()`
no longer sets any per-row break flag.

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

### 4.5.1 Section 1.1 — Additional Card Acquiring (operator-added, 2026-05-14)

**Refactored same day** (initial implementation 95ba2ce appended
custom rows to section 1's table; second pass moved them into a
separate sibling `offer-section` so each gets its own
`break-inside: avoid` page-break boundary — originally a
force-page-break boundary, now natural flow after the 2026-05-30
redesign).

Operator can add ad-hoc rows via the wizard's "Custom Payin Rows"
section (placed AFTER the Payin Section Note in Step 2). Each row
renders into its own `<section class="offer-section">` with
"1.1 Additional Card Acquiring — Credit / Debit Cards, APM &
E-wallet" header. Visually identical to section 1: same column
widths, same `tier-color-*` classes, same MIN. TRX FEE rendering.

Per-row fields:

- REGION (free-form text, rendered with `● ` bullet)
- CURRENCY (free-form text, default "EUR")
- MDR / RATE (single or tiered; IC++ or Blended)
- TRX FEE (C/D + APM with per-field N/A toggles)
- MIN. TRANSACTION FEE (per-row threshold + fee + whole-cell N/A)

METHODS column is hardcoded to the same default text as standard
rows ("Credit / Debit - Visa, Mastercard" + "APM - Apple Pay,
Google Pay") — no per-row override.

**Section 1.1 has its own column-visibility decisions** independent
of section 1:
- MONTHLY VOLUME TIER column shown when any custom row is tiered
- MIN. TRX FEE column shown when at least one custom row produces
  a non-null min-fee render (via `hasAnyCustomRowMinFee`)

**Page flow** (`buildOfferBodyRows`): section 1.1 is its own
`offer-section` row with `break-inside: avoid` and flows naturally —
when section 1 is heavy, 1.1 cascades onto the next page on its own;
no forced break is applied (the `breakBefore` mechanism was removed
2026-05-30).

Type: `PayinCustomRow` in `document-wizard/types.ts`. Field is
optional (`payinPricing.customRows?`) for back-compat.

Renderers:
- `offerPdf/sections/payin.ts:buildPayinSection()` — standard
  rows only (section 1)
- `offerPdf/sections/payin.ts:buildPayinAdditionalSection()` —
  custom rows only (section 1.1). Returns `""` when no custom rows.
- `pdf-kit/components/sectionHeader.ts` signature now accepts
  `number | string` for the index parameter, allowing "1.1".
- `pdf-kit/styles.ts` `.section-index` uses `min-width: 22px` +
  horizontal padding so single-digit indices stay square while
  multi-char indices ("1.1") expand to fit.

Universal layout: section 1.1 renders at the same full size as
section 1 (no compact preset). Section 1's layout is unaffected by
how many custom rows operators add — extra rows simply cascade onto
the next page via `break-inside: avoid`.

### 4.5.2 Section 1 column widths

Defined in `pdf-kit/styles.ts` `:root` as proportional weights
(table-layout: fixed scales them to the table width):

| Column | CSS class | Width |
|---|---|---|
| REGION | `.col-region` | 11% |
| METHODS | `.col-methods` | 20% |
| CURRENCY | `.col-currency` | 11% (`white-space: nowrap`) |
| MONTHLY VOLUME TIER | `.col-tier` | 13.5% |
| MDR / RATE | `.col-mdr` | 12.5% |
| TRANSACTION FEE | `.col-trxfee` | 16% |
| MIN. TRANSACTION FEE | `.col-minfee` | 16% |

History: METHODS was 30% before the 2026-05-30 rebalance. Under the
universal (non-compact) layout the METHODS cell renders **4 lines**
(`Credit / Debit —` / `Visa, Mastercard` / `APM —` / `Apple Pay,
Google Pay`) via hardcoded `<br>` breaks + em-dash, so it no longer
needs the extra width; CURRENCY is pinned `nowrap` so the currency
code never wraps.

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

**Layout (2026-05-30):** the non-tiered case renders as a **card row** (`.payout-cards` — MDR / Transaction Fee / Min. Transaction Fee as large accent values at 22 pt on a `#f5f6fb` panel), matching the reference; the **tiered** case keeps the multi-row table. Branch lives in `offerPdf/sections/payout.ts:buildPayoutSection()` (`showTierColumn ? table : buildPayoutCards()`). When payout is disabled the whole section is omitted.

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

**✅ Closed (2026-05-30):** all six fee cards support an optional operator-entered second line. `FeeCardItem.subtitleNote` renders as a second `fee-subtitle` paragraph (accent colour) under the primary subtitle; the text is stored per-fee in `payload.feeNotes` (`DocumentWizardFeeNotes`) and edited in the wizard's Other Fees step via the `FeeModeNote` control.

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
  Wraps content in `<table class="page-layout">`; each top-level block
  (header / OFFER section / agreement body / per-section custom note)
  lives in its own `<tr><td>` row inside `<tbody>` via the `wrap()`
  helper + `buildOfferBodyRows()`, giving the print engine clean break
  points between sections. **No `<tfoot>`** — the running header +
  footer are Puppeteer page templates (see below).
- `server/modules/pdf/pdf.service.ts` — Puppeteer renderer.
  `buildHeaderTemplate()` (purple accent bar) + `buildFooterTemplate()`
  (confidentiality disclaimer + a right-aligned `CONFIDENTIAL · Page N
  of M` line — no document number) are injected via `displayHeaderFooter`
  into the `@page` margins
  (top 20 mm / bottom 26 mm / sides 20 mm, kept in sync with the CSS
  `@page` rule under `preferCSSPageSize`).
- `server/modules/pdf/pdf.controller.ts` — resolves the OFFER payload
  and runs the render pipeline on the download + preview paths. (The
  footer no longer needs a document number — removed 2026-05-30.)
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
  tokens. CSS in `pdf-kit/styles.ts` defines `--label-color` (grey),
  `--space-section-gap` (6 mm), `tier-color-{1,2,3}`, `value-na`,
  `cell-subtitle`, `terms-value-{blue,black,orange}`,
  `section-custom-note`, `.payout-cards`, `.fees-grid`, and the `@page`
  margin rule (kept in sync with Puppeteer's margins). The page counter
  now lives in the Puppeteer footer template, not CSS. (The old in-HTML
  `renderFooter` primitive was deleted 2026-05-30 — the footer is
  rendered entirely by the Puppeteer template.)
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

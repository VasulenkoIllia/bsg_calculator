# PDF Rendering Logic Matrix

Date: 2026-05-02 (refreshed)
Status: Active. Derived from specification + 8 reference commercial offers + MSA docx.

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
5. Meta grid with 3 fields: `DOCUMENT TYPE`, `COLLECTION MODEL` or `SETTLEMENT MODEL`, `COLLECTION FREQUENCY`.
6. Followed by amber/blue note: `All fees are collected on a daily basis unless otherwise instructed in writing. Rates are subject to applicable interchange and scheme fees under the IC++ model unless otherwise instructed in writing.`
7. Sections 1–4 with numeric badges and right-aligned variant tag.
8. Footer with full confidentiality notice + meta line `CONFIDENTIAL · Page X of N · Document number`.

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

**Renderer gap**: free-form section footnote is not supported.

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
| Client Type | `STD` (7 samples), `New + Returning` (ZenCreator only) |
| Restricted Jurisdictions | `OFAC, US` (most), `OFAC, Sanctioned` (ZenCreator only) |
| Min. Collection | `€1 EUR` (all) |
| Max. Collection | `€2,500 EUR` (all) |
| Min. Payout | `€60 EUR` (most), `€50 EUR` (ATOM), `€20 EUR` (CEI) |
| Max. Payout | `N/A` (all) |
| Rolling Reserve | `10% · 180 days` (all) |
| Rolling Reserve Cap | `TBD` (all) |
| Footnote line | Finera: `** Decline fee removal - After 3 months of processing 2M/m and having min 80% approved transactions` |

**Renderer gaps**:
- Settlement Note is hardcoded to `Does not apply on weekends and bank holidays`.
- Client Type is hardcoded to `STD`.
- Restricted Jurisdictions is hardcoded to `OFAC, US`.
- `Max. Payout` defaults to `N/A` only when explicitly set by mode; calculator-source mode currently hides it if the value is null. Samples always show `N/A`.
- `Rolling Reserve Cap` always shows `TBD` in samples; calculator-source mode hides if not set.
- Free-form footnote line under Section 4 is not supported.

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
- `src/components/document-wizard/offerPdf/formatters.ts` — money/percent/date helpers.
- `src/components/document-wizard/offerPdf/layoutResolution.ts` — calculator-mode layout fallback.
- `src/components/document-wizard/offerPdf/sections/{payin,payout,fees,terms}.ts` — per-section builders.
- `src/components/document-wizard/pdf-kit/` — visual primitives + style tokens.

AGREEMENT renderer (planned):
- `src/components/document-wizard/agreementPdf/` — MSA-section builder + signature block.
- Wired into orchestrator behind a `documentScope` setting.

## 9. Scope boundary

This matrix covers OFFER + AGREEMENT body composition. Backend numbering, persistence, RBAC, and HubSpot integration remain out of scope (see `spec_v2_alignment.md`).

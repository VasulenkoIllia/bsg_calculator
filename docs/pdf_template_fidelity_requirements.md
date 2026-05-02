# PDF Template Fidelity Requirements

Date: 2026-05-02  
Status: Active baseline for OFFER template implementation

## 1) Goal

Ensure generated OFFER PDFs are visually and structurally consistent with approved reference PDFs and the technical specification document.

## 2) Reference artifacts

Specification source:

1. `technical_specification_bsg.docx` (Contract Generator System, version 2.0, date 2026-04-30 in document body)
2. `Extended Schedule 4 - MSA format.docx` — AGREEMENT (long-form Service Agreement) template body.
3. `docs/pdf_rendering_logic_matrix.md` (per-sample logic extraction + rendering mode matrix)
4. `docs/pdf_renderer_audit_2026-05-02.md` (current renderer vs 8 reference samples — open discrepancies)
5. `docs/agreement_structure.md` (AGREEMENT structural reference)
6. `docs/pdf_ui_kit.md` (tokenized visual system for offer PDF)

Reference PDF set:

1. `ZenCreator Commercial Offer 1.1 (3).pdf`
2. `Aron Group Commercial Offer 1.0 (2).pdf`
3. `CEI Commercial Offer 1.0 and MSA_Director Signed.pdf`
4. `Finera Commercial Offer 1.0.pdf`
5. `ATOM Commercial Offer 1.0 and MSA.pdf`
6. `Pay.cc Commercial Offer 1.1.pdf`
7. `SoftGaming Commercial Offer 1.0.docx.pdf`
8. `TodaPay Commercial Offer 1.0.pdf`

## 3) Mandatory visual baseline

1. Page format: `A4`.
2. Header/footer repeated on each page.
3. Section sequence:
   - header block,
   - section `1` (Payin),
   - section `2` (Payout),
   - section `3` (Other Services & Fees),
   - section `4` (Terms & Limitations),
   - footer notice + pagination.
4. Table-heavy layout in sections `1` and `2`.
5. Preserve the same “commercial offer sheet” look-and-feel from references.

## 4) Mandatory style tokens from specification

From specification styling requirements:

1. Table header row background: `#366092`.
2. Table header row text: white, bold.
3. Alternating row background: white / `#F5F5F5`.
4. Border color: `#CCCCCC`.
5. Cell padding: `8px`.
6. Data font size range: `9-10pt`.

## 5) Invariants across all creation scenarios

All scenarios must render with the same template and style system:

1. From calculator.
2. Manual from scratch.
3. Clone from existing document/calculator.

No scenario-specific template forks are allowed.

## 6) Change control

1. Any style/layout deviation requires explicit decision entry in `docs/decisions.md`.
2. Any added/removed block requires update in:
   - `docs/phase_07_unified_document_pipeline_plan.md`
   - this file.
3. Release is blocked if structure diverges from approved baseline without documented approval.

## 7) Mode matrix baseline

Offer renderer must support all combinations through one shared template:

1. `tiers + regions`
2. `no tiers + regions`
3. `tiers + no regions`
4. `no tiers + no regions`

Exact mode rules are tracked in `docs/pdf_rendering_logic_matrix.md`.

## 8) Missing value behavior

1. For `source=calculator`, missing values must hide the row/block.
2. For `source=manual` and `source=clone`, placeholders can appear only via explicit value mode selection (`value/waived/na/tbd`).

# Phase 07 Plan: Unified PDF Document Pipeline

Date: 2026-05-02  
Status: In progress

## 0) Implementation progress log

### 2026-05-02 — Stage 1 (calculator -> wizard) delivered

Implemented:

1. Wizard Phase 1 UI with enabled steps:
   - Step 1 `Header / Meta`
   - Step 6 `Preview + Generate PDF`
2. Auto-fill of Step 1 from calculator data (`collection model` and default metadata).
3. Step 6 preview rendered from shared offer template builder.
4. PDF generation path from wizard preview (`print -> save as PDF` flow).
5. Conditional block rendering in preview for calculator scenario:
   - hide unavailable blocks instead of injecting placeholder values.
6. Workspace split into separate in-app pages/tabs:
   - `Calculator`
   - `Contract Wizard & PDF`
   plus direct CTA button from Zone 6 to open wizard page.

Validation:

1. `npm run typecheck` passed.
2. `npm run test` passed.
3. `npm run build` passed.

### 2026-05-02 — Stage 1B (PDF rendering modes + fidelity traceability) in progress

Implemented:

1. Added explicit layout model for renderer:
   - source mode (`calculator/manual/clone`)
   - Payin table modes (`byRegionTiered/byRegionFlat/flatTiered/flatSingle`)
   - Payout table modes (`globalFlat/globalTiered`)
2. Added optional field value modes foundation (`value/waived/na/tbd`) for non-calculator scenarios.
3. Updated calculator mapping to auto-resolve layout modes.
4. Reworked OFFER HTML template renderer to:
   - render Section 1/2 by mode matrix,
   - keep one shared template style system,
   - hide missing rows/blocks for calculator source without synthetic placeholders.
5. Added traceability documentation:
   - `docs/pdf_rendering_logic_matrix.md` (8 PDF samples + OCR note for CEI + mode rules).
6. Added PDF UI Kit layer:
   - tokenized style profile (`pdf-kit/tokens.ts`),
   - reusable primitives (`pdf-kit/primitives.ts`),
   - standalone visual kit preview (`buildPdfUiKitHtml.ts`) for internal developer calibration (not exposed in frontend flow).

### 2026-05-02 — Stage 1C (full wizard blocks wired to calculator payload) delivered

Implemented:

1. Activated all wizard blocks in frontend flow:
   - Step 1 `Header / Meta`
   - Step 2 `Payin`
   - Step 3 `Payout`
   - Step 4 `Other Fees`
   - Step 5 `Terms & Limitations`
   - Step 6 `Preview + Generate PDF`
2. Replaced header-only wizard state with one full immutable draft payload:
   - `DocumentWizardTemplateData` is now editable across Steps 1-5.
3. Added block-level editing controls for all sections consumed by renderer:
   - payin structure/rates (including tier boundaries and per-tier values),
   - payout global rate mode/rates (single or tiered),
   - fee toggles/values,
   - terms/limits/reserve/minimum-fee contract settings.
4. Preserved calculator as source of truth:
   - `Refill From Calculator` now refreshes full wizard draft from live calculator state.
5. Preview/PDF generation now always uses current wizard draft, so user confirmations/edits in steps 2-5 are reflected in output.

Validation:

1. `npm run typecheck` passed.
2. `npm run test` passed.
3. `npm run build` passed.

### 2026-05-02 — Stage 1D (wizard maintainability decomposition) delivered

Implemented:

1. Decomposed monolithic wizard view into modular step files:
   - `wizard/shared.tsx` (stepper, nav, shared helpers)
   - `wizard/steps/HeaderMetaStep.tsx`
   - `wizard/steps/PayinStep.tsx`
   - `wizard/steps/PayoutStep.tsx`
   - `wizard/steps/OtherFeesStep.tsx`
   - `wizard/steps/TermsStep.tsx`
   - `wizard/steps/PreviewStep.tsx`
2. Kept `DocumentWizardPanel.tsx` as orchestration shell only.
3. Completed fee parity in Step 4 by adding explicit `Payout Minimum Fee (Per Transaction)` control, aligned with calculator source data and Section 2 PDF output.
4. Added regression coverage:
   - failed TRX card rendering when enabled,
   - payout minimum fee value rendering in Section 2.

Validation:

1. `npm run typecheck` passed.
2. `npm run test` passed.
3. `npm run build` passed.

## 1) Scope and target

Build one modular system that generates contract PDF documents from three entry scenarios:

1. `Calculator -> PDF` (existing calculator state is source).
2. `Manual -> PDF` (user fills predefined blocks from scratch).
3. `Clone existing -> New PDF` (existing document or calculator is base; edited result is always saved as a new document).

## 2) Non-negotiable rules

1. Old calculator snapshots and old documents are immutable (no in-place edits).
2. Any saved new document gets a new document number.
3. All scenarios must use one shared template and one shared rendering pipeline.
4. Frontend and backend must stay modular by document blocks/modules.

## 3) Unified generation pipeline

All entry scenarios must normalize into one canonical payload:

- `DocumentTemplatePayload`

Then the same pipeline is always used:

1. `collect source data`
2. `normalize into DocumentTemplatePayload`
3. `validate block-by-block`
4. `assign document number`
5. `persist immutable version`
6. `render PDF from shared template`
7. `publish read-only link`

## 4) Wizard UX (block-by-block)

Document creation UI should follow a stepper flow (as agreed in product discussion):

1. `Step 0` Source selection (`from calculator`, `manual`, `clone`).
2. `Step 1` Header/metadata block.
3. `Step 2` Payin block.
4. `Step 3` Payout block.
5. `Step 4` Other Fees block.
6. `Step 5` Terms & Limitations block.
7. `Step 6` Preview and Generate block.

Rules:

1. User moves block-by-block (`Next`/`Previous`).
2. Only predefined fields/sections are editable.
3. Optional fields can be toggled using explicit value modes (`value`, `waived`, `na`, `tbd`) where required by template wording.

## 5) Data model (proposed, immutable-first)

Core entities:

1. `calculator_snapshots`  
   Immutable calculator configuration snapshots (with source metadata).
2. `documents`  
   Immutable document versions (one row per saved version).
3. `document_lineage`  
   Parent-child links for clone history (`created_from_document_id`, `created_from_calculator_snapshot_id`).
4. `document_number_counters`  
   Transaction-safe sequence for `BSG-#####-XXXXX`.
5. `hubspot_links`  
   Stored references (`object_type`: `deal|lead|company`, `object_id`, optional calculator object id).

## 6) Numbering policy

1. Number format: `BSG-#####-XXXXX`.
2. `#####` is monotonic sequence (starts at `71001` unless migrated state says otherwise).
3. `XXXXX` is last 5 digits of source business id (deal/client/lead/company depending on flow context).
4. Number is allocated only when user explicitly saves a new document version.
5. Auto-save drafts (if introduced) must not consume final numbers.

## 7) Backend module boundaries

1. `document-template` module  
   Canonical payload schema and block validators.
2. `document-sources` module  
   Adapters: calculator/manual/clone -> canonical payload.
3. `document-numbering` module  
   Transaction-safe number allocation.
4. `document-repository` module  
   Immutable persistence and lineage.
5. `document-renderer` module  
   Shared HTML/CSS template + PDF render engine.
6. `document-links` module  
   Read-only links for document and calculator snapshots.
7. `hubspot-adapter` module  
   Persist HubSpot metadata now; full sync flows in next phase.

## 8) Frontend module boundaries

1. `wizard-shell` (stepper, navigation, progress state).
2. `wizard-step-source`.
3. `wizard-step-header`.
4. `wizard-step-payin`.
5. `wizard-step-payout`.
6. `wizard-step-fees`.
7. `wizard-step-terms`.
8. `wizard-step-preview`.
9. `document-api-client`.

## 9) API surface (planned)

1. `POST /api/documents/from-calculator`
2. `POST /api/documents/manual`
3. `POST /api/documents/{id}/clone`
4. `GET /api/documents/{id}`
5. `POST /api/documents/{id}/render-pdf`
6. `GET /api/documents/{id}/pdf`
7. `GET /api/calculator-snapshots/{id}`

Final endpoint naming can be adjusted, but invariant behavior above is fixed.

## 10) Documentation and verification workflow

For each implementation module:

1. update this phase plan with completion notes,
2. append architectural decisions to `docs/decisions.md`,
3. update integration notes in `docs/integrations.md` when external systems are added,
4. add handoff notes if phase boundaries shift.

Verification gate per module:

1. `npm run typecheck`
2. `npm run test`
3. `npm run build`

Additional required tests:

1. numbering concurrency test (no duplicate numbers),
2. source-adapter mapping tests,
3. PDF rendering smoke test for all 3 source scenarios,
4. clone lineage tests (old versions remain unchanged).

## 11) Delivery sequence

1. Canonical payload + validators.
2. Immutable DB model + numbering service.
3. API for create/clone/fetch.
4. Wizard shell + step modules.
5. Shared PDF renderer and template.
6. Snapshot links + read-only retrieval.
7. HubSpot metadata persistence (without full sync logic).

## 12) Out of scope for this phase

1. Full HubSpot bi-directional sync workflows.
2. Full AGREEMENT long-form generation (if not explicitly requested in current sprint).
3. Role-based permissions and auth hardening beyond current repo baseline.

## 13) Visual fidelity requirement (mandatory)

Generated OFFER PDF must keep the same visual language and block structure as approved sample PDFs.

Mandatory constraints:

1. Same section order and section headers (`1..4` blocks + header/footer).
2. Same table architecture for Payin/Payout/Fees/Terms sections.
3. Same color direction and typography hierarchy as reference samples.
4. Same A4 page geometry and repeated header/footer behavior.
5. No alternative template variants by source scenario; all scenarios use one template.

Implementation rule:

1. Template styling tokens are centralized and versioned.
2. Any visual change requires explicit update in docs and approval note in `docs/decisions.md`.

## 14) Source-of-truth traceability (mandatory)

Template structure and content rules are traced to two artifact groups:

1. Product specification document:
   - `technical_specification_bsg.docx` (provided by product side, dated 2026-04-30 in document metadata).
2. Commercial PDF samples:
   - `ZenCreator Commercial Offer 1.1 (3).pdf`
   - `Aron Group Commercial Offer 1.0 (2).pdf`
   - `CEI Commercial Offer 1.0 and MSA_Director Signed.pdf`
   - `Finera Commercial Offer 1.0.pdf`
   - `ATOM Commercial Offer 1.0 and MSA.pdf`
   - `Pay.cc Commercial Offer 1.1.pdf`
   - `SoftGaming Commercial Offer 1.0.docx.pdf`
   - `TodaPay Commercial Offer 1.0.pdf`

Operational rule:

1. Any new template field/block must reference source paragraph/section from the specification or an approved sample precedent.
2. Any mismatch found during implementation is logged as a documented gap before release.

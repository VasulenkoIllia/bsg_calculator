# Specification v2.0 Alignment

Date: 2026-05-02
Status: Active reference. Reviewed when scope changes.

## Purpose

`technical_specification_bsg.docx` v2.0 (Contract Generator System / CGS, version stamp 2026-04-30) describes a system substantially larger than the current implementation. This file is the single source of truth for **what is implemented today, what is planned, and what is explicitly out of scope** for the current phase.

The calculator itself is governed by `Calculator_Описание.docx` and is considered **frozen** — see [decisions.md](decisions.md) and the "Calculator math is frozen" rule in [architecture.md](architecture.md).

## Status legend

- ✅ **Done** — implemented and verified.
- 🟡 **Partial** — partially implemented; gap noted.
- ⏳ **Planned** — explicitly in `phase_07_unified_document_pipeline_plan.md`, not yet implemented.
- ⛔ **Out of scope (current phase)** — acknowledged in spec but deliberately deferred.

> **Backend status (2026-05-03):** Phase 8 backend specification is **finalized** in [phase_08_backend_plan.md](phase_08_backend_plan.md) — confirmed stack (Express + Drizzle + Postgres + Puppeteer + JWT), DB schema, API surface, document save flow, seed data are all decided. Implementation has **not started yet**. No server code, no database, no API endpoints exist. ⏳ items below remain ⏳ until implementation work begins.

## Section-by-section status

### 1. General

| Spec § | Topic | Status | Notes |
|---|---|---|---|
| 1.1 | Source materials | ✅ | Both docs and 8 sample PDFs are referenced in `pdf_template_fidelity_requirements.md`. |
| 1.2 | System name (CGS / Contract Generator System) | ✅ | Used in product context; codebase still labeled "BSG Calculator" because calculator predates CGS. |
| 1.3 | Goal: automate offer creation | 🟡 | OFFER from calculator works; numbering, persistence, HubSpot pending. |

### 2. Goals

| Topic | Status | Notes |
|---|---|---|
| Reduce contract prep time | 🟡 | Frontend wizard works; backend speedup awaits Phase 8. |
| Eliminate manual entry errors | 🟡 | Calculator → wizard auto-fill works. |
| Consistent documents | ✅ | One mode-driven OFFER renderer. |
| Auto numbering BSG-#####-XXXXX | ⏳ | Frontend uses `BSG-DRAFT-{ts}` placeholder until backend numbering service ships. |
| HubSpot integration | ⛔ | Deferred to dedicated phase after backend foundation. |
| Roles (Sales / Account / Finance / Legal) | ⛔ | No auth in current phase. |

### 3. Architecture

| Component | Status | Notes |
|---|---|---|
| Frontend SPA | ✅ | React + Vite + Tailwind. |
| Backend API | ⏳ | `server/` skeleton exists; full backend in Phase 8. |
| HubSpot Integration Layer | ⛔ | Documented future shape only. |
| Document Generation Engine | 🟡 | Two document types (Offer / Offer + Terms of Agreement) rendered as HTML → PDF via browser print. DOCX export still deferred. Backend-side Puppeteer planned in Phase 8. |
| Database | ⏳ | Phase 8. |
| Numbering Service | ⏳ | Phase 8. |

### 4. HubSpot integration

⛔ Entire section is **out of scope for the current phase**. The interaction shape (Deals / Companies / Calculator custom object → backend → DB → render) is documented in [integrations.md](integrations.md) as planning material. No HubSpot API calls exist in code.

### 5. Modular contract creation

| Spec § | Flow | Status | Notes |
|---|---|---|---|
| 5.1 Step 1 | Pick by Deal / Client | ⛔ | Requires HubSpot. |
| 5.1 Step 2 | Pick source: existing calculator / new contract | ✅ | Wizard supports `calculator`, `manualBlank`, `manualDefaults`. |
| 5.1 Step 3 | New contract method: defaults / from scratch | ✅ | Maps to `manualDefaults` and `manualBlank`. |
| 5.2 | Auto-numbering | ⏳ | Placeholder `BSG-DRAFT-{ts}`. |

### 6. Document zones

The spec defines Zones 0–4 of the **document** (not calculator). Mapping to current renderer:

| Spec zone | Implemented in renderer | Status |
|---|---|---|
| Zone 0 — Header (DOC TYPE, NUMBER, DATE, COLLECTION MODEL, FREQUENCY) | header in `buildOfferPdfHtml.ts` | ✅ |
| Zone 1 — Card Acquiring (Payin) by region/tier | `buildPayinSection` | ✅ |
| Zone 2 — Card Acquiring (Payout) | `buildPayoutSection` | ✅ |
| Zone 3 — Other Services & Fees | `buildOtherServicesSection` | ✅ |
| Zone 4 — Terms & Limitations | `buildTermsSection` | ✅ |
| Document type OFFER | full | ✅ |
| Document type Offer + Terms of Agreement (~11 pages) | implemented | ✅ — `agreementPdf/` module appends MSA text + signature block when Document Type = bundle. See [agreement_structure.md](agreement_structure.md). |

### 7. Data structures and API

⏳ Entire section is **planned for Phase 8 backend**. No REST endpoints exist today. Wizard uses local React state only.

### 8. Business logic and validation

| Spec rule | Status | Notes |
|---|---|---|
| V1 Collection Model EU + WW with logic table | ✅ | `resolveCollectionModelDisplay()` in `fromCalculator.ts`. |
| V2 Tier validation (1–5 tiers, ranges, MDR ordering) | 🟡 | Calculator enforces 3-tier model; wizard reads tiers from same shape. No 5-tier expansion yet. |
| V3 Numbering format/uniqueness | ⏳ | Backend Phase 8. |
| R1 Auto-fill from calculator | ✅ | `buildDocumentWizardTemplateDataFromCalculator`. |
| R2 Defaults | ✅ | `DEFAULT_*` constants in domain + wizard. |
| R3 Versioning / history / rollback | ⏳ | Phase 8 immutable persistence. |

### 9. PDF generation

| Topic | Status | Notes |
|---|---|---|
| A4, margins 2.5cm, professional fonts | ✅ | `pdf-kit/tokens.ts`. |
| Header on every page | ✅ | Renderer header block. |
| Sections 1–4 in fixed order | ✅ | Enforced in `buildBody()`. |
| Footer with confidentiality + page numbering | ✅ | `renderFooter()`. |
| Table styling (`#366092` header, alt rows, borders, padding) | ✅ | Matched to spec tokens. |
| Offer vs Offer + Terms of Agreement | ✅ | Two scopes (`offer` / `offerAndAgreement`) selectable via Document Type dropdown. Bundle scope appends static MSA text + party placeholders + signature block. |

### 10. UI

| Spec § | Topic | Status | Notes |
|---|---|---|---|
| 10.1 Home page (recent contracts, search, filter) | ⏳ | Phase 8 (needs DB). |
| 10.2 Wizard flow | ✅ | Steps 1–6 implemented. Step 0 (HubSpot Deal/Client lookup) deferred. |
| 10.3 Stepper navigation, autosave, leave-page warning | 🟡 | Scope-aware stepper present. URL exposes `?source/?scope/?step` for shareable wizard state. No autosave (waits backend). No leave-page warning. |
| 10.x Routing / deep-links | ✅ partial | URL contract defined in `docs/url_contract.md`; current routes implemented. Snapshot/document deep-links wait for Phase 8. |
| 10.4 Real-time validation | 🟡 | Numeric clamps and min-floor warnings present in calculator zones. Cross-step validation deferred. |

### 11. Security

⛔ Entire section is **out of scope for the current phase**. No auth, no RBAC, no audit log. Will be addressed in Phase 8 / dedicated security phase.

### 12. Tech stack

| Layer | Spec hint | Current choice |
|---|---|---|
| Frontend | React | ✅ React 19 + Vite + Tailwind |
| Backend | (open) | ⏳ Phase 8 — TBD (Node/Express/NestJS candidates per `phase_07_unified_document_pipeline_plan.md`) |
| DB | (open) | ⏳ Phase 8 — Postgres assumed |
| PDF lib | PDFKit / Puppeteer / jsPDF | Currently browser-print; backend renderer in Phase 8 |

### 13. Development phases

The spec lists notional phases. Local mapping:

| Spec phase | Local mapping |
|---|---|
| Calculator (existing) | Phases 01–06 (closed, archived in `docs/archive/`). |
| OFFER PDF generator + wizard | **Active Phase 7** — see `phase_07_unified_document_pipeline_plan.md`. |
| Backend / DB / numbering | Phase 8 (planned, not started). |
| HubSpot integration | Phase 9 (planned, after backend stabilizes). |
| AGREEMENT long-form | Not scheduled. |

## Blocking gaps to resolve before Phase 8

1. Lock OFFER template visually and structurally — outstanding discrepancies vs the 8 reference samples are listed in [pdf_renderer_audit_2026-05-02.md](pdf_renderer_audit_2026-05-02.md).
2. Decide which AGREEMENT items to implement now vs after backend (see [agreement_structure.md](agreement_structure.md)).
3. Confirm numbering policy (`BSG-#####-XXXXX` semantics) and counter seed (`71001`) before backend implementation.
4. Decide backend stack (Express vs NestJS) and DB (Postgres assumed).

## Change control for this file

Update this file whenever:

- Scope is added or removed from current phase.
- A spec section's status moves between Done / Partial / Planned / Out-of-scope.
- A new external doc replaces or supersedes existing ones.

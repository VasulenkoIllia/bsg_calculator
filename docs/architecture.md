# Architecture Overview

Date: 2026-05-02
Status: Active reference for current frontend-only architecture

## 1. Project at a glance

BSG Calculator is a React + Vite SPA with two cooperating workspaces:

1. **Calculator** — deterministic pricing/profitability engine (Zones 0–6).
2. **Contract Wizard & PDF** — block-by-block document generator that produces an OFFER PDF from three sources (calculator data, manual blank, manual defaults).

Backend is intentionally absent in the current phase. A minimal `server/` skeleton exists for later use; static assets are served via nginx in Docker.

## 2. Hard rules

1. **Calculator math is frozen.** No formula or business-logic change without explicit product approval. See [decisions.md](decisions.md) for historical rule resolutions.
2. **One shared template, mode-driven.** OFFER PDF uses one renderer; structural variants (`byRegionTiered`, `flatSingle`, `globalTiered`, …) are data-driven, not template forks. See [pdf_rendering_logic_matrix.md](pdf_rendering_logic_matrix.md).
3. **Visual fidelity is a contract.** Generated OFFER must match approved sample PDFs. See [pdf_template_fidelity_requirements.md](pdf_template_fidelity_requirements.md).
4. **Source-document split.** Calculator behavior derives from `Calculator_Описание.docx`; PDF/wizard/backend phase derives from `technical_specification_bsg.docx v2.0`. See [spec_v2_alignment.md](spec_v2_alignment.md).

## 3. Top-level layout

```
src/
├── App.tsx                                  # thin orchestrator
├── domain/calculator/                       # pure business logic + tests
│   ├── zone0..zone6/                        # one folder per calculator zone
│   └── shared/                              # math + format helpers
└── components/
    ├── calculator/                          # calculator UI + state
    │   ├── useCalculatorState.ts            # state + setters
    │   ├── useCalculatorDerivedData.ts      # derived calc orchestration
    │   ├── derived/                         # tree builders, fee impacts, previews
    │   └── zones/                           # one folder per zone UI
    └── document-wizard/                     # PDF generator
        ├── types.ts                         # DocumentWizardTemplateData (canonical payload)
        ├── fromCalculator.ts                # source adapters (calculator → payload, manual seeds)
        ├── buildOfferPdfHtml.ts             # renderer (mode-driven HTML)
        ├── pdf-kit/                         # tokens + reusable visual primitives
        └── wizard/
            ├── shared.tsx                   # stepper, helpers
            └── steps/                       # one file per step
```

## 4. Data flow — Calculator path

```
useCalculatorState
   │ raw inputs (volumes, percents, pricing configs, toggles)
   ▼
useCalculatorDerivedData
   │ orchestrates: pricingPreviews + feeImpacts + unifiedProfitabilityTree
   ▼
zones/Zone0..Zone6 UI
   │ renders inputs and unified profitability tree
   ▼
Zone6OfferSummary  ──────►  copy / print / "open wizard" CTA
```

All math lives in `domain/calculator/zone*/*.ts` (each with a unit test). UI components only present and dispatch input changes — they never compute.

## 5. Data flow — Wizard / PDF path

```
calculator state (live)
   │
   ▼
buildDocumentWizardTemplateDataFromCalculator()         (source adapter)
   │            ┌─────────── buildDocumentWizardTemplateDataManualBlank()
   │            │             buildDocumentWizardTemplateDataManualDefaults()
   ▼            ▼
DocumentWizardTemplateData  (canonical payload)
   │
   ├─► wizard/steps/* (Header, Payin, Payout, OtherFees, Terms, Preview)
   │      user edits seeded draft
   │
   ▼
buildOfferPdfHtml(data)
   │ resolves layout modes from data shape
   │ renders sections 1–4 + header/footer using pdf-kit primitives
   ▼
HTML string  ──►  popup window  ──►  browser print → "Save as PDF"
```

The wizard always operates on the **same payload type** regardless of source. The only thing source mode (`calculator|manual|clone`) changes is whether missing values render as blanks (calculator) or accept explicit `value/waived/na/tbd` modes (manual/clone — Stage 2B, deferred).

## 6. Module responsibility map

| Layer | Module | Responsibility |
|---|---|---|
| Domain | `domain/calculator/zone*` | Pure formula functions per zone, with tests |
| Domain | `domain/calculator/shared` | Numeric/formatting primitives |
| State | `components/calculator/useCalculatorState` | All calculator input state + setters + presets |
| Derived | `components/calculator/useCalculatorDerivedData` | Orchestrates derived calculations |
| Derived | `components/calculator/derived/buildPayinSubtree` | Pure subtree builder (Payin) |
| Derived | `components/calculator/derived/buildPayoutSubtree` | Pure subtree builder (Payout) |
| Derived | `components/calculator/derived/buildUnifiedProfitabilityTree` | Top-level tree assembly |
| Derived | `components/calculator/derived/usePricingPreviews` | Memoized pricing previews |
| Derived | `components/calculator/derived/useFeeImpacts` | Memoized fee impact calculations |
| Derived | `components/calculator/derived/useUnifiedTreeExpansion` | UI expand/collapse state |
| UI | `components/calculator/zones/Zone*` | Zone presentation layer |
| Wizard | `components/document-wizard/types` | Canonical payload type |
| Wizard | `components/document-wizard/fromCalculator` | Source adapters (3 entry modes) |
| Wizard | `components/document-wizard/buildOfferPdfHtml` | Mode-driven OFFER renderer |
| Wizard | `components/document-wizard/pdf-kit` | Visual tokens + primitives |
| Wizard | `components/document-wizard/wizard/steps` | One file per wizard step |

## 7. Test layout

- `src/domain/calculator/**/*.test.ts` — unit tests per formula module.
- `src/components/calculator/numberUtils.test.ts` — input parsing edge cases.
- `src/components/document-wizard/fromCalculator.test.ts` — source-adapter contract tests.
- `src/test/app.*.test.tsx` — UI integration tests split by core / zone groups.

Verification gate: `npm run verify` (`typecheck` + `test` + `build`).

## 8. Out-of-scope today (forward references)

The following are described in `technical_specification_bsg.docx v2.0` but are deliberately not implemented in the current phase:

- Backend API (REST endpoints, DB persistence, immutable versioning).
- BSG document numbering service (`BSG-#####-XXXXX`). Wizard currently emits `BSG-DRAFT-{ts}` placeholder.
- HubSpot integration (Deals, Companies, Calculator custom object). See [integrations.md](integrations.md) for planned interaction shape.
- AGREEMENT (long-form 1–15 page document). Only OFFER is rendered today.
- DOCX export. Only PDF (via browser print) is supported.
- Auth, RBAC, audit log, soft delete.

Status of every spec section is tracked in [spec_v2_alignment.md](spec_v2_alignment.md).

## 9. Active plan and decisions

- Active phase plan: [phase_07_unified_document_pipeline_plan.md](phase_07_unified_document_pipeline_plan.md).
- Architectural and product decisions: [decisions.md](decisions.md).
- Historical phase handoffs: [archive/](archive/).

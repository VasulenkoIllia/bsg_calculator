# BSG Calculator

Frontend-first pricing calculator with deterministic domain formulas and full zone-by-zone breakdown (Zone 0 -> Zone 6), plus a Contract Wizard that generates an OFFER PDF from three sources (calculator data, manual blank, manual defaults).

## Hard rule: the calculator is frozen

The calculator's math and business logic are stabilized and **must not be changed without explicit user approval**. UI/refactor changes that preserve outputs are OK after confirmation. Future product work happens in the wizard / PDF / backend layers, not by altering calculator state shape or formula files in `src/domain/calculator/**`.

## Current project status

- Active runtime: React + Vite SPA (`src/`)
- Calculation engine: `src/domain/calculator/*` (unit-tested per zone)
- Document Wizard + OFFER PDF renderer: `src/components/document-wizard/*`
- Backend skeleton (kept for Phase 8): `server/` — not wired to serve frontend
- Deployment target (test): `bsg.workflo.space`

## Project structure

- `src/App.tsx` - thin UI orchestrator (zone composition + summary actions)
- `src/components/calculator/useCalculatorState.ts` - calculator state and UI handlers
- `src/components/calculator/useCalculatorDerivedData.ts` - derived calculations orchestration (delegates to derived/ modules)
- `src/components/calculator/derived/buildUnifiedProfitabilityTree.ts` - unified profitability tree orchestrator (pure)
- `src/components/calculator/derived/buildPayinSubtree.ts` - payin subtree builder (pure)
- `src/components/calculator/derived/buildPayoutSubtree.ts` - payout subtree builder (pure)
- `src/components/calculator/derived/usePricingPreviews.ts` - pricing preview memos hook
- `src/components/calculator/derived/useFeeImpacts.ts` - fee impact memos hook
- `src/components/calculator/derived/useUnifiedTreeExpansion.ts` - unified tree expand/collapse state hook
- `src/components/calculator/zones/*` - zone-specific UI modules (Zone 0 -> Zone 6)
- `src/components/calculator/zones/zone3/` - Zone 3 payin/payout pricing panel components
- `src/components/calculator/zones/zone4/` - Zone 4 fee toggles and contract summary components
- `src/test/app.*.test.tsx` - split UI integration tests by core + zone groups
- `src/domain/calculator/zone0..zone6` - domain logic by calculator zone
- `src/domain/calculator/shared` - shared math/format helpers
- `docs/calculator_logic_and_formulas.md` - full up-to-date formulas and runtime flow
- `docs/deployment.md` - server deployment guide
- `docker-compose.yml` - Traefik-ready container runtime for frontend
- `Dockerfile` - production image build (static frontend in nginx)

## Local run

Requirements:
- Node.js 20+
- npm

Commands:

```bash
npm install
npm run dev
```

App starts on Vite dev server (default `http://localhost:5173`).

## Verification

```bash
npm run typecheck
npm run test
npm run build
npm run verify
```

CI:
- GitHub Actions workflow `.github/workflows/ci.yml` runs `typecheck`, `test`, and `build` on push/PR.

## Docker test deploy (frontend)

1. Prepare env:

```bash
cp .env.example .env
```

2. Ensure `.env` values are correct (especially `APP_DOMAIN=bsg.workflo.space`).
3. Start service:

```bash
docker compose up -d --build
```

4. Health check:

```bash
curl -f http://127.0.0.1:<PORT>/health
```

Detailed steps are in `docs/deployment.md`.

## Documentation map

Active references:
- [docs/architecture.md](docs/architecture.md) — module map and data flows (start here).
- [docs/spec_v2_alignment.md](docs/spec_v2_alignment.md) — what is implemented vs planned vs out-of-scope from `technical_specification_bsg.docx v2.0`.
- [docs/calculator_logic_and_formulas.md](docs/calculator_logic_and_formulas.md) — calculator formulas (source of truth for the frozen calculator).
- [docs/phase_07_unified_document_pipeline_plan.md](docs/phase_07_unified_document_pipeline_plan.md) — active phase plan for unified PDF generation.
- [docs/pdf_template_fidelity_requirements.md](docs/pdf_template_fidelity_requirements.md) — mandatory visual/structural baseline for OFFER PDF.
- [docs/pdf_rendering_logic_matrix.md](docs/pdf_rendering_logic_matrix.md) — Payin/Payout layout-mode matrix + per-sample variation table.
- [docs/pdf_renderer_audit_2026-05-02.md](docs/pdf_renderer_audit_2026-05-02.md) — gap analysis: current OFFER renderer vs 8 reference samples.
- [docs/agreement_structure.md](docs/agreement_structure.md) — AGREEMENT (long-form Service Agreement) structure derived from MSA template.
- [docs/pdf_ui_kit.md](docs/pdf_ui_kit.md) — PDF UI Kit notes.
- [docs/integrations.md](docs/integrations.md) — current and planned integrations (HubSpot is documented as a future plan only).
- [docs/decisions.md](docs/decisions.md) — chronological technical/product decision log.
- [docs/deployment.md](docs/deployment.md) — deployment guide.
- [docs/audit_2026-05-02.md](docs/audit_2026-05-02.md) — latest audit and prioritized risks.

Historical (read-only):
- [docs/archive/](docs/archive/) — closed-phase handoffs, prior audits, the calculator delivery contract, and resolved spec questions.

Specification documents (external, not stored in repo):
- `Calculator_Описание.docx` — calculator-only spec; governs `src/domain/calculator/**`.
- `technical_specification_bsg.docx v2.0` — Contract Generator System (CGS) spec; governs the wizard / PDF generator / planned backend.
- `Extended Schedule 4 - MSA format.docx` — Master Service Agreement long-form template; governs the AGREEMENT renderer (see `docs/agreement_structure.md`).

Reference PDF samples (used for visual fidelity validation, not stored in repo):
- `ZenCreator Commercial Offer 1.1.pdf` (11 pages, OFFER + MSA)
- `Aron Group Commercial Offer 1.0.pdf` (2 pages, OFFER only)
- `CEI Commercial Offer 1.0 and MSA_Director Signed.pdf` (11 pages, OFFER + MSA, signed)
- `Finera Commercial Offer 1.0.pdf` (2 pages, OFFER only)
- `ATOM Commercial Offer 1.0 and MSA.pdf` (11 pages, OFFER + MSA)
- `Pay.cc Commercial Offer 1.1.pdf` (2 pages, OFFER only)
- `SoftGaming Commercial Offer 1.0.pdf` (2 pages, OFFER only)
- `TodaPay Commercial Offer 1.0.pdf` (2 pages, OFFER only)

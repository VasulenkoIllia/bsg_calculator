# BSG Calculator

Frontend-first pricing calculator with deterministic domain formulas and full zone-by-zone breakdown (Zone 0 -> Zone 6), plus a Contract Wizard that generates an OFFER PDF from three sources (calculator data, manual blank, manual defaults).

## Hard rule: the calculator is frozen

The calculator's math and business logic are stabilized and **must not be changed without explicit user approval**. UI/refactor changes that preserve outputs are OK after confirmation. Future product work happens in the wizard / PDF / backend layers, not by altering calculator state shape or formula files in `src/domain/calculator/**`.

## Current project status

- Full-stack app: React + Vite SPA (`src/`) + an Express/Drizzle/Postgres
  API (`server/`) that serves the built SPA and the `/api/v1/*` backend.
- Calculation engine: `src/domain/calculator/*` (unit-tested per zone)
- Document Wizard + OFFER PDF renderer: `src/components/document-wizard/*`;
  PDFs rendered server-side via Puppeteer.
- Backend (`server/`): JWT auth + RBAC, **opt-in TOTP 2FA** (Google
  Authenticator-compatible), CRM company/deal sync + webhooks against
  **monday.com, the only CRM** (live since 2026-08-28; HubSpot is retired,
  its account no longer exists and its code is dormant — see
  `docs/CRM_INTEGRATION.md`), saved calculators + documents with
  soft-delete, an admin/audit surface.
- Deployment: Docker Compose + Traefik (see `docs/deployment.md`).

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
- `docker-compose.yml` - production runtime behind Traefik: Postgres + one app container
- `Dockerfile` - single-container production image: Express serves the built SPA and the API (with Chromium for server-side PDF)

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

## Docker deploy

Production is one app container (Express serves the built SPA and the API)
plus Postgres, behind Traefik. `.env.example` is the local-development
template — do not deploy from it: compose runs the app with
`NODE_ENV=production`, which refuses to boot on its placeholder secrets.

First deploy (full steps: [docs/deployment.md](docs/deployment.md) §4):

1. Prepare env from the production template, fill in every `<REQUIRED>` (and the empty `MONDAY_API_TOKEN`)
   placeholder (among them `MONDAY_API_TOKEN` and `MONDAY_WEBHOOK_SECRET`)
   and keep `CRM_PROVIDER=monday` (§4.2):

```bash
cp .env.production.example .env
```

2. Build and start:

```bash
docker compose up -d --build
```

3. Health check — both containers should report `(healthy)`; the app's
   probe calls `GET /health`:

```bash
docker compose ps
```

4. Load the CRM data and register the monday webhooks (§4.6).

Updates to a running deployment follow [docs/deployment.md](docs/deployment.md)
§6.1: a pinned commit synced from a clean checkout, then
`docker compose build app` and `docker compose up -d --no-deps app`. Never
run `docker compose down`.

## Documentation map

**New here? Start with [docs/ONBOARDING.md](docs/ONBOARDING.md)** — the single
developer handoff guide (architecture, how each part works, how to run, deploy,
and operate).

Current references (how the system works today):
- [docs/CRM_INTEGRATION.md](docs/CRM_INTEGRATION.md) — **the CRM operating manual.** monday.com is the only CRM: data in (webhooks) and out (notes), self-healing, health checks, routine operations.
- [docs/CRM_MIGRATION_RECORD.md](docs/CRM_MIGRATION_RECORD.md) — permanent record of the HubSpot → monday.com migration (completed 2026-08-28): sequence, decisions, what went wrong.
- [docs/architecture.md](docs/architecture.md) — module map and data flows.
- [docs/CODEMAPS/](docs/CODEMAPS/) — per-tree code maps (frontend + server).
- [docs/calculator_logic_and_formulas.md](docs/calculator_logic_and_formulas.md) — calculator formulas (source of truth for the frozen calculator).
- [docs/backend_conventions.md](docs/backend_conventions.md) — server folder layout, vertical-slice pattern, error envelope.
- [docs/backend_state_schemas.md](docs/backend_state_schemas.md) — typed payload contracts (`calculator_snapshots`, `documents`).
- [docs/backend_computation_boundary.md](docs/backend_computation_boundary.md) — what the backend recomputes vs trusts from snapshots.
- [docs/deployment.md](docs/deployment.md) — production deployment + operations guide.
- [docs/integrations.md](docs/integrations.md) — summary of third-party integrations (CRM, Puppeteer, Traefik, …); its HubSpot section is historical. For CRM operations, `CRM_INTEGRATION.md` is authoritative.
- [docs/spec_v2_alignment.md](docs/spec_v2_alignment.md) — implemented vs planned vs out-of-scope from `technical_specification_bsg.docx v2.0`.
- PDF/contract docs: [pdf_template_fidelity_requirements.md](docs/pdf_template_fidelity_requirements.md), [pdf_rendering_logic_matrix.md](docs/pdf_rendering_logic_matrix.md), [pdf_ui_kit.md](docs/pdf_ui_kit.md), [agreement_structure.md](docs/agreement_structure.md).
- [docs/url_contract.md](docs/url_contract.md) — frozen calculator + wizard URL contract.
- [docs/calculator_deferred_changes.md](docs/calculator_deferred_changes.md) — punch list for the next time the calculator is unfrozen.
- [docs/decisions.md](docs/decisions.md) — chronological technical/product decision log (full rationale history).

Historical (read-only):
- CRM migration planning, superseded by `CRM_INTEGRATION.md` and `CRM_MIGRATION_RECORD.md`: [docs/monday_migration_plan.md](docs/monday_migration_plan.md) (plan and decisions), [docs/monday_migration_analysis.md](docs/monday_migration_analysis.md) (original code inventory), [docs/monday_audit_round4.md](docs/monday_audit_round4.md) (final pre-cutover review). They describe the transition, when both CRMs were connected.
- HubSpot era (retired — the account no longer exists): [docs/client_and_hubspot_workflow.md](docs/client_and_hubspot_workflow.md) (client picker + HubSpot sync workflow), [docs/bsg_hubspot_field_mapping.md](docs/bsg_hubspot_field_mapping.md) + [docs/hubspot_api_reference.md](docs/hubspot_api_reference.md) (field selection + API reference).
- [docs/archive/](docs/archive/) — closed-phase plans + handoffs, dated audits (PDF renderer, pixel-diff, pre-backend), the calculator delivery contract, and resolved spec questions.

Specification documents (external, not stored in repo):
- `Calculator_Описание.docx` — calculator-only spec; governs `src/domain/calculator/**`.
- `technical_specification_bsg.docx v2.0` — Contract Generator System (CGS) spec; governs the wizard / PDF generator / planned backend.
- `Extended Schedule 4 - MSA format.docx` — Master Service Agreement long-form template; governs the AGREEMENT renderer (see `docs/agreement_structure.md`).

Reference PDF samples (used for visual fidelity validation, not stored in repo):
- Eight real Commercial Offer PDFs: three 11-page OFFER + MSA (one of them signed) and five 2-page OFFER-only. Their file names carry client names, so they are not listed here; ask the maintainer for the set.

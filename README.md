# BSG Calculator

Frontend-first pricing calculator with deterministic domain formulas and full zone-by-zone breakdown (Zone 0 -> Zone 6).

## Current project status

- Active runtime: React + Vite frontend (`src/`)
- Calculation engine: `src/domain/calculator/*`
- Legacy backend stub (health-only): `server/` (not used to serve frontend)
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

## Documentation notes

- `docs/calculator_logic_and_formulas.md` is the current formula source of truth.
- `docs/audit_2026-05-01.md` is the latest critical technical audit with prioritized risks and cleanup plan.
- `docs/phase_*` files are historical phase handoff snapshots.

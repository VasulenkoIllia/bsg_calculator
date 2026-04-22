# BSG Calculator

Frontend-first pricing calculator with deterministic domain formulas and full zone-by-zone breakdown (Zone 0 -> Zone 6).

## Current project status

- Active runtime: React + Vite frontend (`src/`)
- Calculation engine: `src/domain/calculator/*`
- Legacy backend stub (health-only): `server/` (not used to serve frontend)
- Deployment target (test): `bsg.workflo.space`

## Project structure

- `src/App.tsx` - UI wiring, zone state, integration of all formulas
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
```

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
- `docs/phase_*` files are historical phase handoff snapshots.

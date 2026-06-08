# BSG Calculator — Developer Onboarding & Handoff

Single entry point for a developer taking over this codebase. It explains
**what the system is, how each part works, how to run it, and how to operate
it in production.** Deeper references are linked at the end; this document is
the map.

Last updated: 2026-06-08.

---

## 1. What this is

A full-stack internal tool for **BSG** that does two things:

1. **Pricing calculator** — a deterministic, zone-by-zone (Zone 0 → Zone 6)
   pricing engine for payment-processing deals. The math is **frozen** (see
   §3).
2. **Contract / document generator** — a wizard that turns calculator output
   (or a manual blank/defaults) into a **Commercial Offer PDF** (and a
   long-form Agreement/MSA), rendered server-side, with documents persisted,
   numbered (`BSG-#####`), and synced to HubSpot as Notes.

Around those two cores sits an authenticated back office: users + roles,
opt-in two-factor auth, saved calculators and documents (with soft-delete and
an audit/History trail), and a HubSpot company/deal sync.

## 2. Run it locally (TL;DR)

Requirements: **Node 20** (`.nvmrc`), npm, Docker (for Postgres).

```bash
# 1. Start Postgres (localhost:5433, user/pass bsg/bsg_dev_password)
docker compose -f docker-compose.dev.yml up -d

# 2. Install deps
npm install

# 3. Configure env
cp .env.example .env          # then fill in secrets (see §10)

# 4. Apply DB migrations
npm run db:migrate

# 5. Create a first user (interactive)
npm run create-user

# 6. Run the two dev processes (separate terminals)
npm run dev          # Vite SPA  → http://localhost:5173
npm run dev:server   # Express API → http://localhost:3000 (tsx watch)
```

In dev the SPA (Vite) and API (Express) run as **two processes**; the SPA
calls the API cross-origin (CORS allows `FRONTEND_ORIGIN`). In production they
are **one container**: Express serves the built SPA *and* the API (§9).

Useful extras: `npm run db:studio` (Drizzle Studio), `npm run hubspot:backfill`
(seed companies/deals from HubSpot).

## 3. The golden rule: the calculator is frozen

The calculator's **math and business logic must not change without explicit
user approval.** This covers `src/domain/calculator/**` and the derived
calculation hooks (`useCalculatorDerivedData`, `derived/*`). Pure refactors
are allowed only if `npm run verify` stays green and outputs are identical.

Formulas are documented in
[`calculator_logic_and_formulas.md`](calculator_logic_and_formulas.md) (the
source of truth). When the calculator is eventually unfrozen, the queued
wording/label changes are in
[`calculator_deferred_changes.md`](calculator_deferred_changes.md).

There are two governing specs (external `.docx`, not in the repo): the
calculator spec governs `src/domain/calculator/**`; the CGS spec governs the
wizard / PDF / backend. Implementation status of the latter:
[`spec_v2_alignment.md`](spec_v2_alignment.md).

## 4. Architecture at a glance

```
Browser (React 19 SPA, Vite)
   │  fetch /api/v1/*  (axios singleton; in-memory access token,
   │                    httpOnly refresh cookie)
   ▼
Express API (server/)                      ┌─────────────────────────┐
   • middleware: helmet+CSP, rate-limit,   │ Puppeteer browser pool   │
     cookie/JSON parsers, request-id, log  │ (server-side PDF render)  │
   • /api/v1/* vertical-slice modules      └─────────────────────────┘
   • serves the built SPA in production
   ▼                         ▲
PostgreSQL (Drizzle ORM)     │ TTL-cached reads, Note write-back,
                             │ inbound webhooks (HMAC v3)
                             ▼
                          HubSpot CRM
```

- **Frontend:** React 19 + Vite + TanStack Query + react-router + react-hook-form + Tailwind.
- **Backend:** Express 4 + Drizzle ORM + Postgres, JWT auth, Puppeteer for PDF.
- **Single source of truth:** backend Zod schemas; frontend wire types mirror them (`src/api/types.ts`).

For the module-level map and data flows, see
[`architecture.md`](architecture.md) and
[`CODEMAPS/`](CODEMAPS/) (per-tree code maps).

## 5. Repository layout

```
src/                         React SPA
  domain/calculator/zone0..6   FROZEN pricing engine (unit-tested per zone)
  components/calculator/        calculator UI + state + derived data hooks
  components/document-wizard/   wizard UI + OFFER/AGREEMENT HTML builders + pdf-kit
  pages/                        routed pages (login, calc, company detail, admin, cabinet)
  api/                          axios client + endpoint wrappers + wire types
  contexts/ hooks/ shared/      AuthContext, reusable hooks, formatters

server/                      Express API
  app.ts                       middleware stack + route mounts (read this first)
  index.ts                     process entrypoint (bind PORT, graceful shutdown)
  config/env.ts                Zod-validated env (the env contract)
  middleware/                  auth, role, rate-limit, error-handler, request-id, logger
  modules/<feature>/           vertical slices: routes → controller → service → repository → schemas
  db/schema/                   Drizzle table definitions
  db/migrations/               SQL migrations (drizzle-kit generated)
  shared/                      cross-module helpers (ttl-refresh, build-page, dto-parse, errors, hubspot)
  tests/                       integration tests (supertest + real Postgres)

docs/                        documentation (this file is the entry point)
scripts/                     dev/ops scripts (hubspot inspect, visual-diff)
Dockerfile, docker-compose*.yml, nginx/  packaging & deploy
```

## 6. Backend conventions (read before touching `server/`)

Each feature is a **vertical slice** with a fixed shape:

```
routes.ts       → defines endpoints + per-route middleware (auth, role, rate-limit)
controller.ts   → parses/validates input (Zod), calls service, shapes response
service.ts      → business logic + transactions (the only layer that "decides")
repository.ts   → DB access (Drizzle queries) — no business logic
schemas.ts      → Zod request/response schemas (the contract)
```

Other invariants:

- **Error envelope:** every error is `{ error: { code, message, details? } }`
  with a documented `code`. Throw typed errors from `server/shared/errors.ts`;
  the central `error-handler` middleware turns them into the envelope. No
  surprise 500s.
- **Validate all input** at the controller with Zod before it reaches a service.
- **Middleware order matters** — it is documented inline at the top of
  `server/app.ts`. The HubSpot webhook **raw-body** parser is scoped to one
  exact path; never broaden it (it would shadow JSON parsing for every POST).
- Full reference: [`backend_conventions.md`](backend_conventions.md). Payload
  contracts for snapshots/documents: [`backend_state_schemas.md`](backend_state_schemas.md).
  What the backend recomputes vs trusts from a snapshot:
  [`backend_computation_boundary.md`](backend_computation_boundary.md).

## 7. Database & migrations

- **Postgres** via **Drizzle ORM**. Tables live in `server/db/schema/*.ts`;
  there are 20 SQL migrations in `server/db/migrations/`.
- Core tables: `users`, `refresh_tokens`, `trusted_devices`, `mfa_temp_tokens`,
  `totp_backup_codes`, `user_invites`, `password_resets`, `companies`, `deals`,
  `calculator_configs`, `documents`, `document_number_sequence`,
  `document_events`, `calculator_config_events`, `admin_actions`,
  `hubspot_webhook_events`.
- Workflow:
  - Change a `schema/*.ts` table → `npm run db:generate` (writes a new
    migration) → review the SQL → `npm run db:migrate`.
  - Prefer **additive** changes; call out lock/backfill risk on big tables.
- Document numbers are allocated from `document_number_sequence`
  (`BSG-#####`, starting at `DOCUMENT_NUMBER_START`).

## 8. Auth & security model

- **Access token:** short-lived JWT, kept **in memory only** on the client
  (never localStorage). Carries `sub` + `role`.
- **Refresh token:** opaque random string in an **httpOnly, SameSite=Strict**
  cookie; only its hash is stored (`refresh_tokens.token_hash`). Lifetime is
  `JWT_REFRESH_EXPIRES` (**intended default `12h`** — see the §11 warning).
  The axios client does single-flight refresh-on-401.
- **RBAC:** roles `user` / `admin` / `super_admin`, enforced by
  `require-auth` + `require-role` middleware.
- **Opt-in TOTP 2FA:** Google-Authenticator-compatible. Enroll → confirm →
  one-time backup codes. Login from an untrusted browser requires a 6-digit
  code; force-disable revokes sessions. Code in `server/modules/auth/two-factor.*`.
- **Invites & password resets:** public token-link flows
  (`/api/v1/auth/invite`, `/api/v1/auth/password-reset`); the raw token *is*
  the credential and any non-pending state returns 404 without leaking why.
- **Inbound webhooks:** HubSpot HMAC v3 verified over the raw body.
- **Transport hardening:** helmet with an explicit **CSP**, per-IP rate limits
  (global 60/min, tighter on login/refresh/pdf), `trust proxy` set to
  `TRUST_PROXY_HOPS` so rate-limit keys can't be spoofed via `X-Forwarded-For`.
- Passwords hashed with **bcrypt** (`BCRYPT_COST`). Admin-sensitive actions are
  written to the `admin_actions` audit log.

## 9. Document wizard & PDF pipeline

- The wizard (`src/components/document-wizard/`) builds a
  `DocumentTemplatePayload` from one of three sources: calculator data, a
  manual blank, or manual defaults.
- The **same** HTML builder (`buildOfferPdfHtml.ts`) is shared between the
  live preview and the server: it is compiled into the server build via the
  `tsconfig.server.json` include list (pure-string files only — no React).
- PDFs render **server-side** with a pooled Puppeteer browser
  (`server/modules/pdf/`). `POST /api/v1/pdf/preview` renders the live wizard
  state; `GET /api/v1/documents/:number/pdf` renders a persisted document.
- One universal layout (no "compact" mode). PDF fidelity rules:
  [`pdf_template_fidelity_requirements.md`](pdf_template_fidelity_requirements.md),
  layout-mode matrix: [`pdf_rendering_logic_matrix.md`](pdf_rendering_logic_matrix.md),
  Agreement structure: [`agreement_structure.md`](agreement_structure.md).

## 10. HubSpot integration

Live and entirely server-side. Reads companies/deals (TTL-cached), processes
inbound webhooks (HMAC v3), and writes a document Note back to the parent
company/deal on create (auto) and on manual Sync. Full detail:
[`integrations.md`](integrations.md), field mapping:
[`bsg_hubspot_field_mapping.md`](bsg_hubspot_field_mapping.md), operator flow:
[`client_and_hubspot_workflow.md`](client_and_hubspot_workflow.md).

## 11. Environment variables

`server/config/env.ts` is the **authoritative, Zod-validated contract** — the
app refuses to boot on invalid config. `.env.example` and
`.env.production.example` are the committed templates (`.env*` real files are
gitignored). Groups:

| Group | Keys (selected) |
|---|---|
| App / proxy | `APP_NAME`, `APP_DOMAIN`, `APP_PUBLIC_URL`, `NODE_ENV`, `PORT`, `TRUST_PROXY_HOPS`, `TRAEFIK_*` |
| Database | `DATABASE_URL` (or `DB_HOST/PORT/USER/PASSWORD/NAME`), `DB_POOL_MAX` |
| Auth | `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES`, `JWT_REFRESH_EXPIRES`, `BCRYPT_COST`, `TOTP_ENCRYPTION_KEY` |
| HubSpot | `HUBSPOT_API_TOKEN`, `HUBSPOT_WEBHOOK_SECRET`, `HUBSPOT_SYNC_TTL_SECONDS`, `HUBSPOT_AUTO_BACKFILL`, `AUTO_SYNC_TO_HUBSPOT` |
| PDF | `PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_HEADLESS`, `PDF_RENDER_TIMEOUT_MS`, `PUPPETEER_RENDERS_PER_BROWSER`, `PUPPETEER_BROWSER_TTL_MS` |
| Misc | `DOCUMENT_NUMBER_START`, `LOG_LEVEL`, `LOG_HTTP_REQUESTS`, `FRONTEND_ORIGIN`, `SPA_DIST_DIR` |

> ⚠️ **Production config to verify:** the committed templates set
> `JWT_REFRESH_EXPIRES=12h` (the intended security-hardened value), but check
> the **live** `.env.production` on the server — if it still says `30d`,
> refresh sessions live 30 days instead of 12 hours. Align it before relying
> on the short-session guarantee. See §14.

## 12. Testing & verification

```bash
npm run verify        # typecheck + lint + frontend tests + build (the gate)
npm run test          # frontend unit/integration (vitest, jsdom)
npm run test:server   # backend integration (vitest, node) — needs Postgres up
npm run typecheck:server
```

- **Frontend:** ~397 tests (vitest + Testing Library). UI integration tests
  render the full provider stack.
- **Backend:** ~401 tests (vitest + supertest against a **real** Postgres test
  DB `bsg_calculator_test`, auto-created and migrated by
  `server/tests/setup.ts`; runs sequentially, `fileParallelism: false`).
- **CI** (`.github/workflows/ci.yml`) runs typecheck + lint + **frontend** test
  + build. ⚠️ It does **not** run `test:server` or `typecheck:server` (no
  Postgres service) — run those locally before pushing backend changes (§14).

## 13. Deployment & operations

- **Single container:** the `Dockerfile` builds the SPA and the server; in
  production Express serves `/srv/spa` (the built SPA) plus the API. No nginx.
- **Reverse proxy:** Traefik / Coolify terminates TLS and routes
  `Host(${APP_DOMAIN})` to the container. Health probe: `GET /health`
  (root-mounted, no auth, no rate limit).
- **Migrations on deploy:** run `npm run db:migrate` against the prod DB as
  part of the release (additive migrations; review before applying).
- Test target: `bsg.workflo.space`. Full runbook (build, env upload, compose,
  rollback): [`deployment.md`](deployment.md).

## 14. Production-readiness status (as of 2026-06-08)

**Green:** `npm run verify` passes (typecheck, lint, 397 frontend tests,
build); server typecheck + 401 server tests pass; no secrets tracked in git;
strong security posture (helmet/CSP, rate limits, RBAC, 2FA, HMAC webhooks,
SSRF defence, bcrypt). Single-container deploy with health checks + CI.

**Known risks / follow-ups:**

1. **`JWT_REFRESH_EXPIRES` drift (verify on server).** Committed templates say
   `12h`; the live/local `.env*` files were observed at `30d`. Confirm and fix
   the production value (§11).
2. **CI doesn't cover the backend.** Add `typecheck:server` (cheap, no DB) and,
   ideally, `test:server` with a Postgres service container so backend
   regressions are caught in CI (§12).
3. **Frontend bundle is one ~857 KB chunk** (no code-splitting). Fine for an
   internal tool; revisit with route-level `import()` if load time matters.
4. **No E2E tests / observability/metrics.** Acceptable for launch; listed as
   the next hardening step.
5. **Server integration suite shares one Postgres** (sequential). Cross-test
   pollution from a fire-and-forget HubSpot sync and an unhandled-rejection
   leak were fixed (2026-06-08); keep new fire-and-forget work out of the
   request path's test surface or gate it on `isConfigured()`.

## 15. Common tasks

- **Add an API endpoint:** create/extend a `server/modules/<feature>/` slice
  (routes → controller → service → repository → schemas), mount its router in
  `server/app.ts`, add a Zod schema + an integration test.
- **Change the DB:** edit `server/db/schema/*.ts` → `npm run db:generate` →
  review SQL → `npm run db:migrate`.
- **Add a frontend page:** add under `src/pages/`, wire the route + guard,
  add an `src/api/` wrapper whose types mirror the backend schema.
- **Create a user:** `npm run create-user`. **Seed HubSpot data:**
  `npm run hubspot:backfill`.
- **Touch the calculator:** don't, unless explicitly approved (§3).

## 16. Where to read more

Start here, then go deep:

- [`architecture.md`](architecture.md) — module map + data flows.
- [`backend_conventions.md`](backend_conventions.md) — server patterns.
- [`calculator_logic_and_formulas.md`](calculator_logic_and_formulas.md) — frozen calculator math.
- [`deployment.md`](deployment.md) — production runbook.
- [`integrations.md`](integrations.md) — HubSpot / Puppeteer / Traefik.
- [`decisions.md`](decisions.md) — full chronological "why" log for past decisions.
- [`CODEMAPS/`](CODEMAPS/) — deeper per-tree code maps.
- [`archive/`](archive/) — historical phase plans + dated audits (context only).
- `README.md` (repo root) — quick start + the full documentation map.
- `AGENTS.md` (repo root) — operating standard + the hard project rules.

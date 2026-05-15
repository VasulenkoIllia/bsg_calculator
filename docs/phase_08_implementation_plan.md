# Phase 8 Implementation Plan

Date: 2026-05-15
Status: **Ready to start coding.**

Maps the decisions in `phase_08_backend_plan.md` + `backend_conventions.md`
+ `decisions.md` to a sequenced sprint plan with explicit deliverables,
acceptance criteria, and dependency edges.

Effort estimates assume one developer working full-time. Total: ~7-8
working days.

See also:
- `docs/phase_08_backend_plan.md` — DB schema, endpoints, flows.
- `docs/backend_conventions.md` — folder, conventions, error format.
- `docs/bsg_hubspot_field_mapping.md` — HubSpot field selection.
- `docs/decisions.md` — full decision log.

---

## Dependency graph

```
Sprint 1 (Foundation) ────┬──→ Sprint 2 (HubSpot reads) ──┐
                          │                                 │
                          ├──→ Sprint 3 (Calc configs) ────┤
                          │                                 │
                          └──→ Sprint 4 (Documents + PDF) ─┤
                                                            ├──→ Sprint 6 (Frontend) ──→ Sprint 7 (Docker + Deploy)
                              Sprint 5 (Webhooks) ─────────┘
```

Sprint 1 unlocks 2/3/4 (parallel-capable). Sprint 5 (webhooks)
requires a publicly-reachable HTTPS endpoint, so it usually lands
after Sprint 7 (deploy). Sprint 6 (frontend) needs 2 + 3 + 4 backend
APIs working.

---

## Sprint 1 — Foundation (~1.5 days)

**Goal**: an empty Express server that authenticates users.

### Deliverables

1. **Project bootstrap**
   - `server/index.ts`, `server/app.ts` (split for tests)
   - `tsconfig.server.json` already exists; verify it compiles
     `server/` without DOM types
   - `npm run dev:server` works (tsx watch)

2. **Config loader** — `server/config/env.ts`
   - Zod schema covering 24 env vars from `backend_conventions.md` §4
   - Throws on invalid env at process start

3. **Drizzle setup**
   - `drizzle.config.ts` at repo root
   - `server/db/client.ts` — pool + db instance
   - `server/db/schema/users.ts`
   - `server/db/schema/refresh-tokens.ts`
   - `server/db/schema/index.ts` re-exports

4. **Initial migration** — `0001_init.sql`
   - `CREATE EXTENSION IF NOT EXISTS citext;`
   - Tables: `users` (with `citext` email + login, `is_admin`),
     `refresh_tokens` (with `last_used_at`, partial index)
   - Generated via `npm run db:generate` (Drizzle Kit)

5. **Middleware**
   - `request-id.ts`
   - `logger.ts` (pino-http)
   - `error-handler.ts` (4-arg, renders `{ error: { code, message } }`)
   - `require-auth.ts` (JWT verification)
   - `require-admin.ts`

6. **Auth module** (`server/modules/auth/`)
   - `auth.schemas.ts` (Zod for login body, refresh body)
   - `auth.repository.ts` (user lookup, refresh token CRUD)
   - `auth.service.ts` (login, refresh with 10s grace window, logout)
   - `auth.controller.ts` (thin req/res adapters)
   - `auth.routes.ts` (mounted at `/api/v1/auth`)

7. **Users module** (`server/modules/users/`)
   - GET / PATCH endpoints behind `require-admin`
   - `POST /:id/reset-password` (admin-only)

8. **CLI script** — `server/scripts/create-user.ts`
   - `npm run create-user -- --email=... --password=... [--admin]`
   - Used to bootstrap the first admin user.

9. **Health endpoints** — `/health` (liveness), `/ready` (DB ping)

### Acceptance criteria

- `npm run db:migrate` applies the migration cleanly to a fresh
  Postgres database.
- `npm run create-user --admin` creates a user.
- `curl POST /api/v1/auth/login` with valid creds returns access
  token + sets refresh cookie.
- `curl GET /api/v1/auth/me` with the token returns the user.
- `curl POST /api/v1/auth/refresh` rotates the token; the old token
  works for 10s after rotation, then 401.
- Unit tests (vitest): 15-20 cases covering Zod schemas + service
  logic.

---

## Sprint 2 — HubSpot reads + backfill (~1 day)

**Goal**: HubSpot data appears in our DB; we can list companies + deals.

### Deliverables

1. **Migration** — `0002_companies_deals.sql`
   - `companies` table (8 columns + `hubspot_raw` JSONB + indexes)
   - `deals` table (12 columns + FK + `hubspot_raw` + indexes)

2. **HubSpot module** (`server/modules/hubspot/`)
   - `hubspot.client.ts` — fetch wrapper, retries, rate-limit
     handling. Methods: `listCompanies(cursor)`,
     `listDeals(cursor)`, `getCompany(id)`, `getDeal(id)`,
     `listPipelineStages()`.
   - Type-safe responses via Zod.

3. **Backfill command** — `server/scripts/hubspot-backfill.ts`
   - `npm run hubspot:backfill`
   - Paginates companies + deals, upserts into our tables.
   - Idempotent. Logs progress every 100 records.
   - Auto-runs on container start if `companies` table empty
     (env flag `HUBSPOT_AUTO_BACKFILL=true`).

4. **Companies module** (`server/modules/companies/`)
   - `GET /api/v1/companies?q=&cursor=` — paginated search
   - `GET /api/v1/companies/:id`
   - `GET /api/v1/companies/:id/deals` — paginated

5. **Deals module** (`server/modules/deals/`)
   - `GET /api/v1/deals/:id`

6. **TTL refresh logic**
   - On `GET /:id` hit, if `last_synced_at` older than
     `HUBSPOT_SYNC_TTL_SECONDS`, kick a background refetch.
   - Response is served from cache regardless (no blocking).

### Acceptance criteria

- `npm run hubspot:backfill` populates both tables from live BSG
  HubSpot account.
- `curl GET /api/v1/companies?q=Acme` returns matches with paging.
- Integration tests (Testcontainers + nock mocking HubSpot): 25-30
  cases.

---

## Sprint 3 — Calculator configs (~0.5 days)

**Goal**: operator can save and resume calculator drafts.

### Deliverables

1. **Migration** — `0003_calculator_configs.sql`
   - `calculator_configs` table per `phase_08_backend_plan.md` §3.

2. **Calculator-configs module** (`server/modules/calculator-configs/`)
   - `POST /api/v1/calculator-configs` (create)
   - `GET /api/v1/calculator-configs/:id`
   - `PATCH /api/v1/calculator-configs/:id` (FULL REPLACE of payload, not merge)
   - `DELETE /api/v1/calculator-configs/:id` (hard delete)
   - `GET /api/v1/calculator-configs?company_id=&deal_id=&created_by=` (list)

3. **Auto-name helper**
   - When `name` is NULL on create/save, frontend or backend
     renders "Untitled · <company name> · <date>".

4. **Validation**
   - `payload` validated via Zod re-export of
     `DocumentTemplatePayload` from the frontend types.

### Acceptance criteria

- Full CRUD works against live DB.
- Updating `payload` with a malformed shape returns
  `VALIDATION_FAILED` with Zod issues in `details`.
- Integration tests: 15 cases (CRUD × happy/auth-fail/validation-fail).

---

## Sprint 4 — Documents + PDF render (~2 days)

**Goal**: operator can save offers/agreements and download their PDFs.

### Deliverables

1. **Migration** — `0004_documents.sql`
   - `documents` table (with all CHECK constraints + indexes)
   - `document_number_sequence` (singleton, seeded with `7100001`)

2. **Numbering service**
   - `server/modules/documents/numbering.service.ts`
   - `allocateNextNumber(hubspotCompanyId, tx)` — UPDATE … RETURNING
     inside the caller's TX; builds `BSG-<7d>-<6d>` string.

3. **Documents module** (`server/modules/documents/`)
   - `POST /api/v1/documents` — Flow A (from calc), Flow B
     (use-as-template), Flow C (direct clone). Per `phase_08_backend_plan.md` §5.
   - `GET /api/v1/documents/:number`
   - `POST /api/v1/documents/:number/use-as-template` — creates new
     calc seeded from doc payload, returns redirect URL.
   - `GET /api/v1/documents?…filters…` — paginated listing.
   - `GET /api/v1/numbering/peek` — preview next id without
     allocating.

4. **Listings module** (`server/modules/listings/`)
   - `GET /api/v1/listings/companies` — hierarchical
     Company → Deal → Docs/Calcs in one query (joined projection).

5. **PDF module** (`server/modules/pdf/`)
   - `pdf.browser-pool.ts` — singleton Puppeteer Browser with
     recycle policy (`PUPPETEER_RENDERS_PER_BROWSER`, `_BROWSER_TTL_MS`).
   - `pdf.service.ts` — `render(payload): Promise<Buffer>`. Reuses
     existing `buildOfferPdfHtml` from `src/`. **Stream-only — no
     disk write, no cache.**
   - `GET /api/v1/documents/:number/pdf?download=true` — streams Buffer.

6. **Sync stub**
   - `POST /api/v1/documents/:number/sync` — returns
     `{ hubspot_sync_state: "not_synced" }` 501.
   - `GET /api/v1/documents/:number/sync` — returns current null
     state 200.

### Acceptance criteria

- Two concurrent `POST /documents` calls atomically allocate
  distinct numbers (verified by integration test).
- PDF download streams without filesystem activity (verified by
  checking that no files appear in `/tmp/puppeteer*`).
- Browser recycles after N renders (force `MAX=3` via env in test).
- Use-as-template returns redirect URL; new calc has copied payload.
- Integration tests: 25-30 cases. Pixel-diff: 10 fixtures.

---

## Sprint 5 — HubSpot webhooks (~0.5 days)

**Goal**: HubSpot pushes updates to us in real-time without polling.

### Deliverables

1. **Migration** — `0005_hubspot_webhook_events.sql`
   - `hubspot_webhook_events` table with UNIQUE on
     `hubspot_event_id` + partial index for pending rows.

2. **Webhook receiver** — `server/modules/hubspot/hubspot.routes.ts`
   - `POST /api/v1/hubspot/webhooks` — verify HMAC, INSERT event,
     ack 200, kick async processor.
   - `middleware/verify-hubspot-signature.ts` — HMAC SHA-256 of
     `${method}${uri}${body}${timestamp}` with
     `HUBSPOT_WEBHOOK_SECRET`.

3. **Worker** — `hubspot.event-processor.ts`
   - Polls pending rows every 5s. For each event: fetch full object
     from HubSpot, upsert into our table, mark processed.
   - Errors: increment attempts + last_error.

4. **Manual refresh** — `POST /api/v1/hubspot/refresh`
   - Body `{ company_ids?: text[] }`; empty → refresh page-visible
     defaults.

5. **HubSpot configuration doc**
   - Add to `docs/hubspot_api_reference.md`: how to configure
     webhook subscriptions in HubSpot Private App settings (URL,
     event types).

### Acceptance criteria

- Synthetic signed webhook request triggers an upsert.
- Tampered signature → 401.
- Duplicate `hubspot_event_id` → ON CONFLICT no-op.
- Failed processing leaves event in pending with `attempts > 0`.
- Integration tests: 15-20 cases.

---

## Sprint 6 — Frontend integration (~2 days)

**Goal**: existing wizard becomes backend-backed; new listing + view pages ship.

### Deliverables

1. **Auth pages**
   - `/login` — email/password form, calls `POST /api/v1/auth/login`,
     stores access in memory + refresh in httpOnly cookie.
   - Auth context: 401 → silent refresh, refresh fails → redirect
     to `/login`.
   - User menu in header with logout.

2. **API client** — `src/lib/api/`
   - One file per backend module: `auth.ts`, `calculator-configs.ts`,
     `documents.ts`, `companies.ts`, `deals.ts`, `listings.ts`,
     `hubspot.ts`.
   - Fetch wrapper: injects `Authorization: Bearer`, handles 401
     refresh, parses error envelope.

3. **Listings page** — `/listings`
   - Hierarchical accordion: Company → expand → Deals + standalone
     docs → expand deal → docs + calcs.
   - "Refresh from HubSpot" button → `POST /hubspot/refresh`.
   - Pagination (50 companies / page).

4. **Calc page** — `/calc/:id`
   - Mount loads via `GET /calculator-configs/:id` and hydrates the
     existing wizard.
   - Debounced (1s) `PATCH /calculator-configs/:id` on every change.
     "Saved · Xs ago" indicator.
   - "Save as offer" / "Save as agreement" buttons open an addendum
     modal → `POST /documents` → redirect to `/documents/:number`.

5. **Document view page** — `/documents/:number`
   - Read-only display of payload.
   - "Download PDF" button → triggers
     `GET /documents/:number/pdf?download=true`.
   - "Use as template" button → `POST /documents/:number/use-as-template`
     → redirect to `/calc/<new-uuid>`.

6. **Wizard updates**
   - Remove `defaultDraftNumber()` placeholder, use
     `GET /numbering/peek` for the preview number.
   - Remove `window.print()` path, route to `/documents/:number/pdf`.

### Acceptance criteria

- Full operator journey works in dev:
  login → listings → pick company → pick deal → "+ new calc" →
  edit (auto-saves) → "Save as offer" → addendum prompt → view doc → download PDF.
- All API errors render the `error.message` in toast.
- E2E test (Playwright): 5-10 scenarios covering the full journey.

---

## Sprint 7 — Docker + Deploy (~0.5 days)

**Goal**: single-container production image; Coolify deployment.

### Deliverables

1. **Dockerfile**
   - Multi-stage: build frontend → build server → final image.
   - Final stage: Node 20, Chromium (Puppeteer-pinned), copy
     `dist/` into `server/static/`.
   - Health check: `curl /health || exit 1`.

2. **docker-compose.yml**
   - Two services: `bsg-app` + `postgres:15`.
   - Volumes for Postgres data.
   - Env via `.env`.

3. **Entrypoint script**
   - Run migrations (`npm run db:migrate`) then start server.

4. **Express static serving**
   - `app.use(express.static("server/static"))` for the SPA.
   - SPA fallback: `app.get("*", sendIndexHtml)` for client-side routing.

5. **Coolify config** (or equivalent VPS docs)
   - Traefik labels for HTTPS termination.
   - Domain configured: `bsg.workflo.space`.
   - HubSpot webhook URL configured in HubSpot Private App
     settings.

### Acceptance criteria

- `docker compose up` from a fresh checkout produces a running
  service that passes `GET /health`.
- HTTPS endpoint reachable at the configured domain.
- HubSpot webhook delivers a real event end-to-end.

---

## Sprint 8 — Hardening (optional, ~0.5 days)

Items to come AFTER MVP if/when needed:

- DB BEFORE-UPDATE trigger rejecting non-allowed columns on `documents`.
- Outbound HubSpot token-bucket rate limit (Phase 9 prep).
- Browser-pool metrics dashboard (Prometheus).
- Pixel-diff CI job pinned to baseline.

---

## Mapping: decisions → sprints

| Decision | Sprint |
|---|---|
| `users.citext` + `is_admin` | 1 |
| `refresh_tokens.last_used_at` + grace window | 1 |
| Error envelope + logging + config loader | 1 |
| `companies` / `deals` 8+12 columns | 2 |
| HubSpot backfill command | 2 |
| Calculator configs auto-save | 3 + 6 |
| Documents immutability + numbering | 4 |
| PDF stream-only + browser recycle | 4 |
| Listings hierarchical view | 4 (backend) + 6 (frontend) |
| Use-as-template flow | 4 + 6 |
| Webhook idempotency table | 5 |
| Webhook HMAC verification | 5 |
| Note write-back (stub in 8, real in 9) | 4 (stub) |
| Manual refresh button | 5 (backend) + 6 (frontend) |
| Per-endpoint auth matrix | 1-6 (each sprint applies its endpoints) |
| Docker single-container | 7 |

---

## Risk register (carried from architect audit)

1. **Puppeteer memory growth** — mitigated by recycle policy in Sprint 4.
2. **Refresh-token race** — mitigated by 10s grace window in Sprint 1.
3. **Webhook duplicate delivery** — mitigated by events table in Sprint 5.
4. **Number wasted on TX failure** — covered by Sprint 4 integration test.
5. **Single-container scaling ceiling** — accepted for MVP, migration path documented in `phase_08_backend_plan.md`.

---

## Definition of done (Phase 8 overall)

- [ ] All 7 sprints' acceptance criteria met.
- [ ] ~160 backend tests + 10 e2e scenarios + 10 pixel-diff fixtures
      passing in CI.
- [ ] `npm run hubspot:backfill` runs cleanly on production data.
- [ ] HTTPS endpoint live at `bsg.workflo.space`.
- [ ] HubSpot Private App webhook subscriptions configured.
- [ ] At least one BSG offer + agreement generated end-to-end and
      verified against existing PDF fixtures.
- [ ] Phase 9 scope documented (note write-back, possible stage
      transitions, outbound rate limit).

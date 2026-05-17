# Phase 8 Implementation Plan

Date: 2026-05-15  (last revised 2026-05-17 — post-Sprint 2.8.F)
Status: **Sprints 1, 2, 2.5, 2.6, 2.7, 2.8 complete. Sprint 3 next.**

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
- `docs/CODEMAPS/{server,frontend}.md` — architectural maps.

---

## Status snapshot (2026-05-17 post-Sprint 4.F)

| Sprint | State | Commits |
|---|---|---|
| 1. Foundation | ✅ DONE | Sprint 1 commits |
| 2. HubSpot reads + backfill | ✅ DONE | Sprint 2 commits |
| 2.5. company_type filter | ✅ DONE | 45db178 |
| 2.6. Fallback to non-primary association | ✅ DONE | 4222194 |
| 2.7. Hardening cycle (A → I) | ✅ DONE | 2890b38..127f8be |
| 2.7 wrap-up docs | ✅ DONE | 31cc088 |
| 2.8. Frontend auth + listings (A → E) | ✅ DONE | 6b9c7a4..c5778fe |
| 2.8.F. Frontend audit closure (F.1 → F.5) | ✅ DONE | 769e5fb..06810f8 |
| 3. Calculator configs CRUD | ✅ DONE | e7acf6d, 91ff6ad |
| 4. Documents + PDF render (A → E + UX revisions) | ✅ DONE | af719ba..444b338 |
| 4.F. Sprint 4 audit closure (F.1 → F.3 + docs F.4) | ✅ DONE | 69d0e9a..0d26e8d |
| 4.E.2. Server-side PDF (shared template module) | ⏳ NEXT | — |
| 5. HubSpot webhooks (inbound) | ⏳ Pending | — |
| 6. Frontend continuation (calc page hydration + wizard URL) | ⏳ Partial — listings + doc view + wizard save DONE | — |
| 7. Docker + Deploy | ⏳ Pending | — |
| 8. Hardening (optional, E2E + CSP) | ⏳ Pending | — |
| 9. HubSpot Note write-back | ⏳ Phase-after-7 | — |

---

## Dependency graph

```
Sprint 1 (Foundation)  ✅ ───┬──→ Sprint 2 (HubSpot reads) ✅ ──┐
                              │                                  │
                              │   ┌─→ Sprint 2.8 (Frontend     │
                              │   │   auth + listings) ✅       │
                              │   │                              │
                              ├──→ Sprint 3 (Calc configs) ⏳ ──┤
                              │                                  │
                              └──→ Sprint 4 (Documents + PDF)⏳─┤
                                                                 ├──→ Sprint 6 (Calc/Doc UI) ──→ Sprint 7 (Docker + Deploy)
                                  Sprint 5 (Webhooks) ⏳ ───────┘
```

The original Sprint 6 (Frontend) was split: auth + listings already
shipped in **2.8** (because the SPA had zero backend integration and
that needed to be validated before backend grew further). The
remaining Sprint 6 work (calc page hydration, document view, wizard
URL-driven seeding, "Save as offer/agreement" flows) waits for
Sprints 3 + 4 backend to land — see Sprint 6 section below for the
narrowed scope.

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

## Sprint 2.8 — Frontend auth + listings (✅ DONE, ~3 days)

**Reason for insertion**: At the end of Sprint 2.7 the SPA had zero
integration with the backend (no fetch / axios calls anywhere in
`src/`). Continuing to Sprint 3 would have grown the contract surface
without ever validating it from a real client. Sprint 2.8 closed that
gap by lifting the auth + listings work from the original Sprint 6
forward.

### Delivered (commits 6b9c7a4 → 06810f8)

1. **API client layer** (`src/api/`)
   - axios singleton with refresh-on-401 single-flight, in-memory
     access token, typed `ApiError`, session-lost callback
   - One file per backend module: `auth.ts`, `companies.ts`,
     `deals.ts`, `hubspot.ts`
   - Mirror types in `types.ts` (validated 1:1 against backend Zod)

2. **AuthProvider + QueryClient** (`src/contexts/AuthContext.tsx`,
   `src/main.tsx`)
   - Cold-boot refresh via httpOnly cookie (StrictMode-safe via ref latch)
   - `useAuth()` hook with `{ user, isBooting, login, logout }`
   - Global TanStack Query defaults (30s stale, 5min gc, retry 1)

3. **LoginPage** (`/login`)
   - react-hook-form + zod schema mirroring backend `loginRequestSchema`
   - Error envelope → human messages per `code`
   - `isBooting` splash; bounces logged-in users to `state.from` or `/companies`

4. **PrivateRoute + AppShell**
   - Layout-route auth gate with boot splash / redirect / outlet
   - IdentityStrip (signed-in name + Sign out) in AppShell
   - Workspace tab "Companies" added (first position)

5. **CompaniesPage** (`/companies`)
   - Debounced search (300ms; q≥2 chars to match backend Zod)
   - Cursor pagination via `useInfiniteQuery` + `<LoadMoreButton />`
   - Loading / error / empty / refreshing states

6. **CompanyDetailPage** (`/companies/:id`)
   - Header dl (segment, lifecycle, HubSpot id, last synced)
   - Deals table with pagination
   - Amount column renders raw `numeric() + currency`

7. **Audit closure 2.8.F (F.1 → F.5)** — 34 findings closed:
   - CRITICAL: `PublicUser` shape diverged from backend; fixed
   - HIGH: StrictMode double-refresh, LoginPage flash, refresh
     single-flight race, axios augmentation (no more `as unknown as`),
     `useInfiniteQuery<…, ApiError, …>` typed errors
   - MED: memoised items, `normaliseSearch` helper, safe fromPath,
     handleLogout try/finally, isFetching indicator, shared
     `formatDate`, `vi.restoreAllMocks` pattern, sessionLost test
   - LOW: PrivateRoute + AppShell tests, `<LoadMoreButton />`,
     constants extraction, JSDoc warnings, dev-proxy cookie note

### Acceptance criteria (met)

- Manual smoke in browser: login → companies list → detail → deals → logout
- 227/227 frontend tests, 128/128 server tests, build clean, 0 vulns
- Backend untouched; integration validated through real network calls

### Carry-over to later sprints

- `/calc/:id` (configurator hydration + autosave) — Sprint 3
- `/documents/:number` (read-only + PDF download) — Sprint 4
- Wizard URL-driven seeding from a config — Sprint 6 (continuation)

---

## Sprint 3 — Calculator configs (~0.5 days)

**Goal**: operator can save and resume calculator drafts. Save is
**EXPLICIT** (no autosave) — operator tunes the calculator, verifies
it, then clicks "Save" and chooses company+deal on the modal.

### Deliverables

1. **Migration** — `0003_calculator_configs.sql`
   - `calculator_configs` table (per `phase_08_backend_plan.md` §3 +
     the pre-Sprint-3 anchor decision in `decisions.md`):

         id                  UUID PK DEFAULT gen_random_uuid()
         company_id          UUID NOT NULL REFERENCES companies(id)
                             ON DELETE CASCADE
         hubspot_deal_id     TEXT NULL REFERENCES deals(hubspot_deal_id)
                             ON DELETE SET NULL
         title               TEXT NULL
         payload             JSONB NOT NULL
         created_by_user_id  UUID NOT NULL REFERENCES users(id)
         created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
         updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()

   - Indexes: `(company_id, hubspot_deal_id, created_at DESC)` —
     supports the wizard Step 1 picker query
     `WHERE company_id = $1 AND (deal_id IS NULL OR deal_id = $2)`.
   - **No UNIQUE constraint** on (company_id, hubspot_deal_id) —
     multiple drafts per deal are allowed (operator can keep what-if
     versions side-by-side).

2. **Calculator-configs module** (`server/modules/calculator-configs/`)
   - `POST /api/v1/calculator-configs` (create new)
     Body: `{ companyId, hubspotDealId?, title?, payload }`
     Returns: `{ id, ...row }`
   - `GET /api/v1/calculator-configs/:id` (load — used by wizard
     Step 1 picker AND by /calc/:id legacy editor if it ever ships).
   - `PUT /api/v1/calculator-configs/:id` (FULL REPLACE — used when
     operator re-saves an existing config; idempotent overwrite).
   - `DELETE /api/v1/calculator-configs/:id` (hard delete).
   - `GET /api/v1/calculator-configs?companyId=&hubspotDealId=&showAll=` (list)
     - Default (showAll=false): filter by `companyId` AND (`deal_id IS NULL OR deal_id = ?`).
     - `showAll=true`: drop the deal filter, show every config for
       that company. Used by the "Show all my configs" link in the
       wizard picker.
     - Returns `CursorPage<PublicCalculatorConfig>` (reuses Sprint
       2.7's `shared/build-page.ts`).
   - **No PATCH** (no autosave → no partial-update endpoint needed).

3. **Auto-name helper** (frontend; backend stores NULL for empty)
   - If operator leaves the title blank on save, frontend renders
     "Untitled · ACME Trading · 17 May 14:32" client-side. Backend
     stores actual NULL so future renames don't fight a stale name.

4. **Validation**
   - `payload` validated via Zod schema mirroring frontend
     `CalculatorSnapshotPayload` (from `src/components/calculator/snapshotShape.ts`).
     Backend re-imports the type and adds runtime check.
   - `companyId` MUST exist in `companies` (FK).
   - `hubspotDealId` MUST belong to `companyId` if both provided
     (cross-company configs rejected as `VALIDATION_FAILED`).

5. **Frontend wire-up (in same Sprint 3)** — minimal save modal
   - "Save calculator" button on the legacy `/calculator` page opens
     a modal: title (optional) + company (typeahead) + deal
     (filtered to selected company, optional).
   - On submit: `POST /api/v1/calculator-configs`, toast on success,
     close modal. Calculator state stays in-memory; no auto-redirect.
   - `useCompanySearch()` hook reuses the listCompanies endpoint
     with debounced `q` (300ms, min 2 chars — patterns from 2.8).
   - **Wizard Step 1 picker lands in Sprint 6** (waits for documents
     module). Sprint 3 only ships the save side.

### Acceptance criteria

- Full CRUD works against live DB.
- Save modal in /calculator successfully POSTs and shows the new
  config in `GET /calculator-configs?companyId=X`.
- Wizard / document save NOT in scope — those are Sprint 4 + 6.
- Updating with a malformed `payload` returns `VALIDATION_FAILED`
  with Zod issues in `details`.
- Cross-company `hubspotDealId` rejected.
- Integration tests: 15 cases (CRUD × happy / auth-fail / validation-fail
  / cross-company-deal / list-with-showAll / cursor pagination).
- Frontend tests: save modal (3-4 cases incl. validation errors,
  success toast).

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

## Sprint 6 — Frontend continuation (~1 day, **narrowed**)

**NOTE** — auth + listings (items 1, 2, 3 from the original Sprint 6
spec) **ALREADY SHIPPED in Sprint 2.8** to validate the API contract
before the backend grew further. The remaining deliverables below
require Sprints 3 + 4 backend to land first.

**Goal**: connect the wizard + document view + addendum flow to the
new backend endpoints. Polish the operator journey end-to-end.

### Done (in Sprint 2.8 — see status snapshot above)

- ~~Auth pages~~ → LoginPage at `/login`, AuthContext, logout in header
- ~~API client~~ → `src/api/` with axios singleton + interceptors
- ~~Listings page~~ → `/companies` + `/companies/:id` (slightly different
  shape from the original "hierarchical accordion" — flat table on the
  list, dedicated detail page on the click-through. Re-evaluate whether
  the accordion still makes sense once we have documents to nest.)

### Remaining deliverables (post-Sprints 3 + 4)

1. **Calc page** — `/calc/:id`
   - Mount loads via `GET /calculator-configs/:id` and hydrates the
     existing wizard's state. Use `applyStatePreset()` on the
     calculator hook.
   - Debounced (1s) `PATCH /calculator-configs/:id` on every change.
     "Saved · Xs ago" indicator in the header.
   - "Save as offer" / "Save as agreement" buttons open an addendum
     modal → `POST /documents` → redirect to `/documents/:number`.
   - Re-use `useDebouncedValue` + the api client patterns from 2.8.

2. **Document view page** — `/documents/:number`
   - Read-only display of payload — render the wizard in view-only
     mode hydrated from `GET /documents/:number`.
   - "Download PDF" button → triggers
     `GET /documents/:number/pdf?download=true` (browser-native download).
   - "Use as template" button → `POST /documents/:number/use-as-template`
     → redirect to `/calc/<new-uuid>`.

3. **Wizard updates**
   - Remove `defaultDraftNumber()` placeholder, use
     `GET /numbering/peek` for the preview number.
   - Remove `window.print()` path, route to `/documents/:number/pdf`.

4. **Listing UX revisit (decision required, see "Plan adjustments" below)**
   - Original spec called for a hierarchical accordion
     (Company → Deals → docs → calcs). Sprint 2.8 shipped a flat table.
     Once we have documents to display, decide:
       (a) Keep flat table + add a documents tab on `/companies/:id`
       (b) Switch to accordion as originally specced
       (c) Hybrid: flat table on list, expandable tree on detail

5. **Toasts / error UX**
   - Today errors render inline on each page. Add a global toast for
     mutations (`POST /documents` etc.) so success/error feedback is
     consistent across the addendum flow.

### Acceptance criteria

- Full operator journey works in dev:
  login → companies → pick company → see deals → "+ new calc" → edit
  (auto-saves) → "Save as offer" → addendum prompt → view doc → download PDF.
- All API errors render via the global toast.
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

# BSG Calculator — Developer Onboarding & Handoff

Single entry point for a developer taking over this codebase. It explains
**what the system is, how each part works, how to run it, and how to operate
it in production.** Deeper references are linked at the end; this document is
the map.

Last updated: 2026-09-14.

> ## The CRM is monday.com — read this first
>
> **monday.com is the only CRM.** Production has run `CRM_PROVIDER=monday`
> since 2026-08-28. The HubSpot account no longer exists (confirmed
> 2026-09-14), so there is **no rollback to HubSpot**; its code
> (`server/modules/hubspot/**`, `src/api/hubspot.ts`) is still in the repo
> but dormant. The code default is still `CRM_PROVIDER=hubspot` (tests rely
> on it), so every deployment sets `CRM_PROVIDER=monday` explicitly (§11).
> Many identifiers still say `hubspot` by design — §10 explains what they
> mean today; UI text says "CRM".
>
> Read in this order:
> 1. [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md) — the operating manual:
>    data in and out, self-healing, health checks, routine operations.
> 2. [`CRM_MIGRATION_RECORD.md`](CRM_MIGRATION_RECORD.md) — the permanent
>    record of the migration: sequence, decisions, what went wrong.
> 3. Historical planning documents, for background only — they describe
>    the transition, when both CRMs were connected:
>    [`monday_migration_plan.md`](monday_migration_plan.md),
>    [`monday_migration_analysis.md`](monday_migration_analysis.md),
>    [`monday_audit_round4.md`](monday_audit_round4.md).
>
> The cutover runbook is deliberately **not in git** (it names production
> hosts and paths). §10 below summarises the integration as it runs today.

---

## 1. What this is

A full-stack internal tool for **BSG** that does two things:

1. **Pricing calculator** — a deterministic, zone-by-zone (Zone 0 → Zone 6)
   pricing engine for payment-processing deals. The math is **frozen** (see
   §3).
2. **Contract / document generator** — a wizard that turns calculator output
   (or a manual blank/defaults) into a **Commercial Offer PDF** (and a
   long-form Agreement/MSA), rendered server-side, with documents persisted,
   numbered (`BSG-#####`), and posted to the CRM (monday.com) as notes.

Around those two cores sits an authenticated back office: users + roles,
opt-in two-factor auth, saved calculators and documents (with soft-delete and
an audit/History trail), and a company/deal sync with monday.com, the CRM
(§10).

## 2. Run it locally (TL;DR)

Requirements: **Node 20** (`.nvmrc`), npm, Docker (for Postgres).

```bash
# 1. Start Postgres (localhost:5433, user/pass bsg/bsg_dev_password)
docker compose -f docker-compose.dev.yml up -d

# 2. Install deps
npm install

# 3. Configure env
cp .env.example .env          # then fill in secrets (see §11)

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

Useful extras: `npm run db:studio` (Drizzle Studio), `npm run monday:backfill`
(load companies, agents and deals from monday.com — set `CRM_PROVIDER=monday`
and `MONDAY_API_TOKEN` first, §11).

Without `MONDAY_API_TOKEN` the dev server logs an ERROR at startup saying
the monday API-version check failed and to fix `MONDAY_API_VERSION`; that
is expected — the token is missing, not the version. With a real token,
the manual Sync button posts real updates onto the live monday cards of
bound rows (`AUTO_SYNC_TO_HUBSPOT=false` in `.env.example` stops only the
automatic posts), so do not press it on real clients' rows.

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
PostgreSQL (Drizzle ORM)     │ TTL refresh on read, scheduled backfill,
                             │ note write-back, inbound webhooks (secret URL)
                             ▼
                        monday.com (the CRM)
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
scripts/                     dev/ops scripts (monday + legacy hubspot inspect, visual-diff)
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
  `server/app.ts`. The legacy HubSpot webhook **raw-body** parser is scoped
  to one exact path; never broaden it (it would shadow JSON parsing for every
  POST). The monday webhook receiver needs no raw-body parser.
- Full reference: [`backend_conventions.md`](backend_conventions.md). Payload
  contracts for snapshots/documents: [`backend_state_schemas.md`](backend_state_schemas.md).
  What the backend recomputes vs trusts from a snapshot:
  [`backend_computation_boundary.md`](backend_computation_boundary.md).

## 7. Database & migrations

- **Postgres** via **Drizzle ORM**. Tables live in `server/db/schema/*.ts`;
  there are 24 SQL migrations in `server/db/migrations/`.
- Core tables: `users`, `refresh_tokens`, `trusted_devices`, `mfa_temp_tokens`,
  `totp_backup_codes`, `user_invites`, `password_resets`, `companies`, `deals`,
  `calculator_configs`, `documents`, `document_number_sequence`,
  `document_events`, `calculator_config_events`, `admin_actions`,
  `crm_notes` (ledger of every CRM note), `monday_webhook_events` (inbound
  webhook queue), `hubspot_webhook_events` (HubSpot era, dormant).
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
- **Session resilience (important):** the access token expires every
  `JWT_ACCESS_EXPIRES` (15m); the client silently refreshes on the next 401.
  A refresh failure ends the session **only on a definitive 401/403**
  (revoked/expired token or disabled account → redirect to `/login`). A
  **transient** failure (5xx / 429 / network — laptop sleep, Wi-Fi blip, a
  redeploy) keeps the session alive and retries on the next request; cold-boot
  retries once. This is deliberate — see `src/api/client.ts` + `AuthContext`.
  (Before 2026-06-10 any transient refresh failure forced a re-login every
  ~15 min — that was the bug fixed here.)
- **Idle logout:** 30 min of no `mousemove`/`keydown`/`click`/`scroll` activity
  → forced logout, with a warning modal ~2 min before. The hook re-evaluates on
  tab re-focus so background-tab timer throttling can't skip the warning
  (`useIdleTimeout` + `IdleTimeoutWarning`).
- **Multi-device:** logging in from two devices creates two independent
  refresh-token rows + cookies; they rotate independently and don't interfere.
  Only password-change / "sign out everywhere" / admin 2FA-force-disable /
  deactivation revoke **all** of a user's sessions at once.
- **RBAC:** roles `user` / `admin` / `super_admin`, enforced by
  `require-auth` + `require-role` middleware.
- **Opt-in TOTP 2FA:** Google-Authenticator-compatible. Enroll → confirm →
  one-time backup codes. Login from an untrusted browser requires a 6-digit
  code; force-disable revokes sessions. Code in `server/modules/auth/two-factor.*`.
- **Invites & password resets:** public token-link flows
  (`/api/v1/auth/invite`, `/api/v1/auth/password-reset`); the raw token *is*
  the credential and any non-pending state returns 404 without leaking why.
- **Inbound CRM webhooks:** monday webhooks carry no signature, so the
  endpoint's credential is the unguessable `MONDAY_WEBHOOK_SECRET` path
  segment — compared in constant time and masked in request logs — and the
  payload is only a trigger: every item is re-read from the monday API
  (§10). The dormant HubSpot receiver verified HMAC v3 over the raw body.
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

## 10. CRM integration (monday.com)

Entirely server-side. **monday.com is the only CRM**; HubSpot is retired and
its account no longer exists. The full operating manual is
[`CRM_INTEGRATION.md`](CRM_INTEGRATION.md) — this section is the map.

Code: `server/modules/monday/**` (client, mapper, backfill, TTL refresh,
webhooks, maintenance) and `server/modules/crm-notes/**` (note write-back
and teardown).

### What `CRM_PROVIDER` governs now

`CRM_PROVIDER` (`hubspot` | `monday`) is still the switch in code: it picks
the client the note writer uses, the webhook processor and maintenance
loops that start at boot, the API that `/ready` probes, where the TTL
refresh reads from, and whether the monday sync may overwrite the display
columns (name, type, lifecycle, segment, stage, "CRM updated") and move
deals to their Company (M). Under the `hubspot` default a monday sync
refreshes only the binding columns and `last_synced_at` of rows it already
has. In practice it has one valid value, **`monday`**. The
code default is still `hubspot` (tests rely on it; changing it is
deferred), so production sets `CRM_PROVIDER=monday` explicitly — and so
must any new environment (§11).

At boot the server asserts the pinned API version
(`MONDAY_API_VERSION=2026-07`) and only then starts the webhook processor
and the maintenance loops; if the assertion fails it logs an ERROR and
neither starts (`server/index.ts`). Boards: Companies `5102466967`, Agents
`5102466950`, Deals `5102466996` (the `MONDAY_BOARD_*` defaults).

### Data in: webhooks

```
monday change → POST /api/v1/monday/webhooks/:secret → monday_webhook_events
              → processor (polls every 5 s, batches of 50) → companies / deals
```

- The endpoint checks the secret, answers monday's registration challenge,
  normalises the event name, dedupes, queues one row and returns 200.
- **The payload is only a trigger:** the processor re-reads the item from
  the monday API with our token. Deletions and archives are confirmed
  against the API too.
- 7 events × 3 boards = 21 webhooks: `create_item`, `change_column_value`,
  `change_name`, `item_deleted`, `item_archived`, `item_restored`,
  `item_moved_to_any_group`. monday *delivers* different names
  (`create_pulse`, `update_column_value`, `update_name`, `delete_pulse`,
  `archive_pulse`, `restore_pulse`, `move_pulse_into_group`);
  `normaliseEventType` in `webhooks/webhooks.schemas.ts` maps them onto
  ours. An unrecognised event on one of our boards is logged at WARN.
- **Retries:** 5 attempts, then the event is marked `failed` and stops. A
  `failed` event is a change that was never applied — the self-healing
  below is what repairs it.
- **Absence is never a deletion.** An item the API does not return is only
  flagged (`crm_missing_since`). A confirmed deletion keeps and flags a
  company that owns documents or calculators and removes one that owns
  nothing; an archive only flags.

### Data out: notes

A note (a monday "update") goes to the **deal card when the document or
calculator is pinned to a deal, otherwise to the company card**. Creating
a document, or saving a calculator for the first time, posts one
automatically when `AUTO_SYNC_TO_HUBSPOT=true` (set in production); later
changes are posted only from the manual Sync button. Entry points:
`server/modules/documents/sync.service.ts` and
`server/modules/calculator-configs/sync.service.ts`, both via
`publishCrmNote` in `crm-notes`.

- Every note is recorded in `crm_notes` with its `provider`. Deleting a
  document or calculator tears down every note in that ledger, not only
  the newest; only notes of the active provider are reachable, so
  HubSpot-era notes are skipped.
- A row not bound to a monday item is refused with an error, never written
  to another CRM.
- Concurrent syncs of one row are serialised (advisory lock → `409
  HUBSPOT_SYNC_IN_PROGRESS`); each deliberate re-sync makes a fresh note.

### Self-healing and health

- **TTL refresh on read** (`monday.refresh.ts`): reading a company or deal
  whose `last_synced_at` is older than `HUBSPOT_SYNC_TTL_SECONDS` (default
  300) schedules a background re-read of that one item. It never acts on
  absence and skips unbound rows.
- **Scheduled backfill** (`monday.maintenance.ts`): every
  `MONDAY_BACKFILL_INTERVAL_HOURS` (default 24; first run
  `MONDAY_BACKFILL_FIRST_DELAY_MINUTES`, default 15, after boot) all three
  boards are re-read, which heals rows nobody opens. `0` disables it and
  logs a WARN. It refuses to flag anything as missing when more than 5% of
  bound rows would be flagged at once.
- **Queue health:** an hourly `[monday:health]` log line — ERROR when
  events have exhausted their retries, WARN when the oldest pending event
  is over 10 minutes old, INFO otherwise.
- **`GET /ready`** reports `checks.monday` and `mondayWebhookQueue`
  (`pending`, `failed`, `oldestPendingAgeSeconds`,
  `lastProcessedAgeSeconds`). The queue is reported but is not part of
  readiness.
- **The boot check gates the background work.** The webhook processor,
  the scheduled backfill and the hourly `[monday:health]` line start only
  after the boot-time API-version check passes, and a failed check is not
  retried until the next restart — so no `[monday:health]` lines at all is
  itself a warning sign (§11).
- **No paging or alerting exists.** Someone has to read the log or `/ready`
  ([`CRM_INTEGRATION.md`](CRM_INTEGRATION.md) §6 explains what bad values
  mean).

### Which company a deal belongs to

A deal belongs to the company in its monday **Company (M)** link, applied
on every sync — webhook, TTL refresh and backfill — with three guards:

- only a **primary** bound company is accepted;
- an empty or unbound link leaves the deal where it is;
- a deal already under any row bound to the same monday card (including
  the alias half of a duplicate pair) is not moved.

A new deal whose link names no primary bound company is skipped, with a
WARN, until that company exists.

> **Fixed 2026-09-14.** The deal's company (commit `a84d653`) and the two
> sync timestamps below (commit `4aeb134`) used to be written only when a
> row was first inserted — the UPDATE branch forgot them. Three deals
> imported during the migration sat under their referring agents and were
> invisible in the wizard for their merchants, and every bound row looked
> permanently stale. When changing the upserts in `monday.backfill.ts`,
> compare the INSERT and UPDATE branches field by field.

### What the fields mean today

Many identifiers keep their HubSpot-era names by design; renaming the
schema and the wire contract is deliberately deferred.

| Name | Meaning today |
|---|---|
| `companies.hubspot_company_id` | The company's natural key. Companies created from monday carry a synthetic key `mon:<itemId>`. |
| `deals.hubspot_company_id` | The deal → company foreign key (set by the rule above). |
| `crm_item_id`, `crm_board_id` | The monday item and board a row is bound to. |
| `companies.crm_binding_role` | `primary` or `alias`. When two of our rows are bound to one monday card, only the primary is a deal target. |
| `deals.crm_company_item_id` | The deal's Company (M) link (a monday item id). |
| `hubspot_modified_at` | Shown in the UI as **"CRM updated"**: the monday item's `updated_at`, written on every sync (the previous value is kept if monday sends none). |
| `last_synced_at` | Advanced on every sync; drives the TTL refresh and the "Last synced" line on the company page. |
| `crm_missing_since`, `crm_deleted_at` | The API stopped returning the item (an observation only) / the item was confirmed deleted or archived in monday. |
| `hubspotSyncState`, `hubspotNoteId`, `synced_to_hubspot`, `HUBSPOT_UNREACHABLE`, `HUBSPOT_SYNC_IN_PROGRESS` | Legacy names for the CRM note-sync state, note id, event type and error codes — they apply to monday. UI text says "CRM". |
| `/api/v1/hubspot/*` | Routes of the dormant HubSpot module (pipelines, HubSpot webhooks, refresh). The SPA does not call them. |
| `HUBSPOT_SYNC_TTL_SECONDS`, `AUTO_SYNC_TO_HUBSPOT` | Legacy-named env vars still used by the monday integration (§11). |

### Useful commands

```bash
npm run monday:drift      # read-only: have the boards/columns drifted? Run before structural board changes
npm run monday:backfill   # re-read all three boards; idempotent, safe any time
docker compose exec -T app npm run monday:backfill   # the same, inside the production container
```

- **Registering webhooks** (a new environment, or after rotating
  `MONDAY_WEBHOOK_SECRET`): call monday's `create_webhook` GraphQL mutation
  for each of the 7 events on each of the 3 boards, against
  `<APP_PUBLIC_URL>/api/v1/monday/webhooks/<MONDAY_WEBHOOK_SECRET>`. The
  app must already be running with that secret: monday sends a challenge
  and refuses to register an endpoint that does not answer it. After
  rotating the secret, first delete our 21 webhooks, which still point at
  the old URL (list them with the query in
  [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md) §6), then register the new
  set. The boards also carry four pre-existing
  `change_specific_column_value` webhooks that are not ours — do not
  delete them.
- `server/scripts/monday-remap.ts` was the one-time tool that bound the
  legacy (HubSpot-era) rows to monday items. A fresh install does not need
  it.
- Container form of the drift check, token/secret rotation and the query
  that lists registered webhooks: [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md)
  §6 and §8.

### HubSpot era (retired)

Until 2026-08-28 HubSpot was the CRM (TTL-cached reads, HMAC-v3-signed
webhooks, Notes associated to the company/deal, merges folded by webhook
and by `reconcile-companies.ts`). The account no longer exists, so there is
no rollback. The code — `server/modules/hubspot/**`, `src/api/hubspot.ts`,
the `npm run hubspot:*` scripts, `server/scripts/reconcile-companies.ts` —
is dormant: no HubSpot background work starts unless
`CRM_PROVIDER=hubspot`. monday deals carry no amount, currency or business
vertical (of a deal's business fields the monday sync writes only name,
stage and company), so those columns keep their HubSpot-era values and are
empty on monday-native deals. HubSpot-era docs, for history only:
[`bsg_hubspot_field_mapping.md`](bsg_hubspot_field_mapping.md),
[`client_and_hubspot_workflow.md`](client_and_hubspot_workflow.md),
[`hubspot_api_reference.md`](hubspot_api_reference.md), and the HubSpot
section of [`integrations.md`](integrations.md).

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
| CRM (monday) | `CRM_PROVIDER` (set `monday` explicitly), `MONDAY_API_TOKEN`, `MONDAY_WEBHOOK_SECRET`, `MONDAY_API_BASE_URL`, `MONDAY_API_VERSION`, `MONDAY_BOARD_COMPANIES` / `_AGENTS` / `_DEALS`, `MONDAY_BACKFILL_INTERVAL_HOURS` (default 24, `0` disables), `MONDAY_BACKFILL_FIRST_DELAY_MINUTES` (default 15) |
| CRM, legacy names (still used) | `HUBSPOT_SYNC_TTL_SECONDS` (TTL refresh, default 300), `AUTO_SYNC_TO_HUBSPOT` (auto-posts notes to the active CRM; `true` in production) |
| HubSpot (dormant) | `HUBSPOT_API_TOKEN`, `HUBSPOT_WEBHOOK_SECRET`, `HUBSPOT_API_BASE_URL`, `HUBSPOT_AUTO_BACKFILL`, … — not required when `CRM_PROVIDER=monday` |
| PDF | `PUPPETEER_EXECUTABLE_PATH`, `PUPPETEER_HEADLESS`, `PDF_RENDER_TIMEOUT_MS`, `PUPPETEER_RENDERS_PER_BROWSER`, `PUPPETEER_BROWSER_TTL_MS` |
| Misc | `DOCUMENT_NUMBER_START`, `LOG_LEVEL`, `LOG_HTTP_REQUESTS`, `FRONTEND_ORIGIN`, `SPA_DIST_DIR` |

**CRM variables (monday mode).** `CRM_PROVIDER=monday` must be set
explicitly: the code default is still `hubspot` (tests rely on it), so
check that the real `.env` says `monday` — never rely on the default. With
`NODE_ENV=production` and `CRM_PROVIDER=monday`, `server/config/env.ts`
refuses to boot unless:

- `MONDAY_API_TOKEN` is set;
- `MONDAY_WEBHOOK_SECRET` is set and at least 16 characters (e.g.
  `openssl rand -hex 24`). It is part of the webhook URL, so treat it — and
  that URL — as a secret;
- `MONDAY_API_BASE_URL` is exactly `https://api.monday.com/v2`;
- `MONDAY_BOARD_COMPANIES` / `_AGENTS` / `_DEALS` are three different ids
  (the defaults are the real boards).

Keep `MONDAY_API_VERSION=2026-07`: it is asserted at boot with a live
call to monday. If that check fails for any reason — a version mismatch,
monday unreachable or slow, a missing or rejected token — the app keeps
serving, but the webhook processor, the scheduled backfill and the hourly
`[monday:health]` line do not start, and nothing retries until the next
restart. The signs: an ERROR at boot (`[startup] monday API version
assertion FAILED`), no `[monday:health]` lines, and
`mondayWebhookQueue.pending` / `oldestPendingAgeSeconds` growing on
`/ready` (whose `checks.monday` is a separate probe and can still say
`ok`). Restart `app` once monday is reachable.

The HubSpot gates apply only when `CRM_PROVIDER=hubspot`, so
`HUBSPOT_API_TOKEN` and `HUBSPOT_WEBHOOK_SECRET` are not required — but
leave `HUBSPOT_API_TOKEN` empty or unset: any non-empty value must still
start with `pat-` or boot fails. Keep `AUTO_SYNC_TO_HUBSPOT=true` in production
(code default `false`), or notes are posted only from the manual Sync
button.

> ⚠️ **Production config to verify:** the committed templates set
> `JWT_REFRESH_EXPIRES=12h` (the intended security-hardened value), but check
> the **live** `.env.production` on the server — if it still says `30d`,
> refresh sessions live 30 days instead of 12 hours. Align it before relying
> on the short-session guarantee. See §14.

## 12. Testing & verification

```bash
npm run verify        # typecheck + lint + frontend tests + build (the gate)
npm run test          # frontend unit/integration (vitest, jsdom)
CRM_PROVIDER=hubspot npm run test:server   # backend integration (vitest, node) — needs Postgres up; prefix explained below
npm run typecheck:server
```

- **Frontend:** ~408 tests (vitest + Testing Library). UI integration tests
  render the full provider stack.
- **Backend:** ~457 tests (vitest + supertest against a **real** Postgres test
  DB `bsg_calculator_test`, auto-created and migrated by
  `server/tests/setup.ts`; runs sequentially, `fileParallelism: false`).
  `.env.example` leaves `CRM_PROVIDER` commented out, because part of the
  suite assumes the code default and the env loader also reads `.env`. If
  your local `.env` sets `CRM_PROVIDER=monday`, run them as
  `CRM_PROVIDER=hubspot npm run test:server` (a shell variable wins over `.env`).
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
- Full runbook (build, env upload, compose, rollback):
  [`deployment.md`](deployment.md). The short form of the current release
  procedure — rsync from a clean checkout, sha256 manifest check,
  `docker compose up -d --no-deps app`, never `docker compose down` — is in
  [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md) §8.
- **CRM operations** (queue health, `/ready`, backfill, drift check,
  token/secret rotation, registering webhooks): §10 and
  [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md) §6 and §8.

## 14. Production-readiness status (as of 2026-06-08)

> Snapshot from 2026-06-08, before the monday migration. Since then the
> inbound CRM webhooks have become secret-path monday webhooks (§8) and
> the test suites have grown (current counts in §12).

**Green:** `npm run verify` passes (typecheck, lint, 397 frontend tests,
build); server typecheck + 401 server tests pass; no secrets tracked in git;
strong security posture (helmet/CSP, rate limits, RBAC, 2FA, authenticated
webhooks, SSRF defence, bcrypt). Single-container deploy with health checks + CI.

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
- **Create a user:** `npm run create-user`. **Refresh CRM data:**
  `npm run monday:backfill` (safe any time, §10).
- **Touch the calculator:** don't, unless explicitly approved (§3).

## 16. Where to read more

Start here, then go deep:

- [`architecture.md`](architecture.md) — module map + data flows.
- [`backend_conventions.md`](backend_conventions.md) — server patterns.
- [`calculator_logic_and_formulas.md`](calculator_logic_and_formulas.md) — frozen calculator math.
- [`deployment.md`](deployment.md) — production runbook.
- [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md) — CRM (monday.com) operating manual.
- [`CRM_MIGRATION_RECORD.md`](CRM_MIGRATION_RECORD.md) — permanent record of the HubSpot → monday.com migration.
- [`integrations.md`](integrations.md) — third-party integrations summary (CRM, Puppeteer, Traefik, …); its HubSpot section is historical.
- [`decisions.md`](decisions.md) — full chronological "why" log for past decisions.
- [`CODEMAPS/`](CODEMAPS/) — deeper per-tree code maps.
- [`archive/`](archive/) — historical phase plans + dated audits (context only).
- [`monday_migration_plan.md`](monday_migration_plan.md), [`monday_migration_analysis.md`](monday_migration_analysis.md), [`monday_audit_round4.md`](monday_audit_round4.md) — historical CRM migration planning (context only).
- `README.md` (repo root) — quick start + the full documentation map.
- `AGENTS.md` (repo root) — operating standard + the hard project rules.

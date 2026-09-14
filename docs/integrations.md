# Integrations

Last updated: 2026-09-14 (CRM sections). The Puppeteer, reverse-proxy,
clipboard and DOCX sections were last reviewed on 2026-06-10.

> **CRM era note (2026-09-14).** monday.com is the only CRM. Production has
> run `CRM_PROVIDER=monday` since the 2026-08-28 cutover; HubSpot was
> retired on 2026-08-31 and the account no longer exists, so there is no
> rollback to it. Operating manual: [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md).
> Permanent record of the migration:
> [`CRM_MIGRATION_RECORD.md`](CRM_MIGRATION_RECORD.md). The planning
> documents ([`monday_migration_plan.md`](monday_migration_plan.md),
> [`monday_migration_analysis.md`](monday_migration_analysis.md),
> [`monday_audit_round4.md`](monday_audit_round4.md)) are historical.

## monday.com CRM (live)

The SPA never talks to monday directly — all reads and writes go through
the backend and its `/api/v1/*` endpoints.

- **Code:** `server/modules/monday/**` (GraphQL client, column resolution
  and cache, mapper, backfill, TTL refresh, maintenance, `webhooks/`),
  `server/modules/crm-notes/**` (note publishing + the `crm_notes` ledger),
  and `server/modules/{documents,calculator-configs}/sync.service.ts`.
- **Switch:** `CRM_PROVIDER=monday`. The code default in
  `server/config/env.ts` is still `hubspot` (changing it is a deferred code
  change — tests rely on it), so **every deployment must set
  `CRM_PROVIDER=monday` explicitly**.
- **Boards:** Companies `5102466967` · Agents `5102466950` · Deals
  `5102466996`. The API version is pinned to `2026-07` and asserted at
  boot; if the assertion fails, the webhook processor and the maintenance
  loop are not started and an error is logged.

### Reads (webhooks + self-healing)

- **Inbound webhooks:** `POST /api/v1/monday/webhooks/:secret` → queue
  table `monday_webhook_events` → a processor that polls every 5s. The
  payload is only a trigger: the item is always re-read from the API with
  our own token. Retries: 5 attempts, then the event is marked `failed`.
- **Events:** 7 events × 3 boards = 21 webhooks — `create_item`,
  `change_column_value`, `change_name`, `item_deleted`, `item_archived`,
  `item_restored`, `item_moved_to_any_group`. monday *delivers* different
  names (`create_pulse`, `update_name`, `update_column_value`,
  `delete_pulse`, `archive_pulse`, `restore_pulse`,
  `move_pulse_into_group`); `normaliseEventType` maps them onto ours.
- **Deletion:** a company deleted in monday is removed locally only if it
  owns no documents or calculators; otherwise it is kept and flagged
  (`crm_deleted_at`). An archived item is only ever flagged.
- **TTL refresh on read:** opening a single company or deal
  (`GET /api/v1/companies/:id` or `GET /api/v1/deals/:id`) whose
  `last_synced_at` is older than `HUBSPOT_SYNC_TTL_SECONDS` (default 300)
  schedules a background re-read of that one item
  (`server/modules/monday/monday.refresh.ts`). Listing the deals of a
  company (`GET /api/v1/companies/:id/deals`) refreshes that company
  too; list endpoints never refresh the rows they list. The refresh
  skips unbound rows and never acts on absence.
- **Scheduled backfill:** every `MONDAY_BACKFILL_INTERVAL_HOURS` (default
  24; first run `MONDAY_BACKFILL_FIRST_DELAY_MINUTES` = 15 minutes after
  boot; `0` disables it and logs a WARN). It never deletes — rows missing
  from a board are flagged, and a pass that would flag more than 5% of
  bound rows aborts.
- **Deal → company:** a deal belongs to the company in its "Company (M)"
  link, applied on every sync (since 2026-09-14). Only a primary bound
  company is accepted; an empty or unbound link leaves the deal where it
  is; a deal already under any row bound to that monday card (including
  the alias half of a duplicate pair) is not moved.
- **Visibility:** an hourly `[monday:health]` log line (ERROR when events
  exhausted their retries, WARN when the oldest pending event is over 10
  minutes old, INFO otherwise) and `GET /ready` (`checks.monday` plus
  `mondayWebhookQueue`; the queue is reported but is not part of
  readiness). There is no paging or alerting.

### Writes (note write-back)

- Saving a document or calculator posts a note (a monday "update") to the
  deal card when the record is pinned to a deal, otherwise to the company
  card. Auto-posting on create is gated by `AUTO_SYNC_TO_HUBSPOT` — a
  legacy name: it posts to the active CRM. The code default is `false`, so
  production must set `AUTO_SYNC_TO_HUBSPOT=true` explicitly (as
  `.env.production.example` does). The manual Sync / Retry buttons remain
  the operator's retry path.
- Every note is recorded in `crm_notes` with its provider. A manual
  re-sync creates a fresh note; a second concurrent sync of the same
  record is refused (`HUBSPOT_SYNC_IN_PROGRESS`) instead of creating a
  duplicate. Deleting a document or calculator tears down the ledgered
  notes held by the active CRM; HubSpot-era notes are not reachable and
  are left alone.
- A row that is not bound to a monday item cannot sync — the backend
  refuses rather than writing the note anywhere else. The error text
  still says "run the remap before syncing it"; that is stale code text —
  the remap was the one-time migration tool (see Operations below).
  [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md) §9 lists the known unbound
  rows but has no procedure for binding one.

### Configuration

- `CRM_PROVIDER=monday` — set explicitly (see above).
- `MONDAY_API_TOKEN` — required in production.
- `MONDAY_WEBHOOK_SECRET` — required in production, at least 16 characters
  (e.g. `openssl rand -hex 24`). It is part of the webhook URL, so treat
  it as a secret. If it is unset, the webhook route answers 404.
- `MONDAY_API_BASE_URL` — must be exactly `https://api.monday.com/v2` in
  production (SSRF guard). `MONDAY_API_VERSION=2026-07`.
- `MONDAY_BOARD_COMPANIES` / `MONDAY_BOARD_AGENTS` / `MONDAY_BOARD_DEALS` —
  the defaults are the real boards; in production the three must be
  distinct.
- `MONDAY_BACKFILL_INTERVAL_HOURS`, `MONDAY_BACKFILL_FIRST_DELAY_MINUTES`.
- Legacy-named but still used: `HUBSPOT_SYNC_TTL_SECONDS` (TTL for the
  monday refresh, default 300) and `AUTO_SYNC_TO_HUBSPOT` (code default
  `false`; production must set it to `true` explicitly — see above).
- HubSpot-only variables (`HUBSPOT_API_TOKEN`, `HUBSPOT_WEBHOOK_SECRET`,
  `HUBSPOT_API_BASE_URL`, …) are required in production only when
  `CRM_PROVIDER=hubspot`; with `monday` they are not required. Their
  format checks still apply in every mode, though: leave
  `HUBSPOT_API_TOKEN` empty or unset — if it is set at all it must start
  with `pat-`, otherwise the app refuses to boot — and
  `HUBSPOT_API_BASE_URL`, if set, must be a valid URL.

### Operations

- `npm run monday:drift` — read-only check of the boards and columns; run
  it before any structural board change.
- `npm run monday:backfill` — idempotent, safe any time. Inside the
  container: `docker compose exec -T app npm run monday:backfill`.
- **Registering webhooks:** use the `create_webhook` GraphQL mutation
  against `<APP_PUBLIC_URL>/api/v1/monday/webhooks/<MONDAY_WEBHOOK_SECRET>`.
  The app must already be running with the secret, because monday sends a
  challenge and refuses to register an endpoint that does not answer it.
  Four pre-existing `change_specific_column_value` webhooks on the boards
  are not ours — do not delete them.
- `server/scripts/monday-remap.ts` was the one-time legacy-data migration
  tool; a fresh install does not need it.
- Deploys: see [`deployment.md`](deployment.md) and
  [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md).

### Legacy names (kept by design)

Renaming the wire contract and the DB vocabulary is deferred, so several
identifiers still say "hubspot":

| Name | What it means today |
|---|---|
| `companies.hubspot_company_id` | The company natural key. `deals.hubspot_company_id` is the deal → company FK. Companies created from monday carry synthetic keys `mon:<itemId>`. |
| `hubspot_modified_at` | Shown in the UI as "CRM updated": the monday item's `updated_at`, written on every sync (since 2026-09-14). |
| `last_synced_at` | Advanced on every sync (since 2026-09-14); drives the TTL refresh and the "Last synced" line on the company page. |
| `crm_item_id` / `crm_board_id` / `crm_binding_role` (`primary` \| `alias`) | The monday binding. `deals.crm_company_item_id` is the deal's "Company (M)" link. |
| `hubspotSyncState`, `hubspotNoteId`, `HUBSPOT_UNREACHABLE`, `HUBSPOT_SYNC_IN_PROGRESS`, `synced_to_hubspot` | Legacy names for the CRM sync state, the latest note id, the error codes and the history event. User-facing text says "CRM", with a few leftovers — e.g. the "HubSpot sync" column header on the Documents and Calculators lists and the delete-company modal text; full list in [CODEMAPS/frontend.md](CODEMAPS/frontend.md#crm-naming-in-the-spa). |

## HubSpot (retired 2026-08-31)

HubSpot was the CRM until the 2026-08-28 cutover and was switched off on
2026-08-31. The account no longer exists (confirmed 2026-09-14): there is
no rollback and no fallback to it. The code is still in the repo but
dormant — `server/modules/hubspot/**` and `src/api/hubspot.ts`. Its
webhook processor and startup backfill start only when
`CRM_PROVIDER=hubspot`; the `/api/v1/hubspot/*` routes are still mounted
but unused; `server/scripts/hubspot-backfill.ts` and
`server/scripts/reconcile-companies.ts` refuse to run while
`CRM_PROVIDER` is not `hubspot`, unless forced with
`--force-hubspot-era`. That flag was meant for a HubSpot rollback, which
is no longer possible (the account no longer exists), so do not use it —
the scripts' error text still mentions rolling back. Do not build on this
code.
[`bsg_hubspot_field_mapping.md`](bsg_hubspot_field_mapping.md) and
[`hubspot_api_reference.md`](hubspot_api_reference.md) are HubSpot-era
references; this file's earlier description of the HubSpot integration is
in git history.

## Puppeteer (server-side PDF rendering)

- **Code:** `server/modules/pdf/**` (browser pool + render service).
- OFFER (and AGREEMENT) PDFs are rendered server-side from the shared HTML
  builder (`src/components/document-wizard/buildOfferPdfHtml.ts`, included
  into the server build via `tsconfig.server.json`). Puppeteer loads the
  HTML with `setContent` (no HTTP round-trip), so the app CSP does not
  apply to PDF output.
- A pooled browser is reused across renders and recycled by count/TTL
  (`PUPPETEER_RENDERS_PER_BROWSER`, `PUPPETEER_BROWSER_TTL_MS`); render
  timeout via `PDF_RENDER_TIMEOUT_MS`. `PUPPETEER_EXECUTABLE_PATH` /
  `PUPPETEER_HEADLESS` configure the Chromium binary in the container.
- Endpoints: `POST /api/v1/pdf/preview` (live wizard preview, rate-limited)
  and `GET /api/v1/documents/:number/pdf` (persisted document).

## Traefik / Coolify (reverse proxy + TLS)

- Public routing and TLS termination for the single application container.
- The container runs Express, which serves both the `/api/v1/*` API **and**
  the built SPA (`server/app.ts`). There is no separate nginx.
- Health probe: `GET /health` (mounted at the root, no rate limit, no auth).
- Env: `APP_DOMAIN`, `TRAEFIK_NETWORK`, `TRAEFIK_ENTRYPOINT`, `TRAEFIK_TLS`,
  `TRAEFIK_CERTRESOLVER`, `TRUST_PROXY_HOPS`.

## Browser Clipboard API

- Purpose: Zone 6 "Copy to Clipboard" action (`navigator.clipboard.writeText`).
- Failure handling: UI falls back to a "copy manually from preview" message.
- Depends on the browser permission model and a secure context.

## DOCX export (out of scope)

`technical_specification_bsg.docx` §9.1 mentions DOCX export. It is **not**
implemented and not currently planned — PDF is the only generated format.

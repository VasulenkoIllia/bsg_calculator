# HubSpot → monday.com migration: code inventory + feasibility analysis

Date: 2026-08-22. Status: **analysis only — no code changes made.**
Scope: (1) where HubSpot sync lives in this repo and how it is wired,
(2) what a move to monday.com would require, (3) risks, decisions and effort.

---

## 1. What the HubSpot integration actually is today

Roughly **~4 000 lines of HubSpot-specific server code across ~30 files**,
plus ~25 frontend files that reference HubSpot in types, badges, buttons and
copy. It is not one client module — it is five distinct subsystems.

### 1.1 Configuration (`server/config/env.ts`, `.env*`)

| Var | Default | Role |
|---|---|---|
| `HUBSPOT_API_TOKEN` | — | Private App token (`pat-…`). **Required in prod** (env superRefine). |
| `HUBSPOT_API_BASE_URL` | `https://api.hubapi.com` | SSRF guard: in prod must be exactly this value. |
| `HUBSPOT_WEBHOOK_SECRET` | — | HMAC v3 secret. **Required in prod.** |
| `HUBSPOT_SYNC_TTL_SECONDS` | 300 | TTL for background refresh of a cached row. |
| `HUBSPOT_COMPANY_TYPE_FILTER` | `direct_client` | Only these companies are cached. |
| `HUBSPOT_BACKFILL_PAGE_SIZE` | 100 | Pagination page size. |
| `HUBSPOT_AUTO_BACKFILL` | false | Run backfill on boot when `companies` is empty. |
| `AUTO_SYNC_TO_HUBSPOT` | false | Fire-and-forget Note write-back on document/calc create. Legacy alias `AUTO_SYNC_DOCUMENTS_TO_HUBSPOT` is remapped at boot. |
| `HUBSPOT_DEAL_PIPELINE_ID` | — | Optional pinned pipeline. |
| `APP_PUBLIC_URL` | — | Used **twice**: link inside the Note body, and as the trusted URI base for webhook HMAC verification. |

### 1.2 API client + types + mapper (`server/modules/hubspot/`)

- `hubspot.client.ts` (537 lines) — REST v3/v4 over `fetch`, Bearer auth,
  singleton. Retry policy: 429 → honour `Retry-After`; 5xx + network →
  exponential backoff; **all 4xx → immediate `HubspotUnreachableError`**
  carrying `details.status`; 401 logged as `HUBSPOT_TOKEN_INVALID`.
  Methods: `listCompanies`, `searchCompaniesByType`, `getCompany`,
  `listDeals`, `getDeal`, `listPipelineStages`, `createNote` (**explicit
  `maxRetries: 0` — POST /notes is not idempotent**), `updateNote`,
  `associateNoteWith` (v4 default association), `deleteNote` (404 = OK).
  Helper `isHubspotNotFound(err)` — "gone upstream" is detected by
  `status === 404`, not by error class.
- `hubspot.types.ts` — Zod schemas + the explicit property lists
  (`COMPANY_PROPERTIES` 21 props, `DEAL_PROPERTIES` ~40 props) because
  HubSpot returns a 6-property default otherwise. `softValidate()` logs
  drift and falls through to a cast instead of throwing.
- `hubspot.mapper.ts` — `mapHubspotCompanyToRow`, `mapHubspotDealToRow`,
  `parseTimestamp` (epoch-s / epoch-ms / ISO), and
  `extractDealCompanyCandidates()` — the primary-association-first,
  secondary-association-fallback resolver (the "WORLDFY OY" case).
- `hubspot.service.ts` — pipelines cache (1 h TTL + in-flight dedupe),
  exposed as `GET /api/v1/hubspot/pipelines`.

### 1.3 Inbound webhooks (`server/modules/hubspot/webhooks/` + middleware)

- `app.ts` mounts `express.raw({type:"*/*"})` on the **exact** path
  `/api/v1/hubspot/webhooks` before the JSON parser.
- `middleware/verify-hubspot-signature.ts` — HMAC SHA-256 v3 over
  `method + URI + rawBody + timestamp`, URI rebuilt from `APP_PUBLIC_URL`
  (not from proxy headers), ±5 min replay window, `timingSafeEqual`.
- `webhooks.controller.ts` — validates the batch, writes rows into
  `hubspot_webhook_events` (idempotency by `hubspot_event_id`), clamps the
  stored payload at 64 KB, always ACKs 200. Also hosts
  `POST /api/v1/hubspot/refresh` (max 20 company UUIDs, Bearer auth).
- `webhooks.schemas.ts` — 12 subscription types
  (`creation`/`propertyChange`/`deletion`/`merge`/`restore`/`associationChange`
  × company/deal). One unmodeled type would drop the whole batch, hence the
  exhaustive list. `readMergeIds()` re-parses merge participants from `raw`.
- `webhooks.processor.ts` — self-rescheduling `setTimeout` loop (5 s,
  batch 50, `MAX_ATTEMPTS = 5`), single-replica-safe. Handles deletion,
  merge, creation/propertyChange (fetch → filter → upsert), 404-during-fetch
  → treat as deletion, **merged-alias self-heal** (a 200 whose `id` differs
  from the requested id means the id was merged away), and a
  3-consecutive-401 circuit breaker.

### 1.4 Cache lifecycle: TTL refresh, merge, deletion, reconcile

- `server/shared/ttl-refresh.ts` + `companies.service.scheduleTtlRefresh` +
  `deals.service.scheduleTtlRefresh` — every `GET` of a stale row schedules a
  background refetch (`setImmediate`); deals re-run `resolveDealCompany()`.
- `companies.merge.service.ts` — `handleCompanyMerge` re-points documents +
  calc-configs + deals from the merged-away company onto the survivor in one
  transaction (order matters: RESTRICT vs CASCADE), then deletes the alias.
- `deleteOrMarkCompany()` — a company owning documents is never deleted; it is
  stamped `hubspot_deleted_at` ("Deleted in HubSpot" badge) and Note-sync is
  refused for it.
- `server/scripts/reconcile-companies.ts` — operator drift tool
  (`--fix-merged`, `--prune-empty`, `--repoint`, `--mark`, `--purge`).
- `server/scripts/hubspot-backfill.ts` (411 lines) — cleanup pass (drop rows
  not matching the type filter) → companies via Search API → deals with the
  candidate fallback; `backendStartupBackfillIfEmpty()` is called from
  `server/index.ts`; CLI via `npm run hubspot:backfill`.
- Four exploration scripts in `scripts/`: `hubspot-inspect`, `hubspot-one-company`,
  `hubspot-merchant-and-deal`, `hubspot-enums`.

### 1.5 Write-back (Notes)

- `server/shared/hubspot/note-builder.ts` — HTML one-liner
  `"<Type> <id> // Company: <name> // Created <dd.MM.yyyy, HH:mm> by <user> (<email>)"`
  + a second `<p>` with a clickable `Link` built from `APP_PUBLIC_URL`.
- `documents/sync.service.ts` (350 lines) and
  `calculator-configs/sync.service.ts` (279 lines) — identical shape:
  `pg_try_advisory_xact_lock` (409 `HUBSPOT_SYNC_IN_PROGRESS` on contention)
  → precheck (`deletedAt`, `isConfigured`, `company.hubspotDeletedAt`) →
  `createNote` → `associateNoteWith` (deal if pinned, else company) →
  persist `hubspot_note_id` + `hubspot_sync_state` → write a
  `synced_to_hubspot` / `sync_failed` event.
- Deletion tear-down lives in `documents.service.deleteDocument` and
  `calculator-configs.service` — `delete_pending` → `hubspot.deleteNote` →
  `delete_failed` on error, with the row kept alive for retry.

### 1.6 Database coupling (`server/db/schema/`)

- `companies` — `hubspot_company_id` is the **natural key** (UNIQUE, FK
  target), plus `hubspot_raw` JSONB, `hubspot_created_at`,
  `hubspot_modified_at`, `last_synced_at`, `hubspot_deleted_at`.
- `deals` — `hubspot_deal_id` natural key; FK
  `deals.hubspot_company_id → companies.hubspot_company_id`
  **`ON DELETE RESTRICT ON UPDATE CASCADE`**.
- `documents` / `calculator_configs` — `hubspot_deal_id` FK →
  `deals.hubspot_deal_id` **`ON DELETE SET NULL ON UPDATE NO ACTION`**,
  `hubspot_note_id`, `hubspot_sync_state` ∈ {`not_synced`, `synced`,
  `failed`, `delete_pending`, `delete_failed`} (CHECK constraint).
- `hubspot_webhook_events` — inbound queue with status/outcome CHECKs and a
  partial index on pending rows.
- `document_events` / `calc_config_events` — CHECK includes
  `synced_to_hubspot`, `sync_failed`. `admin_actions` includes
  `document.synced`, `calc.synced`.
- **Business coupling:** `documents/numbering.service.ts` builds
  `BSG-<7-digit seq>-<last 6 digits of hubspot_company_id>`. The document
  number literally embeds the CRM id.

### 1.7 Frontend (`src/`)

Read-only consumer — the SPA never talks to HubSpot directly.
`src/api/hubspot.ts` (pipelines), HubSpot fields across `src/api/types.ts`,
`HubspotSyncBadge`, `HubspotDeletedBadge`, sync buttons + re-sync confirm on
`DocumentViewPage` / `CalculatorPage` / `CalculatorStickyToolbar`, delete
modals (`hasHubspotNote`, `HUBSPOT_UNREACHABLE`), `shared/hubspotSyncPoll.ts`
(badge-lag polling after create), deal pickers (`WizardBackendBar`,
`SaveCalculatorModal`), company pages, `EventHistoryPanel` / `LastActionCell`
labels.

### 1.8 Tests + docs

Tests: `hubspot-webhooks.integration.test.ts`,
`reconcile-companies.integration.test.ts`, `companies-deals`,
`documents(-delete)`, `calculator-configs`, `events`, `admin-actions`, plus
unit tests for client / mapper / note-builder.
Docs: `hubspot_api_reference.md` (1 116 lines), `bsg_hubspot_field_mapping.md`
(299), `client_and_hubspot_workflow.md` (262), `integrations.md`,
`decisions.md`, both CODEMAPS.

---

## 2. monday.com: the platform model and what maps to what

monday is **not a CRM object API** — it is a board/item API. Everything is
`account → workspace → board → group → item (+ subitems) → column_values`,
served by **one GraphQL endpoint** `https://api.monday.com/v2`, versioned via
an `API-Version` header (year-month, e.g. `2026-07`; quarterly RC → current →
maintenance cycle, ≥6 months stable). monday CRM ("monday sales CRM") is a
bundle of pre-made boards — Leads / Contacts / Accounts / Deals / Activities —
linked by *connect boards* (board-relation) columns, plus the
Emails & Activities (E&A) app.

| Today (HubSpot) | monday equivalent | Comment |
|---|---|---|
| Company object | Item on the Accounts (or Companies) board | Needs `board_id` + `item_id` |
| Deal object | Item on the Deals board | |
| `hs_primary_associated_company` | `connect_boards` column value | **No "primary" concept** — a linked-items array |
| Company/deal properties | `column_values` (typed, board-scoped ids) | Column ids like `status`, `status_1`, `text8` are per-board |
| `company_type = direct_client` filter | `items_page(query_params: {rules:[…]})` or simply a separate board | max 500/page, cursor paging, `query_params` and `cursor` are mutually exclusive |
| `GET /crm/v3/objects/companies/{id}` | `items(ids:[…]) { … }` | Missing item → `null`/GraphQL error, **not HTTP 404** |
| Search API by property | `items_page_by_column_values` / `items_page` rules | |
| `/crm/v3/pipelines/deals` | Status column `settings_str` on the Deals board | Same cache pattern still applies |
| Note (`POST /crm/v3/objects/notes` + v4 association) | **`create_update(item_id, body)`** — HTML body supported | One call instead of two: no separate association step |
| `PATCH /notes/{id}` | `edit_update` | |
| `DELETE /notes/{id}` | `delete_update` | |
| (CRM activity timeline) | E&A `create_timeline_item` (needs `custom_activity_id`, API ≥ 2024-10) | Alternative to updates if the client lives in the CRM timeline |
| Webhook subscriptions in the Private App UI | `create_webhook(board_id, url, event)` mutation, **per board × per event** | webhook ids must be stored |
| HMAC v3 over raw body | Challenge handshake (`{"challenge": …}` echo) + JWT in `Authorization` for app-created webhooks (verified with the app Signing Secret) | Raw-body plumbing becomes unnecessary |
| At-least-once delivery, HubSpot retries | Retries **once a minute for 30 minutes** | Our queue + dedupe design still fits |
| Rate limits: per-10s request budget | **Complexity budget** (personal token 10 M/min, app token 5 M/min) + per-minute query cap (1 000 / 2 500 / 5 000 by plan) + **daily call cap (Free/Standard/Basic 1 000, Pro 10 000, Enterprise 25 000)** + concurrency (40/100/250) | Errors: `ComplexityException`, `DAILY_LIMIT_EXCEEDED`, minute/concurrency limits, with `retry_in_seconds` + `Retry-After` |

### Webhook events available
`create_item`, `change_column_value`, `change_specific_column_value`,
`change_status_column_value`, `change_name`, `item_deleted`, `item_archived`,
`item_restored`, `item_moved_to_any_group` / `…_to_specific_group`,
`create_update` / `edit_update` / `delete_update`, `create_column`, plus the
subitem variants. Payload carries `boardId`, `pulseId` (item id), `groupId`,
`columnValues`, `triggerTime`, `userId`, `subscriptionId`.

---

## 3. What breaks, and what has to be redesigned

1. **No merge.** monday has no merge event or merged-alias redirect. The whole
   merge subsystem (`companies.merge.service.ts`, `company.merge`/`deal.merge`
   schema entries, the self-heal branch in the processor, `--fix-merged` in
   the reconcile script, `readMergeIds`) **disappears**. Replacement concerns:
   `item_archived` (archived items are invisible to `items_page`, which only
   returns active items) and item moves between boards.
2. **Error taxonomy.** GraphQL returns HTTP 200 with an `errors` array for
   most failures. `isHubspotNotFound(status === 404)`, the "all 4xx are fatal"
   rule, `HubspotUnreachableError`, and the 401 circuit breaker must be
   re-expressed in terms of GraphQL error codes / null data.
3. **Board + column id configuration.** HubSpot property names are global and
   stable; monday column ids are board-scoped and change if a column is
   re-created. We need a config layer (env or a DB table): accounts board id,
   deals board id, and the column ids for type/segment/stage/connect/etc.,
   ideally validated at boot against a `boards { columns { id type } }` query.
4. **`hubspot_raw` → `monday_raw`.** `column_values` are an array of typed
   objects, not a flat property map; the mapper and any JSONB readers change
   shape.
5. **Deal → company resolution.** No primary association: we must define the
   rule (single dedicated connect column; first linked item; error if >1).
   `extractDealCompanyCandidates()` is rewritten, not deleted.
6. **Rate-limit model inversion.** Our current pattern — TTL refresh on *every*
   stale GET + a 5 s webhook processor tick — is cheap against HubSpot's
   per-10s budget but can exhaust a monday **daily** call cap on Free/Standard/
   Basic (1 000/day). This is the single biggest operational risk: the plan tier
   must be confirmed, and the client should gain a complexity-aware budget/
   throttle (read `complexity { after }` from responses).
7. **Webhook authentication.** JWT-signed webhooks require a monday **app**
   (Apps Framework) with a Signing Secret. A webhook created with a plain
   personal token is unsigned → we would need an alternative (secret path
   segment / shared token / IP allowlist). Decision required.
8. **Webhook provisioning.** Subscriptions are per board and per event, created
   by mutation. We need a provisioning script (`monday:webhooks:ensure`) that
   creates/verifies them and stores their ids, plus the challenge-echo handler.
9. **Document numbering.** `BSG-<seq>-<last 6 of company id>` embeds the CRM
   id. monday item ids are numeric (typically 9–10 digits), so the format
   survives, but **existing document numbers keep HubSpot-derived suffixes** —
   the mixed-history is a business decision, not a technical one.
10. **Note history.** Existing `hubspot_note_id` values point at HubSpot Notes
    that will not exist in monday. Either keep them as historical (recommended)
    or re-post updates for all synced documents (a bulk write, rate-limit
    heavy).
11. **`GET /api/v1/hubspot/pipelines`** and everything the SPA does with stage
    labels move to "status column settings" (a rename of the endpoint plus
    frontend type changes).
12. **Health check** — `hubspot.listPipelineStages()` in `/health` becomes a
    trivial `me { id }` query.

### Data-migration specifics found in the schema

- Re-keying companies is *easy*: `deals.hubspot_company_id` FK is
  `ON UPDATE CASCADE`, so an `UPDATE companies SET hubspot_company_id = …`
  cascades into `deals`.
- Re-keying deals is *not*: `documents.hubspot_deal_id` and
  `calculator_configs.hubspot_deal_id` are `ON UPDATE NO ACTION`. Those FKs
  must be dropped/recreated with `ON UPDATE CASCADE` (or updated inside a
  transaction with deferred constraints) before the id swap.
- `documents.company_id` points at `companies.id` (UUID), so document→company
  links survive re-keying untouched.
- A `crm_id_map` table (hubspot_id → monday_item_id, object type, matched_by)
  should be created and kept for audit.

---

## 4. Recommended approach

**Do not fork the codebase into a "monday version".** Introduce a CRM port and
two adapters, then cut over — that also keeps a rollback path.

**Phase 0 — Discovery (needs client access; ~2–3 days).**
Read the monday account through the API: `boards { id name columns { id title
type settings_str } }`, item counts, which boards are the source of truth,
whether monday CRM's E&A is used, the account plan tier (→ rate limits), and
who owns the API token / app. Produce `docs/bsg_monday_field_mapping.md` as
the counterpart to the HubSpot mapping doc.

**Phase 1 — Abstraction (~1 week).**
Define `server/modules/crm/crm.port.ts`:
`getCompany / getDeal / listCompanies / listDeals / listStages / createNote /
deleteNote / isConfigured`, with `HubspotAdapter` (existing code moved behind
it) and a new `MondayAdapter`. Rename DB/DTO fields to provider-neutral names
(`crm_company_id`, `crm_deal_id`, `crm_note_id`, `crm_sync_state`,
`crm_deleted_at`, `crm_raw`) in one migration — this is the largest mechanical
diff and it touches the frontend types too.

**Phase 2 — monday read path (~1–1.5 weeks).**
GraphQL client (complexity-aware retry, `API-Version` pinned), mapper for
`column_values`, backfill via `items_page` + cursor, TTL refresh, stage cache
from status column settings.

**Phase 3 — monday inbound events (~1 week).**
Challenge handshake, JWT (or alternative) verification, webhook provisioning
script, event → queue → processor rewrite (`create_item`,
`change_column_value`, `item_deleted`, `item_archived`, `item_restored`,
moves). Keep the existing `*_webhook_events` queue, statuses and retry budget —
that part of the design ports 1:1.

**Phase 4 — write-back (~3–5 days).**
`create_update` (HTML body — the note-builder is reusable almost as-is, minus
the association step), `delete_update` tear-down, same advisory locks, states
and events.

**Phase 5 — cutover (~3–5 days + testing).**
Matching key first: the cleanest option is a temporary "HubSpot ID" text
column on the monday boards populated during the client's own CRM migration,
which makes the mapping deterministic; otherwise match by name/domain with a
manual review list. Then: freeze → backfill from monday → re-key via
`crm_id_map` (with the FK fix above) → smoke-test → enable webhooks →
`AUTO_SYNC_TO_HUBSPOT` becomes `AUTO_SYNC_TO_CRM`.

**Phase 6 — cleanup.** Delete the HubSpot adapter, scripts, docs, tests; keep
`crm_note_id` history rows as they are.

**Rough total: ~4–6 weeks of focused work for one developer**, of which the
mechanical rename and the test/doc rewrite are ~30 %. This assumes the boards
already exist in monday and that the client's CRM data migration is theirs.

---

## 5. Open questions for the client / product owner

1. Which monday **plan** (rate limits + daily call cap differ by 25×) and how
   many companies/deals will be cached?
2. Is it **monday sales CRM** (Accounts/Contacts/Deals boards + E&A) or plain
   work-management boards? Which board is the source of truth for "company"
   and "deal"?
3. Notes: **item updates** (recommended — HTML, editable, deletable) or **E&A
   timeline items** (CRM-native activity feed, needs a custom activity type)?
4. Webhook auth: create a monday **app** with a Signing Secret (JWT-verified),
   or a personal-token webhook with a secret URL?
5. What replaces `company_type = direct_client` — a separate board, or a status
   column value?
6. What is the deal→company link — one dedicated connect column?
7. Is HubSpot switched off completely, or must both run in parallel for a
   period?
8. Do historical HubSpot Notes need to be re-created in monday, or is the link
   in our own document history enough?
9. Document numbering: keep the CRM-id suffix (mixed history) or freeze the
   format / change it?
10. What is the matching key for the company/deal id remap?

---

## 6. Files that will be touched (checklist)

**Deleted/replaced:** `server/modules/hubspot/**` (10 files),
`server/middleware/verify-hubspot-signature.ts`,
`server/shared/hubspot/note-builder.ts` (moved),
`server/modules/companies/companies.merge.service.ts`,
`server/scripts/hubspot-backfill.ts`, `scripts/hubspot-*.ts` (4),
`docs/hubspot_*.md`, `docs/client_and_hubspot_workflow.md`.

**Rewritten:** `server/config/env.ts`, `server/app.ts` (raw-body mount),
`server/index.ts` (boot hooks), `companies.service.ts`, `deals.service.ts`,
`documents/sync.service.ts`, `calculator-configs/sync.service.ts`,
`documents.service.ts` (delete tear-down), `numbering.service.ts` (suffix
source), `server/scripts/reconcile-companies.ts`, `server/shared/ttl-refresh.ts`
(call sites), all DB schema files carrying `hubspot_*` columns + a rename
migration, 8 integration tests + 3 unit test files.

**Renamed/adjusted (frontend):** `src/api/hubspot.ts`, `src/api/types.ts`,
`src/api/documents.ts`, `src/api/calculator-configs.ts`,
`src/shared/hubspotSyncPoll.ts`, `HubspotSyncBadge`, `HubspotDeletedBadge`,
`DocumentViewPage`, `CalculatorPage`, `CalculatorStickyToolbar`,
`DocumentsListPage`, `CalculatorsListPage`, `CompaniesPage`,
`CompanyDetailPage`, `WizardPage`, `WizardBackendBar`, `SaveCalculatorModal`,
`SaveDocumentModal`, `DeleteDocumentModal`, `DeleteCalculatorModal`,
`DeleteCompanyModal`, `EventHistoryPanel`, `LastActionCell`.

---

## 7. Sources (monday platform, checked 2026-08-22)

- Webhooks: https://developer.monday.com/api-reference/reference/webhooks
- Rate limits: https://developer.monday.com/api-reference/docs/rate-limits
- API versioning: https://developer.monday.com/api-reference/docs/api-versioning
- items_page: https://developer.monday.com/api-reference/reference/items-page
- items_page_by_column_values: https://developer.monday.com/api-reference/reference/items-page-by-column-values
- Updates: https://developer.monday.com/api-reference/reference/updates
- E&A timeline items: https://developer.monday.com/api-reference/reference/timeline-item-ea
- Custom activities: https://developer.monday.com/api-reference/reference/custom-activity

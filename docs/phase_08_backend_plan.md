# Phase 8 — Backend Plan (v2.0, consolidated)

Date: 2026-05-12
Status: **Ready for implementation kickoff.**
Supersedes: `phase_08_backend_plan_v1_archived.md` (2026-05-03).

This document is the orchestration plan for Phase 8 backend work. It
defines scope, schema, endpoints, and execution order. Detailed
contracts and UI specs live in dedicated companion docs — see §15
References.

> **Frontend state today:** 246/246 tests pass, tsc + tsc -p server
> tsconfig clean, vite build clean. Pre-Phase-8 cleanup landed
> (commits `8fba24b`, `c08a404`). Decomposition complete:
> `snapshotShape.ts`, `derivedSummaryShape.ts`,
> `wizard/layoutHelpers.ts` ready for backend reuse.

---

## 1. Scope

### Phase 8 ships

1. **Auth** — email/login + password, **single role** (`operator`).
   JWT access + refresh tokens. Admin creates users via SQL or simple
   admin form. No self-registration. No password reset (Q5).
2. **Companies + Deals tables** — synced from HubSpot via a single
   "Refresh from HubSpot" button. Phase 8 wires the schema + endpoint
   skeleton; real HubSpot API calls land in Phase 9.
3. **Documents table (unified)** — single table with
   `document_type ∈ {calculator_snapshot, offer, agreement}` (Q17).
   Each row has a `BSG-#######-######` number (see §6).
4. **Document lifecycle** — `draft → confirmed` (§7). Each row is
   uniquely numbered; cloning = new row + new number. No
   parent/superseded/archived (rejected as too complex for current
   needs).
5. **Numbering service** — atomic allocation of monotonic 7-digit
   `BSG-<doc_id>-<hubspot_id>` numbers.
6. **PDF render service** — server-side **Puppeteer + Chrome** in the
   same Docker container. Reuses the existing
   `buildOfferPdfHtml(payload)` builder verbatim. Pixel-diff regression
   test against 10 reference fixtures (§8).
7. **Read endpoints** — by-id + paginated list with filters by
   company / deal / document type / date / status.
8. **Documents listing page** — new frontend route. Filters per
   `docs/ui_phase_8_9_requirements.md`.
9. **View-mode pages** — `/view/document/:id` (logged-in users only,
   read-only).
10. **Clone-as-new-draft flow** — new endpoint + UI button on view
    pages.

### Phase 8 NOT ships (deferred to later)

- **Public share links** — all URLs are logged-in only (Q3 confirmed).
- **HubSpot API calls** — schema reserved with nullable columns; real
  sync in Phase 9.
- **PDF binary storage** — render is on-demand from `payload`, no
  caching (Q8). User downloads to local disk.
- **Email delivery** — no notifications, no merchant emails (Q8).
- **Audit log** — deferred (Q9).
- **Soft delete** — never delete anything (Q7 confirmed); no
  `deleted_at` columns.
- **Backups, monitoring, alerting** — deferred (Q11, Q13). Operational
  hardening lands as a separate Phase 8.1 pass after MVP.
- **Multi-tenant** — single-tenant, single brand.
- **RBAC / multiple roles** — one role only.
- **Password reset flow** — admin re-issues manually.
- **Full-text search** — filter by company / deal / type / date is
  enough at 100–500 docs/month volume (Q12).
- **Auto-save on wizard** — operator clicks "Save" explicitly; no
  per-keystroke autosave. Decision: lean MVP, revisit if operators
  complain about losing work.

### New UI requirements integrated

`docs/ui_phase_8_9_requirements.md` captured 4 new asks:
- Documents listing page with filters
- Shareable view-mode links (logged-in only)
- Clone-as-new-draft
- HubSpot status tracking (Phase 9, columns reserved)

These are all in scope for Phase 8 except HubSpot sync mechanics.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 20+ | Same as frontend tooling. |
| Framework | **Express** | Lean, minimal overhead. |
| Language | TypeScript | Shared types with frontend via path imports (validated by `tsconfig.server.json`). |
| DB | **PostgreSQL 15+** | JSONB for payloads. |
| Migrations | **Drizzle Kit** | TypeScript-native schema. |
| ORM | **Drizzle ORM** | Type-safe queries; close to SQL for JSONB. |
| Auth | **bcrypt** + **jsonwebtoken** | Cost 12; access 15 min, refresh 30 days. |
| Validation | **Zod** | Request/response schemas. Mirrors `snapshotShape.ts` / `derivedSummaryShape.ts` / `DocumentTemplatePayload`. |
| PDF render | **Puppeteer** (headless Chrome, pinned via `@puppeteer/browsers`) | In the same container. |
| Deployment | **Single Docker container** | Linux VPS (Q1 confirmed). Postgres in a sibling `docker compose` service. |

### Container layout (single API container + Postgres sibling)

```
┌──────────────────────────────────────────────────────────────┐
│  bsg-app  (single container, ~400MB)                          │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Express API  :3000                                       │ │
│  │     ├─ Auth (bcrypt + JWT)                                │ │
│  │     ├─ /api/v1/...  (REST endpoints)                       │ │
│  │     ├─ Puppeteer (headless Chrome bundle)                  │ │
│  │     └─ Static frontend bundle (dist/)                      │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼ TCP 5432
┌──────────────────────────────────────────────────────────────┐
│  postgres:15        (docker compose sibling)                  │
└──────────────────────────────────────────────────────────────┘
```

Frontend SPA build is served as static files by the same Express
process — no separate nginx in Phase 8 (Q1 confirmed: single
container).

---

## 3. Database schema

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | text UNIQUE NOT NULL | Login identifier (also accepts a short login). |
| `login` | text UNIQUE NULL | Optional short login. NULL if user logs in with email. |
| `password_hash` | text NOT NULL | bcrypt, cost 12. |
| `display_name` | text | Shown in UI. |
| `is_active` | boolean DEFAULT true | Soft-disable without delete. |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

No self-registration. No password reset. Admin creates rows manually
via SQL or a minimal admin form.

### `refresh_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → `users.id` ON DELETE CASCADE | |
| `token_hash` | text UNIQUE NOT NULL | SHA-256 of raw token (never store raw). |
| `expires_at` | timestamptz NOT NULL | 30 days. |
| `revoked_at` | timestamptz NULL | NULL = valid. |
| `created_at` | timestamptz | |

Indexes: `user_id`, `token_hash`.

### `companies` (HubSpot-synced)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Internal ID. |
| `hubspot_company_id` | text UNIQUE NOT NULL | HubSpot Company object ID. Source of truth. |
| `name` | text NOT NULL | Display name from HubSpot. |
| `hubspot_raw` | jsonb NOT NULL | Full HubSpot payload at last sync. |
| `last_synced_at` | timestamptz NOT NULL | |
| `created_at` | timestamptz | First time we saw this company. |
| `updated_at` | timestamptz | |

Indexes: `hubspot_company_id` (unique), `name` (for autocomplete).

**Field mapping table from HubSpot properties is deferred** until we
have HubSpot API access (Q8). `hubspot_raw` stores the full payload so
we never lose data; specific columns (jurisdiction, address, etc.) get
extracted into named columns once mapping is confirmed.

### `deals` (HubSpot-synced)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `hubspot_deal_id` | text UNIQUE NOT NULL | |
| `hubspot_company_id` | text FK → `companies.hubspot_company_id` | Owning company. |
| `name` | text NOT NULL | |
| `stage` | text | HubSpot pipeline stage. |
| `hubspot_raw` | jsonb NOT NULL | |
| `last_synced_at` | timestamptz NOT NULL | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Indexes: `hubspot_deal_id` (unique), `hubspot_company_id`.

### `documents` (unified)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Stable; used in `/documents/:id` URL. |
| `document_number` | text UNIQUE NOT NULL | `BSG-<7digit>-<6digit>` (§6). |
| `document_type` | text NOT NULL CHECK IN (`calculator_snapshot`, `offer`, `agreement`) | (Q17) |
| `status` | text NOT NULL CHECK IN (`draft`, `confirmed`) | (Q6) |
| `company_id` | uuid FK → `companies.id` NULL | Required for `offer` and `agreement`. Optional for `calculator_snapshot` (Q16 deferred — we allow null in Phase 8 and validate at confirm time). |
| `deal_id` | uuid FK → `deals.id` NULL | Optional even for offer/agreement; the link mode is finalized when HubSpot API access lands. |
| `payload` | jsonb NOT NULL | Shape depends on `document_type`: see §3.1. |
| `derived_summary` | jsonb NULL | Cached `DerivedSummaryPayload` for listing. Only populated for `calculator_snapshot`. |
| `parent_document_id` | uuid FK → `documents.id` NULL | Set when this row was created via "Clone". For lineage display only — does NOT imply status transitions on the parent. |
| `name` | text NULL | Optional operator label (for finding drafts later). |
| `created_at` | timestamptz | |
| `created_by` | uuid FK → `users.id` NOT NULL | |
| `updated_at` | timestamptz | |
| `confirmed_at` | timestamptz NULL | Set when status transitions to `confirmed`. NULL while draft. |
| `confirmed_by` | uuid FK → `users.id` NULL | |
| `hubspot_sync_state` | text NULL | `not_synced` / `pending` / `synced` / `failed`. NULL in Phase 8 — Phase 9 populates. |
| `hubspot_links` | jsonb NULL | `{ companyId?, dealId?, noteId? }` populated by Phase 9 sync. |
| `last_sync_at` | timestamptz NULL | Phase 9. |
| `last_sync_error` | text NULL | Phase 9. |

#### Indexes

- `document_number` (unique)
- `(company_id, document_type, created_at DESC)` — for "latest per (company, type)" queries (Q15=A)
- `(document_type, created_at DESC)` — for type-filtered listings
- `(deal_id, created_at DESC)` — for deal-filtered listings
- `created_at DESC` — default sort
- `status` — for draft filtering

#### Immutability rules

- `status = 'draft'` → row is mutable: `UPDATE documents SET payload=$1, updated_at=now() WHERE id=$2 AND status='draft'`. Numbers do NOT change.
- `status = 'confirmed'` → row is locked. Application enforces this; a DB trigger that rejects UPDATEs on confirmed rows is **recommended** for defense-in-depth.
- Cloning a confirmed row = INSERT a new row with `parent_document_id = source.id`, new `document_number`, fresh `payload` copy, `status = 'draft'`.

### 3.1 `payload` shape per `document_type`

| document_type | payload shape | Source TS type |
|---|---|---|
| `calculator_snapshot` | `CalculatorSnapshotPayload` | `src/components/calculator/snapshotShape.ts` |
| `offer` | `DocumentTemplatePayload` with `documentScope = "offer"` | `src/components/document-wizard/types.ts` |
| `agreement` | `DocumentTemplatePayload` with `documentScope = "offerAndAgreement"` | same |

Zod validators on the API endpoint pick the right schema based on
`document_type` and reject mismatched shapes.

The pre-existing `documentScope: "offer" | "offerAndAgreement"` inside
`DocumentTemplatePayload` is a frontend concept; the new
`documents.document_type` column is the persistence concept. They
agree but are NOT the same field. The frontend never sends
`document_type` directly — backend derives it from the payload
(`calculator_snapshot` is its own endpoint; `offer` vs `agreement`
maps to the `documentScope` inside the payload).

### `document_number_sequence`

Singleton table. Atomic counter for the 7-digit middle segment.

| Column | Type | Notes |
|---|---|---|
| `id` | int PK CHECK (id = 1) | Singleton. |
| `next_doc_id` | bigint NOT NULL | Initialized to `7100001`. |
| `updated_at` | timestamptz | |

Allocation inside the same TX as the document insert:

```sql
UPDATE document_number_sequence
   SET next_doc_id = next_doc_id + 1,
       updated_at = now()
 WHERE id = 1
 RETURNING next_doc_id - 1 AS allocated_doc_id;
```

If the document insert rolls back, the increment rolls back too — no
wasted numbers.

---

## 4. API surface

All endpoints under `/api/v1/`. All except `/health` and
`/auth/login` require `Authorization: Bearer <accessToken>`.

### Auth

```
POST   /api/v1/auth/login          { email | login, password } → tokens
POST   /api/v1/auth/refresh        { refreshToken } → { accessToken }
POST   /api/v1/auth/logout         (revokes refresh token)
GET    /api/v1/auth/me             returns current user
```

### Users (admin only — Phase 8 means anyone with `is_active`, but the
endpoint is intentionally minimal because Phase 8 has no admin UI)

```
GET    /api/v1/users               list (for "created_by" dropdowns)
POST   /api/v1/users               create (admin route — Phase 8 used via curl/SQL)
PATCH  /api/v1/users/:id           update display_name / is_active
POST   /api/v1/users/:id/reset-password  admin re-issues password
```

### Companies (HubSpot-synced)

```
GET    /api/v1/companies                            paginated list, ?q=&limit=&offset=
GET    /api/v1/companies/:id                        single
POST   /api/v1/companies/sync                       triggers HubSpot pull (Phase 9 wires real API)
```

`POST /companies/sync` in Phase 8: returns `{ status: 'not_implemented_yet' }` 501. Endpoint exists so frontend wiring is complete.

### Deals (HubSpot-synced)

```
GET    /api/v1/deals?company_id=                    paginated list filtered by company
GET    /api/v1/deals/:id                            single
```

Same Phase 8/9 split: sync is Phase 9. Read works against whatever is in the DB.

### Documents (the main resource)

```
POST   /api/v1/documents                            create new draft.
                                                     body: { document_type, company_id?, deal_id?, payload, name? }
                                                     allocates BSG number, status='draft'.
GET    /api/v1/documents/:id                        single — full row including payload.
PATCH  /api/v1/documents/:id                        update DRAFT only.
                                                     body: partial { company_id?, deal_id?, payload?, name? }.
                                                     409 if status='confirmed'.
POST   /api/v1/documents/:id/confirm                draft → confirmed transition.
                                                     409 if already confirmed.
POST   /api/v1/documents/:id/clone                  creates a new draft row.
                                                     body (optional): { document_type, name? }
                                                     copies payload + company_id + deal_id.
                                                     parent_document_id = source.id.
                                                     status = 'draft'.
                                                     returns new row.
GET    /api/v1/documents/:id/pdf                    server-side render via Puppeteer.
                                                     Content-Type: application/pdf
                                                     Content-Disposition: attachment (download).
                                                     Works for confirmed AND draft (operator preview).
GET    /api/v1/documents                            paginated list with filters.
                                                     ?type=&company_id=&deal_id=&status=
                                                     &date_from=&date_to=
                                                     &latest_only=true|false
                                                     &cursor=&limit= (max 50)
                                                     &order=created_at_desc|document_number_desc
```

`latest_only=true` returns one row per `(company_id, document_type)` — the most recent. Used by the documents listing page's "current contracts per company" view (Q15=A).

### Numbering preview

```
GET    /api/v1/numbering/peek                       returns { next_doc_id: 7100123 }
                                                     no allocation, UI preview only.
```

### Health

```
GET    /health                                      { status: 'ok', db: 'ok', timestamp } — no auth.
```

### HubSpot sync (Phase 9 — endpoints reserved in Phase 8)

```
POST   /api/v1/documents/:id/hubspot-sync           triggers a sync attempt. 501 in Phase 8.
GET    /api/v1/documents/:id/hubspot-sync           sync status from documents.hubspot_*. 501 in Phase 8.
```

---

## 5. Document save & confirm flow

```
Operator opens wizard
        │
        ▼
  POST /api/v1/documents
    body: {
      document_type: 'offer' | 'agreement',
      company_id: <uuid>,             ← REQUIRED for offer/agreement
      deal_id?: <uuid>,
      payload: { ...DocumentTemplatePayload }
    }
    backend:
      1. Validate Zod schema per document_type
      2. Allocate next_doc_id atomically
      3. Build document_number = `BSG-{next_doc_id:7d}-{hubspot_id:6d}`
         (use deal.hubspot_deal_id if deal_id is set, else company.hubspot_company_id)
      4. INSERT documents row, status='draft'
      5. Return { id, document_number, status, created_at }
        │
        ▼
Operator continues editing → PATCH /api/v1/documents/:id with new payload
                              (any number of times)
        │
        ▼
Operator clicks "Confirm"
        │
        ▼
  POST /api/v1/documents/:id/confirm
    backend:
      1. Verify status='draft'
      2. UPDATE documents SET status='confirmed', confirmed_at=now(), confirmed_by=$user
      3. Return updated row
        │
        ▼
Document is now immutable. Operator can:
  - Download PDF (GET /pdf)
  - Clone to make a new draft (POST /clone)
  - View it forever (GET /:id)
  - (Phase 9) Sync to HubSpot
```

**Calculator snapshots** follow the same flow but with
`document_type='calculator_snapshot'` and an optional `company_id`
(operators can save calc state without a company picked — useful for
prospecting). At confirm time, a company picker prompt enforces an
association if it's still missing.

---

## 6. Document numbering format

```
BSG-7100123-456789
    └──┬──┘ └──┬──┘
       │       └── 6-digit HubSpot ID (last 6 chars):
       │            - Use the deal's HubSpot ID if deal_id is set
       │            - Otherwise use the company's HubSpot ID
       │            - Pad with leading zeros to 6 chars
       │            - Placeholder `000000` if neither is set
       │              (only legal for calculator_snapshot type)
       │
       └── 7-digit monotonic document ID from
           document_number_sequence. Starts at 7100001.
```

### Examples

| Scenario | `document_number` |
|---|---|
| Offer for Acme (HubSpot company `12345678`), no deal | `BSG-7100123-345678` (last 6 of company) |
| Offer for Acme, linked to deal `987654321` | `BSG-7100124-654321` (last 6 of deal) |
| Calculator snapshot with no company | `BSG-7100125-000000` |

### Edge cases (open until HubSpot API access)

- What if HubSpot ID is fewer than 6 chars? → Pad with leading zeros.
- What if HubSpot ID is more than 6 chars? → Take the last 6 (least-significant). Confirmed by user: "коли буде доступ до апі хабспота будемо тестувати коли що приходить".
- Collisions: two companies sharing the last-6-of-id ARE possible. The
  global uniqueness comes from the **7-digit doc id**, not the suffix.
  Suffix is for human readability + HubSpot back-reference.

### No reset, no year prefix

Numbers monotonic forever from `7100001`. At 8.9M slots available
(7100001 → 9999999), and 500/month volume, that's ~1480 years of
runway. We're fine.

---

## 7. Status lifecycle

```
       ┌─────────┐  PATCH /documents/:id (any field)
       │  draft  │ ←─── operator edits freely
       └─────────┘
            │
            │ POST /documents/:id/confirm
            ▼
       ┌──────────┐
       │ confirmed│ ←─── immutable. Application rejects PATCH.
       └──────────┘     Optional DB trigger as defense-in-depth.
            │
            │ POST /documents/:id/clone
            ▼
       ┌─────────┐
       │  draft  │ (NEW row, parent_document_id = source.id)
       └─────────┘
```

No other statuses. No `archived`, no `superseded`. The "current
document per company" is **computed** at query time via the
`latest_only=true` filter on `GET /documents`, ordering by
`created_at DESC` per (`company_id`, `document_type`).

---

## 8. PDF render service

### Architecture

- Single `Browser` instance kept alive in the process (lazy
  initialised on first request).
- Pool of 1 — at 100-500 docs/month + 2-5 concurrent users, no
  contention.
- Per-request: open new page → setContent(html) → page.pdf() → close
  page. ~150ms warm, ~1s cold.

### Reuse of existing builder

```ts
import { buildOfferPdfHtml } from
  "../src/components/document-wizard/buildOfferPdfHtml.js";

const html = buildOfferPdfHtml(payload);
// → exact same HTML the frontend's browser print uses today.
```

`tsconfig.server.json` (already shipped) guarantees the builder
compiles without DOM types — i.e. it's truly Node-safe.

### Pixel-diff regression test

Before merging the Puppeteer endpoint, capture **10 reference PDFs**
covering edge cases:

| # | Variant | Reason |
|---|---|---|
| 1 | Offer, EU+Global, single rate, no notes | baseline |
| 2 | Offer, EU+Global, tiered, no notes | tiered layout |
| 3 | Offer, EU+Global, tiered, 3-line payin note | compact preset |
| 4 | Offer, EU only, blended | single-region |
| 5 | Offer, Global only, IC++ | single-region IC++ |
| 6 | Offer + Agreement, both regions, with parties | bundle |
| 7 | Offer + Agreement, custom terms blocks | custom terms |
| 8 | Offer + Agreement, N/A toggles on multiple fees | N/A rendering |
| 9 | Offer, monthly minimum + 3DS + failed TRX | all toggles |
| 10 | Offer, payout-only mode | calculator type variant |

Run:
1. Generate each fixture via the **current browser print** flow → save
   as `tests/pdf-fixtures/baseline/01-offer-eu-global-single.pdf`.
2. Implement Puppeteer endpoint.
3. Server generates the same fixtures → compare via `pdfjs-dist` page
   rasterization + `pixelmatch`.
4. Allow ≤0.1% pixel difference per page (font anti-aliasing
   tolerance).
5. CI gate: any fixture exceeding tolerance fails the PR.

### Phase 8.5 hardening (optional)

- Increase pool to 2 if RAM allows + concurrency grows.
- Add `--no-sandbox` flag for non-root containers.
- Pin Chrome via `@puppeteer/browsers` config — never auto-update.

---

## 9. Auth flow

### Login

```
POST /api/v1/auth/login
  body: { identifier: "user@bsg.com" OR "login_short", password }
  response: { accessToken (15min JWT), refreshToken (30d), user }
```

`identifier` accepts either `users.email` or `users.login` (case-insensitive lookup). Backend looks up by email if it contains `@`, else by login.

### Token storage on frontend

httpOnly cookie for the refresh token (XSS-safe). Access token in
memory (React context). On 401 from any API call, automatic refresh
attempt; if refresh fails, redirect to `/login`.

### User creation (admin)

Phase 8 has no admin UI. Admin runs:

```bash
# Inside the container
npm run create-user -- --email=user@bsg.com --password=temppass --display="User Name"
```

This script hashes the password, inserts a row. Operator logs in,
optionally changes password later via `PATCH /users/:id` (own user
only).

---

## 10. HubSpot sync (Phase 8 schema, Phase 9 mechanics)

### Phase 8 deliverables

- `companies` + `deals` tables exist with `hubspot_raw` JSONB.
- `POST /companies/sync` endpoint exists (returns 501 "not implemented").
- `documents.hubspot_*` columns exist as nullable.
- Frontend "Refresh from HubSpot" button exists, shows a "coming soon"
  toast when clicked.

### Phase 9 will fill in

- Real HubSpot API client (read companies + deals).
- Real sync logic on `POST /companies/sync`.
- `documents.hubspot_sync_state` transitions.
- Field mapping (company.name from which HubSpot property, deal.stage,
  etc.) — finalised once we have HubSpot API access.

See `docs/client_and_hubspot_workflow.md` for full Phase 8/9 workflow.

---

## 11. Frontend integration changes

### New routes

- `/login` — login form.
- `/documents` — listing page with filters (date, company, deal, type, status).
- `/documents/:id` — view-only document page (logged-in only).
- `/view/document/:id` — same as `/documents/:id` (alias for shareable
  links).
- `/companies` — companies listing (synced from HubSpot). Sortable,
  searchable.
- `/companies/:id` — single company view with list of its documents.

### Existing routes

- `/calculator` — adds "Save" button → `POST /documents` with
  `document_type='calculator_snapshot'`. Loading a saved snapshot via
  `/calculator/:id` hydrates via `seedCalculatorStateFromSnapshot()`.
- `/wizard` — adds "Save Draft" + "Confirm" buttons. Confirm calls
  `POST /documents/:id/confirm`.

### Replacements

| Today | Phase 8 |
|---|---|
| `defaultDraftNumber()` placeholder | `GET /numbering/peek` for preview, `POST /documents` for real allocation. |
| `window.print()` PDF | `GET /documents/:id/pdf?download=true` server render. |
| Wizard state in `useState` | API-backed: PATCH on draft as operator works (no per-keystroke autosave — explicit "Save" button). |
| Hardcoded `KASEF PAY` party defaults | Stay as defaults; operator can override per document. |

### Snapshot/seed integration

The new state-shape modules (already shipped — see
`docs/backend_state_schemas.md`):

- Calculator → snapshot: `extractCalculatorSnapshot(state)` →
  `POST /documents body.payload`.
- Snapshot → calculator: `seedCalculatorStateFromSnapshot(payload)` +
  `applyStatePreset(preset)` → hydrate read-only or clone-to-edit.

---

## 12. Implementation order (sprint plan)

Each step ends with `npm run verify` (tsc + vitest + build).

### Sprint 1 — Foundation (1-2 days)

1. Add `server/` skeleton: Express app, error envelope, JSON logging.
2. Drizzle config + `users` + `refresh_tokens` migrations.
3. Auth endpoints (login, refresh, logout, me).
4. `create-user` admin script.
5. `requireAuth` middleware.

### Sprint 2 — Documents core (2-3 days)

6. `documents` + `document_number_sequence` + `companies` + `deals` migrations (all at once — last 3 are nullable FKs from `documents`).
7. Numbering service + `GET /numbering/peek`.
8. `POST /documents`, `PATCH /documents/:id`, `POST /documents/:id/confirm`, `POST /documents/:id/clone`.
9. `GET /documents/:id`, `GET /documents` with filters.
10. Zod schemas mirroring `snapshotShape.ts` / `DocumentTemplatePayload`.

### Sprint 3 — PDF (1-2 days)

11. Baseline pixel-diff fixtures (10 PDFs via current browser print).
12. Puppeteer integration. Single shared Browser instance.
13. `GET /documents/:id/pdf` endpoint.
14. CI gate: pixel-diff regression test.

### Sprint 4 — Companies + Deals stubs (1 day)

15. `GET /companies`, `GET /companies/:id`, `POST /companies/sync` (501 placeholder).
16. `GET /deals`, `GET /deals/:id`.

### Sprint 5 — Frontend integration (3-4 days)

17. Login page + token storage.
18. Documents listing page with filters.
19. Document view page.
20. Wizard wiring: explicit "Save" + "Confirm" buttons.
21. Calculator wiring: "Save" → snapshot.
22. PDF download button calls server endpoint.
23. "Refresh from HubSpot" button (501 toast for now).

### Sprint 6 — Single Docker container (1-2 days)

24. Multi-stage Dockerfile: build frontend → copy to Express static dir → install Puppeteer Chrome → run.
25. `docker-compose.yml` with `app` + `postgres` services.
26. `.env.example` for required vars.
27. Deploy smoke test on staging VPS.

### Total: ~10-15 days (depending on team size + interruptions)

Phase 8.1 (post-MVP hardening, separate sprint):
- Backups (pg_dump cron OR managed)
- Monitoring (Sentry + stdout logs)
- Rate limiting (express-rate-limit)
- Helmet security headers
- CORS allowlist tightening

Phase 9 (separate):
- HubSpot API client
- Real `POST /companies/sync`
- HubSpot sync on `POST /documents/:id/confirm`
- Audit log
- Concurrent edit conflict detection (if needed)

---

## 13. Open items requiring HubSpot API access

These block their respective tasks but don't block Phase 8 schema work:

| Item | Affected | Defer to |
|---|---|---|
| HubSpot ID format (numeric vs alphanumeric? length?) | Document numbering suffix | Q16 — when API access lands |
| Field mapping: which HubSpot property → which DB column on `companies` | `companies.*` extracted columns | Q8 — when API access lands |
| `agreementParties.merchant` auto-populate | Wizard Step 7 UX | Q10 — when API access lands |
| Document→company-or-deal rule (always company, optional deal? Or one of two?) | `documents.company_id` / `deal_id` nullability | Q16 — when API access lands |
| HubSpot deal stage values | `deals.stage` enum vs free text | When API access lands |
| Pagination behavior of HubSpot sync (full re-pull vs incremental) | `POST /companies/sync` semantics | When API access lands |

Phase 8 codes against the **most flexible interpretation** for now:
- `documents.company_id` and `documents.deal_id` both nullable.
- HubSpot ID stored as `text` (no length constraint).
- `companies.hubspot_raw` stores the full payload so no data loss.
- `deals.stage` is free `text`.

When HubSpot API access lands, a small Phase 8.5 PR tightens these
constraints based on real data.

---

## 14. Non-functional acceptance criteria

Phase 8 ships when:

- [ ] All 246 frontend tests still pass (no regressions).
- [ ] Backend has equivalent unit + integration coverage for: auth,
      numbering, documents CRUD, document confirm/clone, PDF render.
      Target: ~150 backend test cases.
- [ ] Pixel-diff CI gate passes against all 10 reference fixtures.
- [ ] `docker compose up` on a clean VPS spins up `app` + `postgres`,
      migrations run automatically, seed data loaded, `/health`
      returns 200.
- [ ] Login flow works end-to-end: create user via script → login →
      get tokens → call protected endpoint → refresh tokens → logout.
- [ ] Documents listing page filters by company / deal / type / date.
- [ ] Operator can: create draft, save edits, confirm, download PDF,
      clone, view confirmed document.
- [ ] "Refresh from HubSpot" button shows a clear "Phase 9" message —
      no surprise 500 errors.
- [ ] tsc (main) + tsc (server config) + vite build + ESLint all clean.

---

## 15. References

Companion docs (read these alongside this plan):

- `docs/backend_state_schemas.md` — Zod-ready typed contracts for
  every JSONB shape (`CalculatorSnapshotPayload`,
  `DerivedSummaryPayload`, `DocumentTemplatePayload`).
- `docs/backend_computation_boundary.md` — Rules on what backend
  recomputes vs. trusts. Critical for PDF render + Phase 9 HubSpot.
- `docs/client_and_hubspot_workflow.md` — Phase 8 manual-picker vs.
  Phase 9 HubSpot-sync workflow. Endpoint list per phase.
- `docs/ui_phase_8_9_requirements.md` — Listing page, view-mode,
  clone, HubSpot status UI specs.
- `docs/calculator_logic_and_formulas.md` — Math source of truth.
  Backend should NOT reimplement; it imports the existing pure domain
  modules.
- `docs/architecture.md` — Layered structure.
- `docs/decisions.md` — Full decision log including all 2026-05-12
  product-update and pre-Phase-8 cleanup entries.

Code references (existing, ready for backend reuse):

- `src/components/calculator/snapshotShape.ts` —
  `extractCalculatorSnapshot()` + `seedCalculatorStateFromSnapshot()`.
- `src/components/calculator/derivedSummaryShape.ts` —
  `DerivedSummaryPayload` type.
- `src/components/document-wizard/types.ts` — `DocumentTemplatePayload`.
- `src/components/document-wizard/buildOfferPdfHtml.ts` — Puppeteer
  input. Node-safe per `tsconfig.server.json`.
- `src/components/document-wizard/wizard/layoutHelpers.ts` — pure
  helpers (validators, mode resolution).
- `src/domain/calculator/**` — entire math layer, pure, Node-safe.
- `src/shared/html.ts` — `escapeHtml` utility.
- `tsconfig.server.json` — Node-side typecheck config that guarantees
  the above remain DOM-free.

Archived:
- `docs/phase_08_backend_plan_v1_archived.md` — the 2026-05-03 plan.
  Superseded but kept for traceability.

---

## 16. Decision log (Phase 8 v2.0)

All decisions made during the 2026-05-12 backend planning session:

| # | Decision | Reference |
|---|---|---|
| 1 | Single Docker container, Linux VPS | Q1 |
| 2 | Single user role (`operator`); email/login + password auth | Q4 |
| 3 | Admin creates users via SQL/script; no self-signup; no password reset | Q4, Q5 |
| 4 | All URLs logged-in only — no public share tokens | Q3 |
| 5 | 2-5 concurrent users — last-write-wins, no row-level locking | Q4 |
| 6 | Document numbering: `BSG-<7digit_monotonic>-<6digit_hubspot_id>`. Start at `7100001`. No reset. | Q5 (numbering) |
| 7 | Statuses: `draft → confirmed`. Each doc has unique number. Edit a confirmed = clone to new row. No archived/superseded. | Q6 |
| 8 | Document types: `calculator_snapshot \| offer \| agreement` (3 in one unified `documents` table). | Q17 |
| 9 | Latest per (company, document_type) — both `offer` and `agreement` shown as "current" simultaneously. | Q15 |
| 10 | HubSpot data flows IN to our DB via "Refresh" button (mass sync). We never WRITE back in Phase 8 (no sync OUT). | Q7 |
| 11 | No deletes anywhere. HubSpot is source of truth; our DB only holds document/calculator configs. | (Q7 + Q9) |
| 12 | PDF render: server-side Puppeteer + Chrome in the same container. Reuses existing `buildOfferPdfHtml`. Pixel-diff CI gate against 10 baseline fixtures. | Q14 + final PDF decision |
| 13 | PDF binary NOT stored — render on-demand on `GET /pdf`. User downloads. | Q8 |
| 14 | No email/notifications | Q8 |
| 15 | Wizard saves via explicit "Save" button — no per-keystroke autosave | Phase 8 lean MVP decision |
| 16 | 100-500 documents/month. Indexes required. Offset pagination, ~50/page. No full-text search. | Q12 |
| 17 | No audit log in Phase 8. Just `created_by` + `updated_at`. | Q9 |
| 18 | No automated backups in Phase 8 MVP — added in Phase 8.1 hardening pass. | Q11 |
| 19 | No monitoring/alerting in Phase 8 MVP — added in Phase 8.1 hardening pass. | Q13 |
| 20 | HubSpot field mapping deferred until API access is available. Schema accepts arbitrary `hubspot_raw` JSONB so no data is ever lost. | Q6, Q8, Q10, Q16 |

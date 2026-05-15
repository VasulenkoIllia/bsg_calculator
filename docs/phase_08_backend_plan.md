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

Schema finalized 2026-05-14 after inspecting live BSG HubSpot data
(`(A) Elena` agent + `(M) Finqly` merchant). See
`docs/bsg_hubspot_field_mapping.md` §1 for the column-by-column
rationale and the inspection scripts used.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Internal ID. |
| `hubspot_company_id` | text UNIQUE NOT NULL | HubSpot `hs_object_id`. Stable across renames. |
| `name` | text NOT NULL | HubSpot `name`. BSG convention: `(A) <agent>` / `(M) <merchant>`. |
| `company_type` | text NULL | HubSpot `company_type` enum. Values: `referring_partner`, `direct_client`, `aggregating_merchant`. NULL on records sales has not categorised yet. |
| `segment_type` | text NULL | HubSpot `segment_type` enum. Values: `Master_referring_partner`, `Direct_Merchant`, `Aggregating_Merchant`. **Confirmed NULL on the merchant we inspected** — column MUST allow NULL. |
| `lifecycle_stage` | text NULL | HubSpot `lifecyclestage` (`lead`, `opportunity`, …). |
| `hs_task_label` | text NULL | HubSpot `hs_task_label`. Usually duplicates `name`. |
| `hubspot_created_at` | timestamptz NOT NULL | HubSpot `createdate`. |
| `hubspot_modified_at` | timestamptz NOT NULL | HubSpot `hs_lastmodifieddate`. Drives incremental sync. |
| `hubspot_raw` | jsonb NOT NULL | Full HubSpot payload (all 263 properties) at last sync. Anything not in a named column above is read from here. |
| `last_synced_at` | timestamptz NOT NULL | When we last refetched this row from HubSpot. |
| `created_at` | timestamptz | First time we saw this company in our DB. |
| `updated_at` | timestamptz | |

Indexes:
- `hubspot_company_id` (unique)
- `name` text_pattern_ops — for prefix-search autocomplete
- `(company_type, name)` — for "agents only" / "merchants only" filters
- `hubspot_modified_at` — for incremental-sync queries

### `deals` (HubSpot-synced)

Schema finalized 2026-05-14 against deal `CEI Processing Limited`
(id `498828505295`). See `docs/bsg_hubspot_field_mapping.md` §2 for
the column-by-column rationale.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Internal ID. |
| `hubspot_deal_id` | text UNIQUE NOT NULL | HubSpot `hs_object_id`. |
| `hubspot_company_id` | text NOT NULL FK → `companies.hubspot_company_id` | HubSpot `hs_primary_associated_company`. Single FK — every BSG deal has one primary company. |
| `name` | text NOT NULL | HubSpot `dealname`. |
| `stage` | text NULL | HubSpot `dealstage` (stage id; resolve to label via cached pipeline list). |
| `pipeline_id` | text NULL | HubSpot `pipeline` (currently always `default` = Gateway sales). |
| `amount` | numeric(14,2) NULL | HubSpot `amount`. |
| `currency` | text NULL | HubSpot `deal_currency_code` (ISO code, e.g. `EUR`). |
| `client_label` | text NULL | HubSpot `client` free-text (e.g. `(M) Atom`). |
| `agent_label` | text NULL | HubSpot `agent` free-text (e.g. `(A) Jeremy`). |
| `business_vertical` | text NULL | HubSpot `business_vertical` enum (e.g. `iGaming / Betting`). |
| `hubspot_created_at` | timestamptz NOT NULL | HubSpot `createdate`. |
| `hubspot_modified_at` | timestamptz NOT NULL | HubSpot `hs_lastmodifieddate`. Incremental sync trigger. |
| `hubspot_raw` | jsonb NOT NULL | Full HubSpot payload (all 237 properties), including all pricing / KYB / business context fields that we deliberately do NOT extract — see field-mapping doc §2 for the rationale. |
| `last_synced_at` | timestamptz NOT NULL | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Indexes:
- `hubspot_deal_id` (unique)
- `hubspot_company_id` — for "deals for this company" listing
- `(hubspot_company_id, hubspot_created_at DESC)` — for paginated company→deals view
- `stage` — for stage-filtered listings
- `hubspot_modified_at` — for incremental-sync queries

**Note on the link-only integration model**: we deliberately do NOT
extract HubSpot deal pricing fields (`forecasted_monthly_volume`,
`transaction_fee__mdr`, `setup_fee`, etc.) even though our earlier
draft did. The calculator is always filled manually by the operator;
HubSpot's role is identification + context only.

### `calculator_configs` (mutable drafts — NEW 2026-05-15)

Operator's working calculator state. NOT a "document" in the formal
sense — no number, freely editable, can be deleted. Becomes the
source for one or many `documents` rows when the operator clicks
"Save offer / agreement". See decisions.md → "Phase 8 final
functional model" for the full rationale.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Used in `/calc/:id` URL. |
| `name` | text NULL | Operator label (e.g. "Acme deal — CH-tier draft v2"). NULL → backend renders as "Untitled calculator · 2026-05-15". |
| `hubspot_company_id` | text NULL FK → `companies.hubspot_company_id` | Optional during early drafting. Required before "Save as offer/agreement". |
| `hubspot_deal_id` | text NULL FK → `deals.hubspot_deal_id` | Optional. |
| `payload` | jsonb NOT NULL | Full `DocumentTemplatePayload`-like state (calculator inputs + computed derived state). |
| `created_at` | timestamptz NOT NULL | |
| `created_by` | uuid FK → `users.id` NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |
| `last_edited_by` | uuid FK → `users.id` NOT NULL | Updated on every save. |

Indexes:
- `hubspot_company_id` — for "calcs for this company" in the listing
- `hubspot_deal_id` — for "calcs for this deal"
- `(created_by, updated_at DESC)` — for "my recent calcs" filter (Phase 9)
- `updated_at DESC` — default sort

Mutation policy: UPDATE freely allowed. DELETE allowed (operator can
prune their own drafts). No FK cascades from `documents.source_calculator_config_id` — that FK keeps the lineage pointer but its NULL-ability means deleting a calc does NOT delete derived documents.

### `documents` (immutable offers + agreements — REVISED 2026-05-15)

After 2026-05-15 decisions: documents are write-once. No draft/confirmed
states. No UPDATE allowed. "Edit a document" means "create a new
calculator_configs seeded from this document's payload, edit in calc UI,
save as a new document". The `source_document_id` FK preserves lineage.

`document_type` is now strictly `'offer' | 'agreement'` — calculator
configs moved to their own table.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | Stable. Internal use only — public URLs use `document_number`. |
| `document_number` | text UNIQUE NOT NULL | `BSG-<7digit>-<6digit>` (§6). Generated atomically inside the create TX. |
| `document_type` | text NOT NULL CHECK IN (`offer`, `agreement`) | |
| `hubspot_company_id` | text NOT NULL FK → `companies.hubspot_company_id` | **Mandatory.** Document is always for a known HubSpot company. |
| `hubspot_deal_id` | text NULL FK → `deals.hubspot_deal_id` | Optional — operator can generate a document for a company without a specific deal (pre-sales scenarios). |
| `payload` | jsonb NOT NULL | Frozen `DocumentTemplatePayload` snapshot at save time. See §3.1. |
| `source_calculator_config_id` | uuid NULL FK → `calculator_configs.id` | The calc this document was generated from. NULL if cloned from another document (then `source_document_id` is set). |
| `source_document_id` | uuid NULL FK → `documents.id` | The template document this was cloned from. NULL if generated fresh from a calc. Exactly ONE of `source_calculator_config_id` / `source_document_id` is non-NULL (CHECK constraint). |
| `note_addendum` | text NULL | Operator's free-text addendum to the HubSpot note (Phase 9 includes this in the note body). |
| `hubspot_sync_state` | text NULL | `not_synced` / `pending` / `synced` / `failed`. NULL in Phase 8 — Phase 9 populates. |
| `hubspot_links` | jsonb NULL | `{ companyNoteId, dealNoteId? }` populated by Phase 9 sync. |
| `last_sync_at` | timestamptz NULL | Phase 9. |
| `last_sync_error` | text NULL | Phase 9. |
| `created_at` | timestamptz NOT NULL | Immutable. |
| `created_by` | uuid FK → `users.id` NOT NULL | Immutable. |

Note the absence of `updated_at`, `confirmed_at`, `confirmed_by`,
`status`, `name`, `parent_document_id` (renamed to `source_document_id`).

#### Indexes

- `document_number` (unique)
- `hubspot_company_id` — for "all documents for this company"
- `(hubspot_company_id, document_type, created_at DESC)` — for "latest offer per company"
- `hubspot_deal_id` — for "documents for this deal"
- `(document_type, created_at DESC)` — for type-filtered listings
- `created_at DESC` — default sort

#### Immutability enforcement

Application layer: no UPDATE endpoint. Defense-in-depth: optional DB
trigger that rejects `UPDATE documents` on any row (except `last_sync_*`
and `hubspot_sync_state` columns, which Phase 9 writes after the row
exists). Implementation deferred to Phase 8.5 hardening.

### 3.1 `payload` shape

| Table | payload shape | Source TS type |
|---|---|---|
| `calculator_configs.payload` | `DocumentTemplatePayload`-like (mutable draft, may include calculator-only fields not yet on the document) | `src/components/document-wizard/types.ts` |
| `documents.payload` (`document_type='offer'`) | `DocumentTemplatePayload` with `documentScope = "offer"` | same |
| `documents.payload` (`document_type='agreement'`) | `DocumentTemplatePayload` with `documentScope = "offerAndAgreement"` | same |

Zod validators on the API endpoints validate shape on write.

### `document_number_sequence`

Singleton table. Atomic counter for the 7-digit middle segment. Shared
across ALL document types — offers and agreements draw from the same
counter (decisions.md 2026-05-15). Calculator configs do not get a
number.

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

The final `document_number` is composed in the same TX:

```ts
const allocatedDocId: number = /* from UPDATE … RETURNING */;
const companySuffix = hubspotCompanyId.slice(-6).padStart(6, "0");
const documentNumber = `BSG-${String(allocatedDocId).padStart(7, "0")}-${companySuffix}`;
```

The 6-digit suffix comes from `hubspot_company_id` (decisions.md
2026-05-15). All documents for the same company share that suffix;
only the 7-digit middle differs.

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

### Calculator configs (NEW 2026-05-15)

Mutable working drafts. No number assigned. Operator can edit freely
and delete.

```
POST   /api/v1/calculator-configs                   create new calc.
                                                     body: { name?, hubspot_company_id?, hubspot_deal_id?, payload }
                                                     returns { id, ...row }.
GET    /api/v1/calculator-configs/:id               single — full payload.
PATCH  /api/v1/calculator-configs/:id               update any combination of fields.
                                                     body: partial { name?, hubspot_company_id?, hubspot_deal_id?, payload? }.
DELETE /api/v1/calculator-configs/:id               hard-delete. 200 on success.
                                                     Does NOT cascade to derived documents
                                                     (documents.source_calculator_config_id becomes NULL).
GET    /api/v1/calculator-configs                   list, ?company_id=&deal_id=&created_by=&cursor=&limit=
```

### Documents (REVISED 2026-05-15 — immutable offers + agreements)

No draft state, no PATCH, no DELETE. Two create paths: from a calc, or
cloned from a template document. Both allocate a fresh number.

```
POST   /api/v1/documents                            create + assign number atomically.
                                                     body: {
                                                       document_type: 'offer' | 'agreement',
                                                       source: { calculator_config_id } | { document_id }, // exactly one
                                                       hubspot_company_id: <text>,            // REQUIRED
                                                       hubspot_deal_id?: <text>,              // optional
                                                       note_addendum?: <text>                  // optional free-text for HubSpot note
                                                     }
                                                     backend:
                                                       1. Load source (calc or doc) payload
                                                       2. Validate Zod schema per document_type
                                                       3. Resolve hubspot_company_id → fetch suffix
                                                       4. Allocate next_doc_id atomically
                                                       5. INSERT documents row (immutable)
                                                       6. (Phase 9) trigger HubSpot note write
                                                     returns { id, document_number, created_at }.

GET    /api/v1/documents/:number                    single — full row by document_number.
                                                     Note: lookup by NUMBER not id, because public URL is /documents/BSG-...

GET    /api/v1/documents/:number/pdf                server-side render via Puppeteer.
                                                     Content-Type: application/pdf.
                                                     Content-Disposition: inline | attachment (?download=true).

POST   /api/v1/documents/:number/use-as-template    convenience: create a new calculator_config
                                                     seeded with this doc's payload + linkage.
                                                     returns { calculator_config_id, redirect_to: '/calc/<uuid>' }.
                                                     Frontend redirects operator to the calc UI.

GET    /api/v1/documents                            paginated list with filters.
                                                     ?type=offer|agreement
                                                     &hubspot_company_id=
                                                     &hubspot_deal_id=
                                                     &date_from=&date_to=
                                                     &latest_only=true|false
                                                     &cursor=&limit= (max 50)
                                                     &order=created_at_desc|document_number_desc
```

`latest_only=true` returns one row per `(hubspot_company_id, document_type)` — the most recent. Used by the listings page's "current contracts per company" view.

### Listings (NEW 2026-05-15 — hierarchical view)

One endpoint returns the full Company → Deal → Documents/Calcs tree
needed by the main listing page, avoiding N+1 waterfalls.

```
GET    /api/v1/listings/companies                   ?cursor=&limit=&q=
                                                     returns:
                                                     [{
                                                       hubspot_company_id, name, company_type, segment_type,
                                                       deals: [
                                                         { hubspot_deal_id, name, stage, amount, currency,
                                                           documents: [{ document_number, document_type, created_at }],
                                                           calculator_configs: [{ id, name, updated_at }]
                                                         }
                                                       ],
                                                       standalone_documents: [...],     // documents with no deal
                                                       standalone_calculator_configs: [...]
                                                     }]

POST   /api/v1/hubspot/refresh                      manual refresh trigger for the listing page.
                                                     body: { company_ids?: text[] }     // empty → refresh visible page
                                                     refetches from HubSpot + upserts.
                                                     returns { refreshed: { companies, deals } }.
```

### HubSpot webhooks (NEW 2026-05-15)

```
POST   /api/v1/hubspot/webhooks                     receives HubSpot events.
                                                     Headers required:
                                                       X-HubSpot-Signature-v3
                                                       X-HubSpot-Request-Timestamp
                                                     Backend verifies HMAC SHA-256 with HUBSPOT_WEBHOOK_SECRET
                                                     against `<method><uri><body><timestamp>` payload.
                                                     Rejected (401) on signature mismatch.
                                                     Subscribed events:
                                                       company.creation, company.propertyChange, company.deletion
                                                       deal.creation,    deal.propertyChange,    deal.deletion
                                                     On valid event:
                                                       1. Fetch full object from HubSpot
                                                       2. Upsert into our table
                                                       3. (deletion) hard-delete from cache
                                                     200 OK as fast as possible (HubSpot retries on slow responses).
                                                     No body in response.
```

### HubSpot sync write-back (Phase 9 — stub in Phase 8)

```
POST   /api/v1/documents/:number/sync               triggers HubSpot Note write.
                                                     Phase 8: returns { hubspot_sync_state: 'not_synced' } 501.
                                                     Phase 9: posts note + updates hubspot_links.
GET    /api/v1/documents/:number/sync               sync status from documents.hubspot_*.
                                                     Phase 8: returns the current null state. 200.
```

### Numbering preview

```
GET    /api/v1/numbering/peek                       returns { next_doc_id: 7100123 }
                                                     no allocation, UI preview only.
                                                     Also returns { recent: ['BSG-7100122-874808', ...] } for context.
```

### Health

```
GET    /health                                      { status: 'ok', db: 'ok', hubspot: 'ok'|'unreachable', timestamp }
                                                     no auth.
```

---

## 5. Document save & template flow (REVISED 2026-05-15)

Three flows, all using `POST /api/v1/documents`:

### Flow A — From scratch (calc → offer)

```
Operator opens calculator wizard at /calc/<uuid> (new or existing calc)
        │
        ▼
  PATCH /api/v1/calculator-configs/:id        (auto-save on every change)
        │
        ▼ operator picks company in calc UI (sets hubspot_company_id on the row)
        │
        ▼ operator clicks "Save as offer"
        │
        ▼ optional addendum prompt: "Add note for HubSpot?"
        │
        ▼
  POST /api/v1/documents
    body: {
      document_type: 'offer',
      source: { calculator_config_id: <uuid> },
      hubspot_company_id: <text>,
      hubspot_deal_id?: <text>,
      note_addendum?: <text>
    }
    backend (single TX):
      1. Load calc row, validate payload via Zod
      2. UPDATE document_number_sequence ... RETURNING next_doc_id
      3. Build document_number = `BSG-${seq:07d}-${last6(company_id):06d}`
      4. INSERT documents row (source_calculator_config_id = calc.id)
      5. (Phase 9) async POST note to HubSpot
    returns { id, document_number, created_at }
        │
        ▼
Frontend redirects to /documents/BSG-7100123-874808 (read-only view)
Calc row is UNCHANGED — operator can keep editing, generate more docs.
```

### Flow B — Use existing document as template

```
Operator views /documents/BSG-7100099-874808 (an old offer)
        │
        ▼ clicks "Use as template"
        │
        ▼
  POST /api/v1/documents/BSG-7100099-874808/use-as-template
    backend:
      1. INSERT calculator_configs row, payload = source doc payload
                                       hubspot_company_id = source.hubspot_company_id
                                       hubspot_deal_id    = source.hubspot_deal_id
                                       name = `From BSG-7100099-874808 · 2026-05-15`
    returns { calculator_config_id, redirect_to: '/calc/<new-uuid>' }
        │
        ▼ frontend redirects to /calc/<new-uuid>
        │
        ▼ operator edits as in Flow A, then clicks "Save as offer"
        │
        ▼
  POST /api/v1/documents (same as Flow A but source includes:
    source: { calculator_config_id: <new-uuid> },
    AND we attach source_document_id on the resulting documents row
    by reading calculator_configs.source_document_id (set during the
    `/use-as-template` call). New BSG number allocated.
```

### Flow C — Direct clone (skip calc editing)

```
Operator wants an identical offer with a fresh number — no edits.
        │
        ▼
  POST /api/v1/documents
    body: {
      document_type: 'offer',
      source: { document_id: <uuid> },         // direct doc-from-doc
      hubspot_company_id, hubspot_deal_id?, note_addendum?
    }
    backend snapshots source.payload, allocates new number, sets
    source_document_id (not source_calculator_config_id).
```

This direct path skips creating an intermediate calc. Useful when
operator wants the new number stamp but no payload changes (e.g.
formal annual re-issue).

---

## 6. Document numbering format (REVISED 2026-05-15)

```
BSG-7100123-874808
    └──┬──┘ └──┬──┘
       │       └── 6-digit suffix = LAST 6 DIGITS of hubspot_company_id
       │           (chosen 2026-05-15: company id, NOT deal id).
       │           Always 6 chars — pad with leading zeros if needed.
       │           All documents for the same company share this suffix.
       │
       └── 7-digit monotonic document_id from document_number_sequence.
           Starts at 7100001. Shared across offer + agreement.
           Calculator configs do NOT consume a number.
```

### Examples

Given HubSpot company id `426487874808`:

| Order | Document | `document_number` |
|---|---|---|
| 1st | Offer for Acme | `BSG-7100001-874808` |
| 2nd | Agreement for Acme (after offer accepted) | `BSG-7100002-874808` |
| 3rd | Offer for DIFFERENT company id `426418136305` | `BSG-7100003-136305` |
| 4th | Revised offer for Acme (clone of #1) | `BSG-7100004-874808` |

Notice: the suffix tells you "which company". The middle digits tell
you "when in the global sequence".

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

## 7. Document lifecycle (REVISED 2026-05-15 — single state)

Documents have **no status field**. A row only exists once it has a
number — and once it exists, it is immutable.

```
        Calculator config (mutable, editable, no number)
                       │
                       │ POST /documents
                       ▼
        Document allocated  ─── created_at, created_by frozen
            │
            ├─── GET /documents/:number             — view forever
            ├─── GET /documents/:number/pdf         — render forever
            ├─── POST /documents/:number/use-as-template
            │       │
            │       ▼
            │     NEW calculator_config (seeded)
            │       │ edit → POST /documents
            │       ▼
            │     NEW Document (fresh number, source_document_id = original)
            │
            └─── (Phase 9) POST /documents/:number/sync — write HubSpot note
```

"Current document per company" view is computed at query time via the
`latest_only=true` filter on `GET /documents`, ordering by
`created_at DESC` per (`hubspot_company_id`, `document_type`).

Comparison to the pre-2026-05-15 model: the prior plan had `draft →
confirmed` states with PATCH on draft + `confirmed` lock. The user
chose the simpler "save = immutable" model on 2026-05-15. Editing is
expressed as "create a new calc seeded from the document, edit calc,
save as new document".

---

## 7.5 HubSpot sync architecture (NEW 2026-05-15)

Three components: webhooks (push), backfill (one-shot pull), manual
refresh (operator-triggered pull).

### 7.5.1 Webhooks (real-time)

HubSpot Private App webhook subscriptions configured manually in the
HubSpot UI (NOT via API). Required subscriptions:

| Event | Effect |
|---|---|
| `company.creation` | Fetch & upsert into `companies` |
| `company.propertyChange` | Same |
| `company.deletion` | DELETE from `companies` (cascade to `deals` via FK) |
| `deal.creation` | Fetch & upsert into `deals` |
| `deal.propertyChange` | Same |
| `deal.deletion` | DELETE from `deals` |

Webhook URL: `https://bsg.workflo.space/api/v1/hubspot/webhooks` (POST).

Signature verification (server-side):

```ts
// HubSpot v3 signature:
// HMAC-SHA-256(secret, `${method}${uri}${body}${timestamp}`)
const expected = crypto
  .createHmac("sha256", process.env.HUBSPOT_WEBHOOK_SECRET!)
  .update(`${req.method}${req.originalUrl}${rawBody}${timestamp}`)
  .digest("base64");

if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
  return res.status(401).end();
}
```

Webhook handler MUST return 200 fast (<1s). HubSpot retries on slow
responses, which can cause duplicate processing. Pattern:

```ts
app.post("/api/v1/hubspot/webhooks", async (req, res) => {
  if (!verifySignature(req)) return res.status(401).end();
  res.status(200).end();              // ack immediately
  setImmediate(() => processEvents(req.body));  // process async
});
```

### 7.5.2 Initial backfill (one-shot on first deploy)

Admin command:

```bash
npm run hubspot:backfill
```

Implementation: paginates `/crm/v3/objects/companies?limit=100` then
`/crm/v3/objects/deals?limit=100`, upserts each. Idempotent — safe to
re-run.

Trigger: optionally auto-run on container startup when `companies`
table is empty. Logged with progress (`[1200/3400 companies synced]`).

### 7.5.3 Manual refresh button

Listing page button `Refresh from HubSpot`. Triggers:

```
POST /api/v1/hubspot/refresh
body: { company_ids?: text[] }     // empty → refresh visible page
```

Backend re-pulls each company id + its deals from HubSpot, upserts,
returns count. Used when operator suspects local cache is stale
(e.g. HubSpot webhook delivery failed silently).

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

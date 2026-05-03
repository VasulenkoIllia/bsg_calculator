# Phase 8 — Backend & Database Plan

Date: 2026-05-03 (updated 2026-05-03)
Status: **Finalized — ready for implementation.**

All open questions have been resolved. This document is the authoritative specification for Phase 8 backend implementation.

> Frontend is complete (Phase 7): 173/173 tests, frozen calculator, document wizard, PDF generation via browser print. Backend implementation has not started. `server/` is an empty skeleton.

---

## 1. Frontend readiness checklist

### What is locked

| Area | State |
|---|---|
| Calculator math (Zones 0–6) | Frozen by product. No changes without explicit approval. |
| Calculator state shape (`useCalculatorState`) | Stable; provided via `CalculatorContext`. |
| Wizard payload contract (`DocumentTemplatePayload`) | Stable. Single canonical shape consumed by all renderer modes. |
| Document scope | Two options only: `offer` and `offerAndAgreement`. No agreement-only output. |
| Source modes | Three: `calculator`, `manualBlank`, `manualDefaults`. |
| OFFER renderer (`buildOfferPdfHtml`) | Mode-driven; verified structurally against 8 reference samples. |
| AGREEMENT renderer (`agreementPdf/`) | Static MSA body + party-placeholder substitution. |
| Routing | `react-router-dom` v7 with `BrowserRouter`. SPA fallback in nginx. |
| URL contract | Defined in `docs/url_contract.md`. |
| Tests | 29 test files, 173 tests. |
| Lint | 0 errors. |

### What is still placeholder (replaced by backend)

| Placeholder | Location | Replacement |
|---|---|---|
| `BSG-DRAFT-{ts%100k}` document number | `seedHelpers.ts:defaultDraftNumber` | Backend numbering service issuing real `BSG-#####`. |
| Print-via-popup PDF generation | `buildOfferPdfHtml` → `window.print` | Server-side Puppeteer producing stable binary PDF. |
| Static party defaults (KASEF PAY etc.) | `legalDefaults.ts` | Read from DB / HubSpot per contract. |
| Wizard state in memory only | `WizardPage` component state | Persisted as `Document` rows + draft autosave. |

---

## 2. Phase 8 goals

### In scope

1. **Auth** — email + password login, JWT access + refresh tokens. Admin-created users only.
2. **Persist calculator snapshots** — every "save" creates an immutable row.
3. **Persist documents** — wizard "Confirm" creates an immutable `Document` row with full payload, allocated BSG number, and lineage to source snapshot.
4. **Numbering service** — atomic allocation of `BSG-#####` per spec (starts at 71001).
5. **Render service** — produce a real PDF (Puppeteer) from a stored `Document` payload, on-demand.
6. **Read endpoints** — load snapshot/document by ID for `/calculator/:id` and `/wizard/:id/edit`.
7. **Draft autosave** — keep wizard state alive across reloads (mutable per-user draft).
8. **Clients entity** — table seeded with test data; HubSpot sync wiring reserved for Phase 9.
9. **HubSpot outbound placeholders** — store URLs + sync status on documents; no actual API calls.
10. **Search** — filter/search on document and snapshot list endpoints.
11. **Seed data** — 3 users, 3 clients, 2 snapshots, 3 documents for dev/test.

### Non-goals (explicit)

- Email delivery.
- Webhook / event bus.
- Multi-tenant isolation.
- HubSpot API calls (columns reserved, no actual calls until Phase 9).
- Object storage for PDF caching (Puppeteer on-demand only; `rendered_pdf_url` reserved).
- Public share tokens (`/share/:linkToken` — deferred).
- RBAC / permissions (all users are equal).
- Full audit event table.
- DOCX export.

---

## 3. Tech stack (confirmed)

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 20+ | Same as frontend tooling. |
| Framework | **Express** | Lean, minimal overhead. Zod for validation. |
| Language | TypeScript | Shared types with frontend via path imports. |
| DB | **PostgreSQL 15+** | JSON support for payloads. Reliable. |
| Migrations | **Drizzle Kit** | TypeScript-native schema; SQL migration files generated. |
| ORM/Query | **Drizzle ORM** | Type-safe queries; close to SQL for JSONB operations. |
| Auth | **bcrypt** (passwords) + **jsonwebtoken** (JWT) | Access token 15 min; refresh token 30 days. |
| PDF render | **Puppeteer** (headless Chromium) | Reuses existing `buildOfferPdfHtml` template. |
| Validation | **Zod** | Request/response schemas. Shared with frontend where possible. |
| HTTP client (frontend) | `fetch` + thin wrapper | No axios needed. |
| Containerization | Docker Compose (separate API container alongside nginx) | Same deployment host. |

---

## 4. Document save flow

```
Wizard UI  ──►  Preview (NOT saved — HTML render in popup, same as today)
                    │
              User clicks "Confirm / Save"
                    │
                    ▼
          POST /api/v1/documents   ← atomic:
            1. Allocate BSG-##### from document_number_sequence
            2. Insert document row (status = 'final', full payload)
            3. Puppeteer renders PDF on-demand (not cached in Phase 8)
            4. Return { id, documentNumber, pdfAvailable: true }
                    │
          User clicks "Send to HubSpot"   ← separate explicit action
                    │
                    ▼
          POST /api/v1/documents/:id/hubspot-sync
            Phase 8: writes pending status + populates URL fields
            Phase 9: makes real HubSpot API call
```

**Only confirmed documents enter `documents` table.** Draft state = `wizard_drafts` (autosave). No draft rows in `documents`.

Document `/documents/:id` view: React shell page with metadata + embedded PDF viewer (`<iframe src="/api/v1/documents/:id/pdf">`). PDF endpoint returns `Content-Type: application/pdf` with `Content-Disposition: inline`.

---

## 5. Database schema

All tables enforce immutable rows where noted. Mutability is opt-in per concern. `created_by` is a FK to `users.id` on all main tables.

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `email` | `text` UNIQUE NOT NULL | Login identifier. |
| `password_hash` | `text` NOT NULL | bcrypt cost 12. |
| `display_name` | `text` | Shown in UI. |
| `is_active` | `boolean` DEFAULT true | Soft disable without delete. |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

No self-registration. Admin creates users via seed or admin script.

### `refresh_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` ON DELETE CASCADE | |
| `token_hash` | `text` UNIQUE NOT NULL | SHA-256 of the raw token (never store raw). |
| `expires_at` | `timestamptz` NOT NULL | 30 days from creation. |
| `revoked_at` | `timestamptz` NULL | NULL = still valid. |
| `created_at` | `timestamptz` | |

Indexes: `user_id`, `token_hash`.

### `clients`

Seeded manually. Populated via HubSpot sync in Phase 9.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Internal ID. |
| `display_name` | `text` NOT NULL | Company name shown in UI. |
| `hubspot_company_id` | `text` UNIQUE NULL | HubSpot Company object ID. |
| `hubspot_deal_id` | `text` NULL | HubSpot Deal object ID (optional context). |
| `jurisdiction` | `text` NULL | Country/jurisdiction of merchant. |
| `registered_address` | `text` NULL | |
| `hubspot_raw` | `jsonb` NULL | Full HubSpot payload snapshot at last sync. |
| `sync_status` | `text` NOT NULL | `manual` \| `synced` \| `sync_failed` |
| `last_synced_at` | `timestamptz` NULL | |
| `deleted_at` | `timestamptz` NULL | Soft delete. |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

`sync_status = 'manual'` for seed test data. Indexes: `display_name`, `hubspot_company_id`.

### `calculator_snapshots`

Immutable. Each save creates a new row.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | Optional human label. |
| `client_id` | `uuid` FK → `clients.id` NULL | Associated client (if known). |
| `payload` | `jsonb` NOT NULL | Full `useCalculatorState` snapshot, validated by Zod. |
| `derived_summary` | `jsonb` NULL | Summary metrics for list view (total profitability, monthly volume). |
| `parent_snapshot_id` | `uuid` FK → `calculator_snapshots.id` NULL | Lineage. NULL for first-of-chain. |
| `hubspot_links` | `jsonb` NULL | `{ calculatorSnapshotUrl, sentAt, syncStatus }`. NULL until Phase 9. |
| `created_at` | `timestamptz` | |
| `created_by` | `uuid` FK → `users.id` NOT NULL | |

Indexes: `created_at DESC`, `client_id`, `parent_snapshot_id`.

### `documents`

Immutable. Each "Confirm" creates a new row with full payload + assigned number.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Stable; used in `/documents/:id` URL. |
| `document_number` | `text` UNIQUE NOT NULL | `BSG-#####`. Allocated atomically. |
| `document_scope` | `text` NOT NULL | `offer` \| `offerAndAgreement` |
| `document_type_label` | `text` NOT NULL | Cached label at creation time. |
| `client_id` | `uuid` FK → `clients.id` NULL | Associated client. |
| `payload` | `jsonb` NOT NULL | Full `DocumentTemplatePayload`, validated by Zod. |
| `source_calculator_snapshot_id` | `uuid` FK → `calculator_snapshots.id` NULL | NULL when source = manual. |
| `parent_document_id` | `uuid` FK → `documents.id` NULL | Set when forked from another document. |
| `hubspot_links` | `jsonb` NULL | See HubSpot outbound schema below. NULL until initiated. |
| `rendered_pdf_url` | `text` NULL | Reserved for Phase 8+ object storage cache. NULL in Phase 8. |
| `deleted_at` | `timestamptz` NULL | Soft delete. |
| `created_at` | `timestamptz` | |
| `created_by` | `uuid` FK → `users.id` NOT NULL | |

Indexes: `document_number` (unique), `created_at DESC`, `client_id`, `source_calculator_snapshot_id`.

### `document_number_sequence`

Single-row table. Atomic counter.

| Column | Type | Notes |
|---|---|---|
| `id` | `int` PK CHECK (id = 1) | Singleton. |
| `next_value` | `bigint` NOT NULL | Initialized to `71001`. |
| `updated_at` | `timestamptz` | |

Allocation: `UPDATE document_number_sequence SET next_value = next_value + 1, updated_at = now() RETURNING next_value` inside the same transaction as the document insert. If the transaction rolls back, the number increment rolls back too — no wasted numbers.

### `wizard_drafts`

Mutable. One draft per user. Not a document — promoting to document creates a new `documents` row.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `users.id` UNIQUE | One draft per user. |
| `client_id` | `uuid` FK → `clients.id` NULL | |
| `payload` | `jsonb` NOT NULL | Last wizard state. |
| `source_mode` | `text` NOT NULL | `calculator` \| `manualBlank` \| `manualDefaults`. |
| `current_step` | `int` NOT NULL | |
| `updated_at` | `timestamptz` | TTL: cleanup drafts not touched in 30 days. |

TTL cleanup: cron job or scheduled background task (implementation detail).

---

## 6. HubSpot outbound tracking

Stored as `documents.hubspot_links` JSONB. Populated when user clicks "Send to HubSpot". Phase 8 writes the record (status = pending, URLs populated). Phase 9 makes the real HubSpot API call and updates `syncStatus` to `sent` or `failed`.

```jsonc
{
  // HubSpot target (filled in Phase 9 when real sync happens)
  "objectType": "deal" | "company" | "lead",
  "objectId": "12345",

  // URLs sent to HubSpot
  "documentPageUrl": "https://bsg.workflo.space/documents/:id",
  "pdfDownloadUrl": "https://bsg.workflo.space/api/v1/documents/:id/pdf",
  "calculatorSnapshotUrl": "https://bsg.workflo.space/calculator/:snapshotId",  // null if manual source

  // Document metadata sent as HubSpot properties
  "metadata": {
    "documentNumber": "BSG-71001",
    "documentDate": "2026-05-03",
    "documentScope": "offerAndAgreement",
    "clientName": "Acme Corp"
  },

  // Sync lifecycle
  "initiatedAt": "2026-05-03T10:00:00Z",  // when user clicked "Send to HubSpot"
  "initiatedBy": "user-uuid",
  "syncStatus": "pending" | "sent" | "failed",
  "sentAt": "2026-05-03T10:01:00Z",        // null until Phase 9 confirms
  "lastAttemptAt": "2026-05-03T10:01:00Z",
  "failureReason": null | "string"
}
```

For `calculator_snapshots.hubspot_links` — same pattern, only `calculatorSnapshotUrl` + sync lifecycle fields.

---

## 7. API surface

All endpoints under `/api/v1/`. All endpoints except `/health` and `/auth/login` require `Authorization: Bearer <accessToken>`.

### Auth

- `POST /api/v1/auth/login` — body: `{ email, password }`. Returns `{ accessToken, refreshToken, user: { id, email, displayName } }`.
- `POST /api/v1/auth/refresh` — body: `{ refreshToken }`. Returns `{ accessToken }`.
- `POST /api/v1/auth/logout` — revokes refresh token. Requires access token.
- `GET  /api/v1/auth/me` — returns current user.

### Clients

- `GET  /api/v1/clients` — paginated list. Params: `?q=` (search by display_name), `?cursor=`, `?limit=` (max 50).
- `GET  /api/v1/clients/:id` — single client with aggregated counts (`documentsCount`, `snapshotsCount`).

### Calculator snapshots

- `POST /api/v1/calculator-snapshots` — body: full calculator state + optional `{ name, clientId }`. Returns `{ id, created_at }`.
- `GET  /api/v1/calculator-snapshots/:id` — returns the snapshot.
- `GET  /api/v1/calculator-snapshots` — paginated list. Params: `?q=`, `?clientId=`, `?cursor=`, `?limit=`.

### Documents

- `POST /api/v1/documents` — body: `{ payload, sourceCalculatorSnapshotId?, parentDocumentId?, clientId? }`. Allocates number atomically, persists, renders PDF with Puppeteer. Returns `{ id, documentNumber, createdAt }`.
- `GET  /api/v1/documents/:id` — returns the document row (without PDF binary).
- `GET  /api/v1/documents/:id/pdf` — renders PDF on-demand (Puppeteer), returns binary. Headers: `Content-Type: application/pdf`, `Content-Disposition: inline` (default) or `attachment` (if `?download=true`).
- `GET  /api/v1/documents` — paginated list. Params: `?q=` (search by document_number, client name, merchantLegalName in payload), `?clientId=`, `?scope=offer|offerAndAgreement`, `?hubspotSynced=true|false`, `?from=`, `?to=` (ISO 8601 dates), `?cursor=`, `?limit=` (max 50).

### HubSpot sync

- `POST /api/v1/documents/:id/hubspot-sync` — initiates sync. Body (optional): `{ objectType, objectId }`. Sets `hubspot_links.syncStatus = 'pending'`, populates URL fields, records `initiatedBy`. Phase 9 will extend this to make the actual HubSpot call.
- `GET  /api/v1/documents/:id/hubspot-sync` — returns current sync status from `hubspot_links`.

### Numbering

- `GET  /api/v1/numbering/peek` — returns `{ nextNumber: "BSG-71005" }` without consuming. For UI preview only.

### Wizard draft autosave

- `PUT    /api/v1/drafts/mine` — upsert current user's draft. Body: `{ payload, sourceMode, currentStep, clientId? }`.
- `GET    /api/v1/drafts/mine` — fetch current user's draft.
- `DELETE /api/v1/drafts/mine` — clear after document confirmed.

### Health

- `GET /health` — returns `{ status: "ok", db: "ok", timestamp }`. No auth required.

---

## 8. Document numbering (Phase 8 vs Phase 9)

**Phase 8 (no HubSpot):** `BSG-#####`
- Example: `BSG-71001`, `BSG-71002`

**Phase 9 (with HubSpot):** `BSG-#####-XXXXX`
- `XXXXX` = last 5 digits of originating HubSpot Deal ID
- Example: `BSG-71005-98765`

Documents created before HubSpot retain their `BSG-#####` number — numbers never change after allocation.

---

## 9. Test seed data

Seed script: `server/db/seeds/dev.ts`

**Users (3):**

| email | password | display_name |
|---|---|---|
| `admin@bsg.com` | `bsg-admin-2026` | Admin |
| `manager@bsg.com` | `bsg-manager-2026` | BSG Manager |
| `demo@bsg.com` | `bsg-demo-2026` | Demo User |

**Clients (3, sync_status = 'manual'):**

| display_name | jurisdiction |
|---|---|
| Acme Payment Solutions Ltd | GB |
| TechPay Europe GmbH | DE |
| FinServe International SA | CH |

**Calculator snapshots (2):**
- "Acme - EU Payin Offer Q2 2026" — linked to Acme client, seeded with representative calculator state.
- "TechPay - Full Bundle Q2 2026" — linked to TechPay client.

**Documents (3):**
- `BSG-71001` → `offer` → Acme — `hubspot_links.syncStatus = 'sent'`
- `BSG-71002` → `offerAndAgreement` → Acme — `hubspot_links.syncStatus = 'pending'`
- `BSG-71003` → `offer` → TechPay — `hubspot_links = null` (not initiated)

---

## 10. Frontend changes needed

1. **Replace `defaultDraftNumber()` placeholder** — call `GET /numbering/peek` for UI preview; `POST /documents` allocates the real number on confirm.
2. **Wire URL deep-links:**
   - `/calculator/:id` — `CalculatorPage` fetches snapshot, hydrates `CalculatorContext`. Read-only banner with "Fork to edit" CTA.
   - `/wizard/:id/edit` — `WizardPage` fetches existing document, seeds wizard with stored payload, allocates new ID on confirm.
3. **Auth flow** — login page, token storage (httpOnly cookie or memory), refresh on 401.
4. **Draft autosave hook** — `useWizardAutosave(draft, debounce=2000ms)` → `PUT /drafts/mine`. On mount, `GET /drafts/mine`.
5. **List pages** — `/documents` (contracts list), `/calculator-snapshots`.
6. **Document view page** — `/documents/:id` with shell + embedded PDF iframe.
7. **HubSpot sync button** — on document view page; calls `POST /documents/:id/hubspot-sync`.
8. **Replace `window.print` PDF** — "Download PDF" calls `GET /documents/:id/pdf?download=true`.

---

## 11. Resolved decisions (all 19)

| # | Topic | Decision |
|---|---|---|
| 1 | Framework | Express + Zod |
| 2 | ORM / Migrations | Drizzle ORM + Drizzle Kit |
| 3 | Hosting | Separate API container in Docker Compose alongside nginx |
| 4 | PDF rendering | Puppeteer on server. Phase 8: on-demand only, no cache. |
| 5 | `created_by` | `uuid FK → users.id` (auth in Phase 8) |
| 6 | Document immutability | Confirmed: edit = new row with `parent_document_id` lineage |
| 7 | Draft TTL | 30 days untouched → cleanup |
| 8 | Autosave scope | Wizard drafts only |
| 9 | Numbering reset | Never. Monotonic forever. |
| 10 | HubSpot columns | Include `hubspot_links` JSONB in Phase 8; populate in Phase 9 |
| 11 | Soft delete | `deleted_at` on `documents` and `clients` from the start |
| 12 | Document types | Only `offer` and `offerAndAgreement` |
| 13 | Document view | Shell page `/documents/:id` + embedded PDF viewer |
| 14 | PDF storage (Phase 8) | Puppeteer on-demand; `rendered_pdf_url = NULL`. Object storage deferred. |
| 15 | Share links | `/share/:linkToken` — deferred, not Phase 8 |
| 16 | Audit log | Minimal: `created_by FK → users.id` on each table row |
| 17 | Document status | All confirmed documents are `final`. Draft = `wizard_drafts` only. |
| 18 | HubSpot sending | Explicit "Send to HubSpot" button. Phase 8 = pending record only. |
| 19 | Auth mechanism | Email + password. JWT (access 15 min + refresh 30 days). No self-registration. |

---

## 12. Execution order

Each step ends with `npm run verify` and a focused decision log entry in `docs/decisions.md`.

1. **DB schema + migrations** — all tables: `users`, `refresh_tokens`, `clients`, `calculator_snapshots`, `documents`, `document_number_sequence`, `wizard_drafts`.
2. **Seed script** (`server/db/seeds/dev.ts`) — 3 users, 3 clients, 2 snapshots, 3 documents.
3. **Auth middleware** — bcrypt verify, JWT sign/verify, refresh token rotation, `requireAuth` middleware.
4. **Auth endpoints** — `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
5. **Numbering service** + unit tests — atomic counter, `GET /numbering/peek`.
6. **`POST /documents`** — Zod validation, atomic number allocation, Puppeteer PDF render, insert.
7. **`GET /documents/:id`** + **`GET /documents/:id/pdf`** — fetch + stream PDF.
8. **`GET /documents`** list with search/filter params.
9. **Calculator snapshot endpoints** — `POST`, `GET :id`, `GET list`.
10. **Clients endpoints** — `GET list`, `GET :id`.
11. **HubSpot sync endpoints** — `POST :id/hubspot-sync`, `GET :id/hubspot-sync`.
12. **Frontend wiring** — replace placeholder number, login page, token storage, list pages, document view page.
13. **Wizard draft autosave** — `PUT /drafts/mine`, `GET /drafts/mine`, `DELETE /drafts/mine`.
14. **Production hardening** — structured JSON logs, standard error envelope, CORS allowlist, rate limiting (express-rate-limit), Helmet security headers.
15. **Update `docs/spec_v2_alignment.md`** — flip completed rows from ⏳ to ✅.

---

## 13. References

- Frontend payload type: [`src/components/document-wizard/types.ts`](../src/components/document-wizard/types.ts)
- Calculator state: [`src/components/calculator/useCalculatorState.ts`](../src/components/calculator/useCalculatorState.ts)
- Renderer entry: [`src/components/document-wizard/buildOfferPdfHtml.ts`](../src/components/document-wizard/buildOfferPdfHtml.ts)
- URL contract: [`docs/url_contract.md`](url_contract.md)
- AGREEMENT structure: [`docs/agreement_structure.md`](agreement_structure.md)
- Integrations (HubSpot planned): [`docs/integrations.md`](integrations.md)
- Decisions log: [`docs/decisions.md`](decisions.md)
- Spec alignment: [`docs/spec_v2_alignment.md`](spec_v2_alignment.md)

# Client & HubSpot Workflow (REWRITTEN 2026-05-15)

How a HubSpot company / deal flows through the listing page → calculator
→ document pipeline. Pinned now so Phase 8 endpoints leave the right
hooks open for Phase 9 write-back without committing to mechanics that
contradict the link-only integration model.

> ⚠️ The earlier version of this doc described a separate `clients`
> table that was seeded manually for Phase 8 and replaced by HubSpot
> in Phase 9. That model was dropped on 2026-05-15. There is no
> `clients` table. HubSpot companies and deals ARE the source of
> truth from day 1, mirrored into our `companies` and `deals` tables
> via webhooks + on-demand pull. See `docs/decisions.md` →
> "Link-only HubSpot integration" + "Phase 8 final functional model".

---

## 1. Day-1 picture (Phase 8 ships with this)

```
+-----------+      +------------------+      +-----------+      +-----------+
|  Operator │──→──│  Listings page   │──→──│  Calc     │──→──│  Document │
|  logs in  │      │  Company →       │      │  page     │      │  saved    │
|           │      │  Deal →           │      │  /calc/:id│      │  (offer / │
+-----------+      │  Docs/Calcs       │      └─────┬─────┘      │  agreement)│
                   └─────┬─────────────┘             │             └─────┬─────┘
                         │                            │                   │
                         ▼                            ▼                   ▼
                  GET /listings/companies       PATCH calc                POST /documents
                    (cached from HubSpot)         (auto-save, 1s)         (immutable, numbered)
                                                                                │
                                                                                ▼
                                                                          (Phase 9) Note posted
                                                                          to HubSpot company + deal
```

Concrete flow:

1. Operator logs in (`POST /api/v1/auth/login`).
2. Frontend loads `/listings` → `GET /api/v1/listings/companies`.
   Returns a hierarchical tree: companies → their deals → each deal's
   documents + calculator configs. Companies without deals appear as
   leaves too.
3. Operator expands a company, sees its deals + existing
   docs/calcs. They can:
   - Click an existing calc → opens `/calc/<uuid>` (edit).
   - Click an existing document → opens `/documents/<number>` (view).
   - Click "+ New calc for this deal" → `POST /calculator-configs`
     with `hubspot_company_id` + `hubspot_deal_id` preset.
4. On `/calc/:id`, the wizard loads via `GET
   /calculator-configs/:id`, and every change triggers a debounced
   (1s) `PATCH /calculator-configs/:id`.
5. When ready, operator clicks "Save as offer" / "Save as
   agreement" → modal prompts for an optional note addendum →
   `POST /api/v1/documents` allocates `BSG-<7d>-<6d company id
   suffix>` atomically + freezes the payload. Frontend redirects to
   `/documents/<number>`.
6. (Phase 9) The save action also queues a HubSpot Note write
   containing: number, type, created_at, link to `/documents/<number>`,
   optional addendum. Phase 8 reserves the columns + stub endpoint
   `POST /documents/:number/sync` returning `not_synced`.

### "Use as template" flow

From `/documents/<number>` view, clicking "Use as template":

1. `POST /api/v1/documents/:number/use-as-template`
2. Backend returns a `calculator_configs` draft seeded with the
   document's FULL payload (a `DocumentTemplatePayload`) + the same
   company + deal, titled `Template of <BSG-XXXXX>`.
   **Idempotent (Sprint 9.X):** a document is immutable, so if an
   UNCHANGED draft for it already exists (same company + title +
   semantically-identical payload) the backend REUSES it instead of
   proliferating identical copies. Once the operator edits a draft its
   payload diverges, so a later click makes a fresh pristine copy.
3. Returns `{ configId, redirectUrl }`.
4. The frontend opens the draft in the **Contract Wizard**
   (`/wizard?calc=<configId>`): the payload is a wizard draft, which the
   calculator can't hydrate — opening `/calc/<id>` directly just redirects
   to the wizard anyway. In "Saved calculators" these drafts are badged
   **"Document draft"** and their Open link points straight to the wizard.
   Editing + saving produces a NEW document with a NEW number; the
   original document is unchanged.

This is the ONLY way to "edit" an existing document. The original
stays immutable forever.

---

## 2. HubSpot sync mechanics

### Sources of fresh data

| Trigger | Action | Coverage |
|---|---|---|
| Initial deploy | `npm run hubspot:backfill` paginates `/crm/v3/objects/{companies,deals}` exhaustively + upserts | All existing HubSpot data |
| HubSpot webhook (`company.creation`, `propertyChange`, `deletion`, plus deal equivalents) | Backend verifies HMAC → INSERT into `hubspot_webhook_events` → async processor refetches the affected object + upserts | Real-time post-deploy updates |
| Manual `POST /api/v1/hubspot/refresh` (listing page button) | Re-pulls a specific company id (or visible page) from HubSpot, upserts | Operator-driven recovery when a webhook was missed |

No polling cron. Webhooks + backfill + manual refresh together
guarantee freshness without hammering HubSpot.

### What we extract vs keep in JSONB

See `docs/bsg_hubspot_field_mapping.md` for the full table. Summary:

- **Companies**: 8 named columns (`hubspot_company_id`, `name`,
  `company_type`, `segment_type`, `lifecycle_stage`, `hs_task_label`,
  `hubspot_created_at`, `hubspot_modified_at`) + `hubspot_raw`
  JSONB.
- **Deals**: 12 named columns (`hubspot_deal_id`, `hubspot_company_id`
  FK, `name`, `stage`, `pipeline_id`, `amount`, `currency`,
  `client_label`, `agent_label`, `business_vertical`,
  `hubspot_created_at`, `hubspot_modified_at`) + `hubspot_raw` JSONB.

Pricing fields (`forecasted_monthly_volume`, `transaction_fee__mdr`,
etc.) live ONLY in `hubspot_raw`. They are NOT used to pre-fill the
calculator — the link-only model means the operator fills the
calculator manually.

### Phase 9 write-back

When a document is saved (`POST /api/v1/documents`), Phase 9 (stubbed
in Phase 8) will:

1. POST a Note to HubSpot via `POST /crm/v3/objects/notes` with
   associations to BOTH the deal (typeId 214) and the company
   (typeId 190).
2. Note body template:
   ```html
   📄 <b>BSG-7100123-874808 — Offer</b><br>
   Created 2026-05-15 by operator@bsg.com<br>
   <a href="https://bsg.workflo.space/documents/BSG-7100123-874808">View document</a>
   <hr>
   <i>{operator addendum, if non-empty}</i>
   ```
3. Note IDs returned by HubSpot stored in `documents.hubspot_links`
   as `{ companyNoteId, dealNoteId? }`.
4. `documents.hubspot_sync_state` moves
   `not_synced → pending → synced` (or `failed` with `last_sync_error`).

Phase 8 reserves all these columns and exposes
`POST /api/v1/documents/:number/sync` returning 501 — frontend wiring
is complete, real HubSpot calls land in Phase 9.

### Idempotency

- Webhook delivery: every event INSERTed into
  `hubspot_webhook_events` with UNIQUE constraint on
  `hubspot_event_id`. Duplicate deliveries silently dedupe via
  `ON CONFLICT DO NOTHING`.
- Note write-back: on re-sync (operator manually re-triggers), if
  `hubspot_links.companyNoteId` is set, backend PATCHes the existing
  note instead of creating a new one. Re-confirm of the same
  document never creates a duplicate HubSpot note.

---

## 3. Backend endpoints (covered in detail in `phase_08_backend_plan.md` §4)

### Phase 8 ships

```
# HubSpot ingestion
POST /api/v1/hubspot/webhooks         HubSpot event receiver (HMAC)
POST /api/v1/hubspot/refresh          Manual refresh button

# Read paths
GET  /api/v1/companies[?q=&cursor=]
GET  /api/v1/companies/:id
GET  /api/v1/companies/:id/deals
GET  /api/v1/deals/:id
GET  /api/v1/listings/companies       Hierarchical (used by listing page)

# Calculator configs (mutable drafts)
POST   /api/v1/calculator-configs
GET    /api/v1/calculator-configs/:id
PATCH  /api/v1/calculator-configs/:id    (debounced auto-save target)
DELETE /api/v1/calculator-configs/:id
GET    /api/v1/calculator-configs?company_id=&deal_id=

# Documents (immutable offers + agreements)
POST /api/v1/documents                   Allocates number + INSERTs row
GET  /api/v1/documents/:number           Read view
GET  /api/v1/documents/:number/pdf       Server-rendered PDF (stream-only)
POST /api/v1/documents/:number/use-as-template
GET  /api/v1/documents[?…filters…]
GET  /api/v1/numbering/peek              Preview next number (no allocation)

# Phase 9 stubs (return 501 in Phase 8)
POST /api/v1/documents/:number/sync
GET  /api/v1/documents/:number/sync
```

### Phase 9 deltas (no schema migrations needed)

- `POST /documents/:number/sync` becomes a real HubSpot note write
  instead of returning 501.
- `POST /api/v1/hubspot/refresh` may grow background-queue semantics
  for bulk refreshes.
- No new tables; the existing `documents.hubspot_*` columns become
  active.

---

## 4. Frontend wiring (consumed by `src/`)

### Routes added in Phase 8

| URL | Backed by | Purpose |
|---|---|---|
| `/login` | `POST /auth/login` | Auth gate. Public. |
| `/listings` | `GET /listings/companies` | Hierarchical Company → Deal → Docs/Calcs view. Default route after login. |
| `/calc/:id` | `GET/PATCH /calculator-configs/:id` | Calculator wizard (existing) bound to a server row. Debounced auto-save. |
| `/documents/:number` | `GET /documents/:number` | Read-only document view. "Use as template" + "Download PDF" buttons. |

### Existing routes

| URL | Phase 8 status |
|---|---|
| `/calculator` (legacy direct-mount calculator) | Stays during Phase 8 as a "scratchpad" mode (no persistence). Phase 9 may retire it once `/calc/:id` is dominant. |
| `/wizard` (legacy unbound wizard) | Same — kept for compatibility, no longer the primary entry point. |

### Replacements

| Today | Phase 8 |
|---|---|
| `defaultDraftNumber()` placeholder | `GET /numbering/peek` for preview, `POST /documents` for real allocation. |
| `window.print()` PDF | `GET /documents/:number/pdf` server render (stream-only, no disk). |
| Wizard state in `useState` | `/calc/:id` reads via `GET /calculator-configs/:id`, writes via debounced 1s `PATCH /calculator-configs/:id`. |
| Hardcoded `KASEF PAY` party defaults | Stay as defaults; operator overrides per document. |

---

## 5. Cross-references

- `docs/phase_08_backend_plan.md` — DB schema, endpoints, save/template
  flows in full detail.
- `docs/backend_conventions.md` — folder structure, error envelope,
  logging, validation, TX boundaries, rate limit, CORS, health.
- `docs/bsg_hubspot_field_mapping.md` — which HubSpot fields we keep
  in named columns vs JSONB.
- `docs/hubspot_api_reference.md` — endpoint catalogue.
- `docs/backend_state_schemas.md` — `DocumentTemplatePayload` shape
  that flows through `POST /documents.payload` and
  `calculator_configs.payload`.
- `docs/decisions.md` — full decision log; recent entries:
  "Phase 8 final functional model" (2026-05-15),
  "Link-only HubSpot integration" (2026-05-14),
  "Phase 8 architectural conventions" (2026-05-15).

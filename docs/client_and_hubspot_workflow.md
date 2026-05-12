# Client & HubSpot Workflow — Phase 8 / Phase 9

How a client identity flows through the calculator → wizard →
backend pipeline today (Phase 8) and how it will evolve when HubSpot
sync ships (Phase 9). Pinned now so the Phase 8 endpoints leave the
right hooks open without committing to Phase 9 mechanics.

---

## Phase 8 — Seed clients, manual picker, no HubSpot calls

```
+-----------+      +-----------+      +-----------+      +-----------+
|  Operator |──→──│  Pick     │──→──│  Save     │──→──│  documents│
|  opens    │      │  client   │      │  document│      │  row      │
|  wizard   │      │  (drop-  │      │           │      │  + client │
+-----------+      │  down)    │      +-----------+      │  _id FK   │
                   +-----------+                          +-----------+
```

### Client model

`clients` table is seeded manually for Phase 8 — a small admin tool
(or just an SQL insert) populates rows. Each row has at minimum:

```sql
clients (
  id              uuid primary key,
  name            text not null,
  legal_name      text,
  country         text,
  created_at      timestamptz,
  -- Phase 9 columns, nullable in Phase 8 (see below).
  hubspot_company_id text,
  hubspot_synced_at  timestamptz
)
```

### Wizard UX (Phase 8)

1. Operator clicks "New Document" → wizard mounts on Step 1 (Header).
2. A new "Client" field (dropdown / autocomplete) appears alongside
   the existing header fields. Source: `GET /clients?search=<query>`.
3. Operator picks an existing client OR clicks "+ New client" to open
   an inline form that `POST /clients` and then auto-selects the new
   row.
4. The chosen `client_id` is held in wizard React state — NOT in
   `DocumentTemplatePayload`. It's sent as a side-channel param on
   `POST /documents` (`{ payload, client_id, source_calculator_snapshot_id }`).
5. Backend writes `documents.client_id = <picked>` and stores the
   payload verbatim.

**Important:** the wizard's existing `agreementParties.merchant` fields
(name, registration number, address) are SEPARATE from the picked
client. The client picker identifies the legal entity for billing/audit;
`agreementParties` is what gets rendered on the MSA. Today they're
typed manually each time. A Phase 8 follow-up may auto-populate
`agreementParties.merchant` from the picked `client` row when the
operator confirms; flag it as an open question for the meeting.

### What Phase 8 does NOT do

- Talk to HubSpot. No API calls. `hubspot_*` columns on `clients` and
  `documents` exist but stay null.
- Auto-sync new clients to HubSpot companies.
- Show "synced / not synced" status (the listing page from
  `docs/ui_phase_8_9_requirements.md` §1 should render an empty
  HubSpot status column in Phase 8 — it lights up in Phase 9).

---

## Phase 9 — HubSpot sync

```
+-----------+      +-----------+      +-----------+      +-----------+
|  Operator │──→──│  Pick     │──→──│  Save +   │──→──│  Sync to   │
|  opens    │      │  client   │      │  confirm  │      │  HubSpot   │
|  wizard   │      │  (CRM    │      │  document│      │  (deal +   │
+-----------+      │  picker)  │      +-----------+      │  note +    │
                   +-----------+                          │  prop write)│
                                                          +-----------+
```

### What changes

1. **Client picker reads from HubSpot directly.** `GET /clients` returns
   HubSpot companies (cached server-side for ~1 minute). Phase 8 seed
   clients can be migrated to HubSpot companies once + dropped, OR
   kept as a fallback list — to be decided.
2. **New documents trigger HubSpot writes.** When `documents.status`
   transitions to `confirmed`:
   - Server upserts a HubSpot DEAL associated with the client's
     company.
   - Server attaches a NOTE with the rendered PDF.
   - Server writes structured properties (margin, volume, pricing
     model, settlement period, …) onto the deal.
   - `documents.hubspot_sync_state` moves `not_synced → pending →
     synced` (or `failed` with `last_sync_error`).
3. **Sync is idempotent.** Re-confirming or re-syncing updates the
   existing deal in place (looked up via `documents.hubspot_links.dealId`).
4. **Clone preserves no HubSpot links.** A cloned document starts at
   `hubspot_sync_state = not_synced` and `hubspot_links = null` —
   it's a separate artefact, not a revision of the original deal.

### Field mapping (initial proposal — to be finalised in Phase 9 spec)

| HubSpot deal property | Source |
|---|---|
| `dealname` | `documents.payload.header.documentNumber` + client name |
| `amount` | derived summary `ourMarginEuro` |
| `closedate` | `documents.payload.header.documentDateIso` |
| `pipeline` / `dealstage` | static (configured per environment) |
| `bsg_settlement_model` | `documents.payload.header.collectionModel` |
| `bsg_settlement_period` | `documents.payload.contractSummary.settlementPeriod` |
| `bsg_payin_volume` | snapshot `payinVolume` |
| `bsg_payout_volume` | snapshot `payoutVolume` |
| `bsg_pdf_url` | URL to `/documents/:id/pdf` |

The detailed mapping table lives in `docs/integrations.md` (Phase 9
section, to be expanded). Use this doc as the source of truth for the
HANDOFF moment; expand the mapping there.

---

## Backend endpoints — client + sync

### Phase 8

```
GET    /clients?search=&limit=&offset=
POST   /clients                     { name, legal_name?, country? }
GET    /clients/:id
PATCH  /clients/:id                 partial update
POST   /documents                   { payload, client_id, source_snapshot_id? }
GET    /documents/:id
GET    /documents?client_id=&type=&date_from=&date_to=&status=
```

### Phase 9 (additions)

```
POST   /documents/:id/hubspot-sync  triggers a sync attempt
POST   /documents/:id/hubspot-retry retries a failed sync
GET    /clients/hubspot-search      proxy to HubSpot companies API
POST   /clients/from-hubspot        creates a clients row from a
                                    HubSpot company (or NOOPs if it
                                    already exists)
```

---

## Migration path: Phase 8 → Phase 9

**Schema:** add nullable HubSpot columns in the **Phase 8 initial
migration** even though Phase 8 never writes to them. Saves one
migration when Phase 9 starts and lets `documents` row shapes stay
stable.

**Data:** existing Phase 8 documents either:
- Stay un-synced forever (operator decides per-row to backfill via
  the new "Sync to HubSpot" button); or
- A one-shot script walks the table and pushes everything. To be
  decided during Phase 9 planning.

**UX:**
- Documents listing page (`docs/ui_phase_8_9_requirements.md` §1)
  gets a new "HubSpot" column that's always shown but empty / "—" in
  Phase 8. Phase 9 lights it up with status pills.
- Wizard client picker swaps `GET /clients` for HubSpot-backed search.
  No UX change visible to operators beyond results becoming richer
  (more companies in autocomplete).

---

## Open questions for the planning meeting

- [ ] Phase 8 `clients` seed source — admin UI, SQL inserts, or
      operator-self-serve "+ New client"?
- [ ] Does the wizard auto-populate `agreementParties.merchant` from
      the picked client row, or does the operator always type it?
- [ ] On HubSpot sync failure, retry policy — automatic backoff
      attempts vs. manual retry button only?
- [ ] Does cloning a document carry over the same `client_id` by
      default, or is it always blank?
- [ ] Idempotency window — if the operator clicks "Confirm" twice,
      should the second call be a no-op or a new draft? (`POST
      /documents` request-id header recommended either way.)
- [ ] HubSpot rate-limit handling — what's the budget per day, and how
      do we surface "rate-limited, try again later" in the UI?

---

## Cross-references

- `docs/ui_phase_8_9_requirements.md` — listing / view / clone UI that
  consumes this workflow.
- `docs/backend_state_schemas.md` — `DocumentTemplatePayload` shape +
  what flows through `POST /documents`.
- `docs/backend_computation_boundary.md` — Rule 4 covers HubSpot
  compute responsibilities.
- `docs/integrations.md` — HubSpot integration boundary spec (to be
  expanded with the field-mapping table during Phase 9).
- `docs/phase_08_backend_plan.md` — full backend plan.

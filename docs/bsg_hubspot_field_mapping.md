# BSG ↔ HubSpot Field Mapping

Date: 2026-05-14
Status: **Source of truth — validated against live BSG HubSpot 2026-05-14.**
Integration model: **Link-only** (BSG documents reference HubSpot
deals; HubSpot does NOT pre-fill the calculator).

Single canonical reference for which HubSpot fields BSG reads + writes.
Used by:

- **Phase 8 sync** (read-only) — pulls the listed fields into our DB
  via pull-on-demand. Everything else lands in `hubspot_raw` JSONB.
- **Phase 9 write-back** — backend posts a Note on the deal + company
  with a link to the generated BSG document.
- **Operator UX** — the wizard's "pick a deal" picker queries our
  cached `deals` rows + falls back to HubSpot search for unfamiliar
  records.

⚠️ **No calculator auto-hydration.** Earlier drafts of this document
mapped HubSpot deal pricing fields (`forecasted_monthly_volume`,
`transaction_fee__mdr`, `switzerland_share_in_total_europe_volume`,
etc.) to calculator inputs. That model was dropped on 2026-05-14
after the user clarified: "we won't integrate calculator and HubSpot
directly — we'll just give a link to our service". Operators always
fill the calculator manually; HubSpot's role is identification +
context, not data input.

See also:
- `docs/hubspot_api_reference.md` — endpoints, rate limits, scopes.
- `docs/phase_08_backend_plan.md` §3 — `companies` / `deals` table
  schemas use the exact column names listed below.
- `docs/client_and_hubspot_workflow.md` — operator UX flow.

---

## 1. Companies — 8 extracted columns

Validated by inspecting two live records (`(A) Elena` referring
partner + `(M) Finqly` direct client) on 2026-05-14. Of the 263
property names the HubSpot schema exposes, only ~30 are populated
per record and only 8 of them carry meaning for our workflow.

| HubSpot property | Our column | Type | NULL? | Use in app |
|---|---|---|---|---|
| `hs_object_id` | `hubspot_company_id` | text UNIQUE | NOT NULL | Primary key on HubSpot side. Stable across renames. |
| `name` | `name` | text | NOT NULL | Display name. BSG convention: prefix `(A)` for agents / `(M)` for merchants. |
| `company_type` | `company_type` | text | NULL | Enum: `referring_partner`, `direct_client`, `aggregating_merchant`. Distinguishes Agent vs Merchant for filters. Confirmed values from §6. |
| `segment_type` | `segment_type` | text | NULL | Enum: `Master_referring_partner`, `Direct_Merchant`, `Aggregating_Merchant`. Often NULL on Merchant records — column MUST be nullable. |
| `lifecyclestage` | `lifecycle_stage` | text | NULL | HubSpot lifecycle stage (`lead`, `opportunity`, …). Display + segment filter. |
| `hs_task_label` | `hs_task_label` | text | NULL | HubSpot CRM task label. Usually duplicates `name` but kept because some records have it filled when `name` is shorthand. |
| `createdate` | `hubspot_created_at` | timestamptz | NOT NULL | First seen in HubSpot. |
| `hs_lastmodifieddate` | `hubspot_modified_at` | timestamptz | NOT NULL | Used by Phase 9 incremental sync (`if hubspot_modified_at > last_synced_at → refetch`). |

Everything else (`domain`, `country`, `city`, `industry`, `phone`,
`hubspot_owner_id`, plus ~250 HubSpot built-ins) → **`hubspot_raw`
JSONB**. If a feature needs one of them later, promote it to a named
column via a migration; we don't lose data in the meantime.

### Why so few extracted columns?

Live data shows BSG's sales team fills almost nothing besides `name`,
`company_type` and lifecycle. The four "obvious" built-ins (`domain`,
`country`, `industry`, `phone`) are **NULL on both records we
inspected**. Promoting them to columns up front would yield mostly
empty rows; better to keep them in JSONB and add columns when a
specific UI feature surfaces a real demand for filtering / sorting.

---

## 2. Deals — 12 extracted columns

Validated by inspecting deal `CEI Processing Limited` (id
`498828505295`) on 2026-05-14. Of 237 deal properties, 75 are
populated; we extract 12.

| HubSpot property | Our column | Type | NULL? | Use in app |
|---|---|---|---|---|
| `hs_object_id` | `hubspot_deal_id` | text UNIQUE | NOT NULL | Primary key on HubSpot side. |
| `hs_primary_associated_company` | `hubspot_company_id` | text FK → `companies.hubspot_company_id` | NOT NULL | **The deal↔company link.** HubSpot supports multi-company associations but always maintains a `primary` — we model it as a single FK because every BSG deal has exactly one owning company. |
| `dealname` | `name` | text | NOT NULL | Display in deal-picker. |
| `dealstage` | `stage` | text | NULL | HubSpot pipeline stage ID (e.g. `appointmentscheduled`, `decisionmakerboughtin`). Resolved to label via the cached pipeline list (§5). |
| `pipeline` | `pipeline_id` | text | NULL | HubSpot pipeline ID. Currently always `default` (= Gateway sales pipeline). Stored for forward compatibility if BSG adds a second pipeline. |
| `amount` | `amount` | numeric(14,2) | NULL | Deal value. |
| `deal_currency_code` | `currency` | text | NULL | ISO currency code (e.g. `EUR`). |
| `client` | `client_label` | text | NULL | Free-text client name set by BSG sales (e.g. `(M) Atom`). Distinct from `dealname` — sometimes more informative, sometimes less. Both displayed in the picker. |
| `agent` | `agent_label` | text | NULL | Free-text agent name (e.g. `(A) Jeremy`). Cross-references the agent-type company on the HubSpot side. |
| `business_vertical` | `business_vertical` | text | NULL | Enum (`iGaming / Betting`, …). Shown in deal context panel during calculation. |
| `createdate` | `hubspot_created_at` | timestamptz | NOT NULL | First seen. |
| `hs_lastmodifieddate` | `hubspot_modified_at` | timestamptz | NOT NULL | Incremental sync trigger (Phase 9). |

### What lives in `hubspot_raw` (NOT extracted)

Everything else, including:

- **All pricing fields**: `forecasted_monthly_volume`,
  `forecasted_transaction_count`, `transaction_fee__mdr`,
  `cost_per_transaction`, `setup_fee`, `chargeback_fee`,
  `min_monthly_fee`, `current_chargeback_rate`,
  `switzerland_share_in_total_europe_volume`,
  `united_kingdom_share_in_total_europe_volume`. The link-only
  integration model does NOT use these — the calculator is filled
  manually. (They were ~100% NULL anyway in our audit, but the
  decision stands even if sales starts filling them.)
- **All KYB / compliance**: `is_licensed`, `is_startup`,
  `license_type`, `license_issuing_authority`, `incorporation_date`,
  `operating_duration`, `company_registration_country`, `ubo_data`,
  `integration_status`, `referring_partner_or_affiliate`,
  `website_urls`, `order_reference_number`.
- **All context strings**: `business_description`, `clientele_type`,
  `monthly_volume_range`, `monthly_txn_range`,
  `processing_currencies`, `processing_jurisdictions`,
  `payment_rails`, `payout_destinations`, `apm_detail`,
  `business_vertical_other`.
- **All HubSpot analytics / engagement / lifecycle**: `hs_v2_*`,
  `hs_analytics_*`, `hs_date_entered_*`, `hs_date_exited_*`,
  `hs_time_in_*`, `num_*_engagements`, etc.

Promote on demand: if Phase 9 UI surfaces a need for, say,
`business_description` in the deal-picker, that's one migration
(`ADD COLUMN business_description text`) plus a one-line projection
update. The JSONB blob keeps the raw value available the whole time.

---

## 3. Sync model

Pull-on-demand, confirmed 2026-05-14. Flow:

1. Operator opens the document wizard's "Pick a client" step.
2. Frontend autocomplete hits `GET /api/v1/companies?search=<text>`.
3. Backend checks the local `companies` table first; if no match,
   calls HubSpot Search API (`POST /crm/v3/objects/companies/search`)
   and **upserts** matching records into our table.
4. When the operator picks a company, the backend lists its deals:
   `GET /api/v1/companies/:id/deals` → checks local cache, falls
   back to HubSpot if a deal isn't known yet.
5. Once a deal is picked, the rest of the wizard runs offline; no
   further HubSpot reads.

### Refresh policy

- A row is considered fresh if `last_synced_at` is within
  `HUBSPOT_SYNC_TTL_SECONDS` (default 300s — see `.env`).
- Stale row → background re-fetch from HubSpot during the
  search/list endpoint, applying `hubspot_modified_at`-based
  incremental update.
- No periodic cron in Phase 8. Phase 9 may add a nightly drift
  check; not required for correctness because every operator
  interaction triggers an opportunistic refresh.

---

## 4. Notes write-back format (Phase 9, stubs in Phase 8)

When BSG generates an offer or agreement document, the backend
pushes a Note onto both the Company (typeId 190) and Deal (typeId
214). The note body template:

```html
📄 <b>BSG-7100123-505295 — Offer</b><br>
Created 2026-05-14 by operator@bsg.com<br>
<a href="https://bsg-app.example.com/documents/<uuid>">View document</a>
```

The link points to our own service — operators click through from
HubSpot, view the document in our UI, never need to copy data
between systems.

### Endpoints

- **Create note**: `POST /crm/v3/objects/notes`
  - body: `{ properties: { hs_note_body, hs_timestamp }, associations: [{ to, types }] }`
  - returns `id`, stored in `documents.hubspot_links.noteId`
- **Update note** (on document re-confirm or revision):
  `PATCH /crm/v3/objects/notes/{id}` overwrites `hs_note_body`.
  Associations stay intact — no re-association needed.

### Phase 8 stub

Phase 8 reserves the DB columns (`documents.hubspot_sync_state`,
`documents.hubspot_links`, `documents.last_sync_at`,
`documents.last_sync_error`) and exposes a no-op endpoint
`POST /api/v1/documents/:id/sync` that returns
`{ hubspot_sync_state: "not_synced" }`. Phase 9 wires the actual
HubSpot calls behind that endpoint.

---

## 5. Pipeline stage reference

The Gateway sales pipeline (HubSpot pipeline id `default`) carries
these stages, in order:

| HubSpot stage id | Label | BSG document relevance |
|---|---|---|
| `appointmentscheduled` | New Referral | — |
| `qualifiedtobuy` | Qualified | — |
| `5230659805` | Pre-Approved by Bank | Operator may start building the calculator. |
| `decisionmakerboughtin` | **Proposal Sent** | ⭐ BSG offer generated. Phase 9: when operator confirms an offer, **suggest** stage transition (operator confirms in HubSpot UI; no auto-transition). |
| `contractsent` | **Proposal Confirmed** | Merchant accepted. Phase 9: similar suggestion. |
| `5230659806` | KYB Approved | KYB done. |
| `5230659807` | **Agreement signed** | ⭐ Full bundle signed. Phase 9: when our doc moves to `documents.status = confirmed` AND `document_type = agreement`, suggest transition. |
| `closedwon` | Closed Won | Deal won. |
| `closedlost` | Closed Lost | Deal lost. |

⭐ **Phase 8 does NOT auto-transition stages.** Stage movement
stays in HubSpot UI under operator control.

The stage list is **fetched once on backend startup** and cached:
`GET /crm/v3/pipelines/deals` → store labels keyed by stage id.
Re-fetched on every full sync or container restart.

---

## 6. Enum options — fetch on demand

Some HubSpot properties are enums. Fetch options once:

```
GET /crm/v3/properties/companies/{propertyName}
GET /crm/v3/properties/deals/{propertyName}
```

Response includes `options[]` with `label` + `value` pairs.

### Observed values (not exhaustive — fetch via API for full list)

| Property | Observed values |
|---|---|
| `company_type` | `referring_partner`, `direct_client` (likely `aggregating_merchant` too — schema confirmed) |
| `segment_type` | `Master_referring_partner`, `Aggregating_Merchant`, `Direct_Merchant` |
| `lifecyclestage` | `lead`, `opportunity` (HubSpot defaults) |
| `business_vertical` | `iGaming / Betting` (+ others per schema) |
| `dealstage` | See §5. |

Phase 8: cache option lists in a `hubspot_enum_options` JSONB blob
on a single config row; refresh on each manual "Sync from HubSpot"
trigger. No per-property table needed.

---

## 7. Cross-references

- `docs/hubspot_api_reference.md` — endpoints, scopes, rate limits.
- `docs/phase_08_backend_plan.md` §3 — `companies` / `deals` table
  schemas with exact column types matching the tables above.
- `docs/backend_state_schemas.md` — TS contracts for snapshot /
  document payloads.
- `docs/client_and_hubspot_workflow.md` — operator UX for the
  client picker + HubSpot link flow.
- `docs/ui_phase_8_9_requirements.md` — documents listing / view /
  clone UI.
- `docs/decisions.md` — full decision log (search for
  "Link-only HubSpot integration" and "Phase 8 HubSpot field
  selection" entries).
- `scripts/hubspot-one-company.ts` / `hubspot-merchant-and-deal.ts`
  — read-only inspection scripts used to validate this mapping.

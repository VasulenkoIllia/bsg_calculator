# HubSpot CRM API Reference — Companies + Deals

Date: 2026-05-14
Status: **Validated against the live BSG HubSpot account (2026-05-14).**

Compiled from HubSpot developer docs and confirmed by 8 live test
calls (read + write-note + delete-note) against
`Black Stripe Group LTD` HubSpot account on the EU data center.
All shapes, scopes, rate limits, and ID formats below reflect
**observed reality**, not just documentation claims.

For the BSG-specific HubSpot ↔ calculator field mapping (which
HubSpot property hydrates which calculator zone), see the companion
doc `docs/bsg_hubspot_field_mapping.md`.

This doc fulfils the deferred items from
`docs/phase_08_backend_plan.md` §13 (HubSpot API access required).

---

## 1. Versioning

HubSpot has TWO concurrent versioning schemes:

| Scheme | URL pattern | Status |
|---|---|---|
| **v3 (legacy)** | `/crm/v3/objects/{type}` | Still works during transition. **Recommended for Phase 8 start** — most docs / examples use this. |
| **2026-03 (date-based)** | `/crm/objects/2026-03/{type}` | Latest. Same semantics. Replaces v3. We migrate when stable. |

**Decision for Phase 8:** start with `/crm/v3/*`. Once we have all
endpoints working, migrate to `/crm/objects/2026-03/*` as a single PR.
Reason: most community examples + Stack Overflow answers reference v3.

Base URL: `https://api.hubapi.com`

---

## 2. Authentication

Private App token (created in HubSpot UI → Settings → Integrations →
Private Apps). Token is a long-lived bearer credential.

```http
GET /crm/v3/objects/companies HTTP/1.1
Host: api.hubapi.com
Authorization: Bearer pat-eu1-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
Content-Type: application/json
```

### 2.1 Scopes — minimum required

| Scope | Purpose |
|---|---|
| `crm.objects.companies.read` | Read company records (incl. custom properties — `Company type`, `Segment Type`, `Submitter Telegram`, `From where and whom you come to us`, `Industry Type`, etc.) |
| `crm.objects.deals.read` | Read deal records (incl. custom properties — `Deal Type`, `Priority`, `Chargeback Fee`, `Cost per Transaction`, etc.) |
| `crm.objects.contacts.read` | **Required for reading notes** — see HubSpot quirk in §2.2. |
| `crm.objects.contacts.write` | **Required for creating/updating notes** — see HubSpot quirk in §2.2. |

### 2.2 HubSpot quirk — Notes API uses Contact scopes

The intuitive scopes `crm.objects.notes.read` / `crm.objects.notes.write`
**do not exist** in the Private App scope picker for most HubSpot
accounts (including BSG's). They're not hidden — they simply aren't a
valid scope name despite appearing throughout some HubSpot docs.

Confirmed source: [Activities | Notes guide](https://developers.hubspot.com/docs/api-reference/legacy/crm/activities/notes/guide)
explicitly lists the required scopes as `crm.objects.contacts.read` +
`crm.objects.contacts.write`. The Engagements API family (notes, tasks,
calls, emails) is historically wired through Contact-level permissions
rather than having its own per-engagement scopes.

**Side-effect:** these scopes also grant read/write to Contact records
themselves (the people / email addresses). We don't need that capability
for our integration. Mitigations:

1. **Backend code rule (lint or code review):** the HubSpot client wrapper
   must NEVER call `POST/PATCH/DELETE /crm/v3/objects/contacts` or its
   batch equivalents. Only `objects/notes/*` writes are allowed.
2. **Tests:** add a regression test that scans the HubSpot client module
   for the strings `objects/contacts` outside of GET / `objects/notes`
   association payloads.
3. **Auditing:** all HubSpot writes log the endpoint URL so any
   accidental contact mutation is observable in logs.

### 2.3 Scopes — recommended (one-time discovery + UX polish)

| Scope | Purpose |
|---|---|
| `crm.schemas.companies.read` | List available custom properties on Companies — used once during dev to map our backend columns. |
| `crm.schemas.deals.read` | Same for Deals. |
| `crm.objects.owners.read` | Resolve `hubspot_owner_id` numeric → human name. Without it, deal owner shows as a number in our UI. |

### 2.4 Scopes NOT needed (deliberately omitted)

- ❌ `crm.objects.notes.read` / `crm.objects.notes.write` — these scopes don't exist in the Private App UI for BSG's account; the Notes API uses Contact scopes instead (see §2.2).
- ❌ `crm.objects.companies.sensitive.read` / `highly_sensitive.read` — only required if BSG marks specific fields as sensitive (rare; usually for PII / payment-card data). Add later if missing data is observed.
- ❌ `crm.objects.deals.sensitive.read` / `highly_sensitive.read` — same.
- ❌ `crm.objects.companies.write` / `crm.objects.deals.write` — we never modify companies or deals directly. All write-back goes through Notes (see §8.4).
- ❌ `crm.dealsplits.read_write` — commission-split tracking, not our use case.

### 2.4 Token storage

- Stored as env var `HUBSPOT_PRIVATE_APP_TOKEN` (never in DB, never in git).
- Single token for the whole BSG HubSpot account (no per-user OAuth).
- Token starts with `pat-eu1-...` for BSG (EU data center — see §2.5).

### 2.5 Region — EU

BSG HubSpot account is on the EU data center (`app-eu1.hubspot.com`).
HubSpot's API base URL `https://api.hubapi.com` works for ALL regions —
routing happens server-side. **Do NOT use region-specific API URLs**
(`https://api.hubapi.eu` or similar do not exist as public endpoints).
The `pat-eu1-` token prefix is the only EU-specific bit.

---

## 3. Rate limits

| Tier | Daily limit (per account) | Burst limit (per 10s, per app) |
|---|---|---|
| Free + Starter | 250,000 | 100 |
| Professional | 625,000 | 150 |
| Enterprise | 1,000,000 | 190 |
| With +1 API Limit Increase | +1,000,000 | 250 |

✅ **BSG account confirmed (2026-05-14):**
- Daily quota: **250,000 requests** → BSG is on Free or Starter tier.
- Burst: **100 requests per 10 seconds** + 10/sec.
- Observed response headers from a baseline call:
  ```
  x-hubspot-ratelimit-daily: 250000
  x-hubspot-ratelimit-daily-remaining: 249998
  x-hubspot-ratelimit-interval-milliseconds: 10000
  x-hubspot-ratelimit-max: 100
  x-hubspot-ratelimit-remaining: 98
  x-hubspot-ratelimit-secondly: 10
  x-hubspot-ratelimit-secondly-remaining: 9
  ```
- At 100-500 BSG documents/month + occasional manual syncs, we use
  ~0.1-0.5% of daily quota. Quota is **not** a concern.

### Response headers (every successful response)

```
X-HubSpot-RateLimit-Max:                <max per interval>
X-HubSpot-RateLimit-Remaining:          <remaining in interval>
X-HubSpot-RateLimit-Interval-Milliseconds: <interval window>
X-HubSpot-RateLimit-Daily:              <daily max>
X-HubSpot-RateLimit-Daily-Remaining:    <daily remaining>
```

### Rate limit exceeded

```
HTTP/1.1 429 Too Many Requests

{
  "status": "error",
  "message": "You have reached your daily limit.",
  "errorType": "RATE_LIMIT"
}
```

**Backend handling:** on 429, backoff exponentially (1s, 2s, 4s, 8s,
max 30s). After 5 retries fail, surface error to operator with
"HubSpot temporarily unavailable — try again in a few minutes".

### Search endpoint — stricter limits

HubSpot docs note: *"the search API has limits that are unique from
or stricter than the general limits"* + *"responses from search
endpoints will not include rate limit headers"*.

**Status:** the exact search-endpoint quotas are not in HubSpot's
public docs and we did not stress-test them (would require ~1000
back-to-back search calls). Internal HubSpot blog mentions ~5 req/sec
or 4 concurrent searches as soft limits. **For our 100-500
docs/month volume, default polling 2-3 seconds apart is safe** —
we use Search only for incremental sync (a few calls/day at most),
nowhere near any plausible quota. Re-evaluate only if 429s start
appearing in production logs.

---

## 4. Companies — endpoints

### 4.1 List all (paginated)

```http
GET /crm/v3/objects/companies?limit=100&properties=name,domain,city,country,industry&archived=false
Authorization: Bearer ...
```

**Query params:**
- `limit` — 1 to 100 (default 10).
- `after` — cursor from previous response's `paging.next.after`.
- `properties` — comma-separated list. **Without this param, only `hs_object_id` is returned.**
- `propertiesWithHistory` — for change-tracking (rarely needed).
- `associations` — e.g. `?associations=deals,contacts` includes associated record IDs.
- `archived` — `true` to also return archived rows (default `false`).

**Response shape:**

```json
{
  "results": [
    {
      "id": "12345678",
      "properties": {
        "createdate": "2026-04-12T09:15:00.000Z",
        "hs_lastmodifieddate": "2026-05-08T14:22:00.000Z",
        "hs_object_id": "12345678",
        "name": "Acme Corp",
        "domain": "acme.com",
        "city": "London",
        "country": "GB",
        "industry": "FINANCIAL_SERVICES"
      },
      "createdAt": "2026-04-12T09:15:00.000Z",
      "updatedAt": "2026-05-08T14:22:00.000Z",
      "archived": false
    }
  ],
  "paging": {
    "next": {
      "after": "100",
      "link": "https://api.hubapi.com/crm/v3/objects/companies?after=100"
    }
  }
}
```

When there are no more pages, `paging.next` is absent.

### 4.1.1 Real BSG response shape (observed 2026-05-14)

```json
{
  "id": "426418136305",
  "properties": {
    "city": null,
    "company_type": "referring_partner",
    "country": null,
    "createdate": "2026-04-17T16:02:14.684Z",
    "description": null,
    "domain": null,
    "from_where_and_whom_you_come_to_us": null,
    "hs_lastmodifieddate": "2026-04-27T14:15:25.376Z",
    "hs_object_id": "426418136305",
    "hubspot_owner_id": null,
    "industry": null,
    "industry_type": null,
    "name": "(A) Elena",
    "phone": null,
    "referral_source": null,
    "segment_type": "Master_referring_partner",
    "submitter_telegram": null
  },
  "createdAt": "2026-04-17T16:02:14.684Z",
  "updatedAt": "2026-04-27T14:15:25.376Z",
  "archived": false,
  "url": "https://app-eu1.hubspot.com/contacts/147930284/record/0-2/426418136305"
}
```

**Observations:**

- **HubSpot company ID format = 12-digit numeric string** (`426418136305`). Stable, monotonically increasing across the BSG account. Critical for our `BSG-7100000-XXXXXX` number suffix.
- **`url`** field on the root (not in `properties`) is HubSpot's UI-deep-link to the company record. Useful for backlinks from our app.
- Most fields are `null` in this test record. Real production companies are likely fuller — but our backend must handle `null` gracefully for every property.
- The full property catalogue + which ones BSG actually uses is documented in `docs/bsg_hubspot_field_mapping.md`.

### 4.2 Get by ID

```http
GET /crm/v3/objects/companies/12345678?properties=name,domain,city,country,industry&associations=deals
Authorization: Bearer ...
```

Same response shape as a single `results[]` entry above.

### 4.3 Batch read

```http
POST /crm/v3/objects/companies/batch/read
Authorization: Bearer ...
Content-Type: application/json

{
  "properties": ["name", "domain", "industry"],
  "inputs": [
    { "id": "12345678" },
    { "id": "23456789" }
  ]
}
```

**Limit:** 100 inputs per batch.

**Critical limitation:** Batch endpoint **cannot include associations**
— if you need deal links per company in bulk, use the associations
batch API (§6.2) separately.

### 4.4 Search

```http
POST /crm/v3/objects/companies/search
Authorization: Bearer ...
Content-Type: application/json

{
  "filterGroups": [
    {
      "filters": [
        { "propertyName": "name", "operator": "CONTAINS_TOKEN", "value": "*acme*" }
      ]
    }
  ],
  "properties": ["name", "domain", "industry"],
  "sorts": [{ "propertyName": "createdate", "direction": "DESCENDING" }],
  "limit": 100,
  "after": 0
}
```

See §7 for filter operators + group semantics.

---

## 5. Deals — endpoints

### 5.1 List all

```http
GET /crm/v3/objects/deals?limit=100&properties=dealname,amount,dealstage,pipeline,closedate&associations=company
Authorization: Bearer ...
```

**Default deal properties worth requesting:**

| Property | Type | Note |
|---|---|---|
| `dealname` | string | Display name |
| `amount` | decimal string | Deal monetary value |
| `dealstage` | string (internal ID) | NOT a label — e.g. `"appointmentscheduled"` or numeric string `"11348542"` |
| `pipeline` | string (internal ID) | NOT a label — e.g. `"default"` or numeric string |
| `closedate` | ISO 8601 timestamp | Expected/actual close |
| `hubspot_owner_id` | numeric string | HubSpot user ID |
| `createdate` | ISO 8601 | |
| `hs_lastmodifieddate` | ISO 8601 | |

### 5.1.1 Real BSG deal response (observed 2026-05-14)

```json
{
  "id": "498828505295",
  "properties": {
    "agent": "(A) Jeremy",
    "amount": "500000",
    "business_vertical": "iGaming / Betting",
    "client": "(M) Atom",
    "createdate": "2026-04-14T09:44:37.845Z",
    "dealname": "CEI Processing Limited",
    "dealstage": "appointmentscheduled",
    "is_licensed": "no",
    "is_startup": "yes",
    "monthly_txn_range": "500 – 2,000",
    "monthly_volume_range": "$50,000 – $500,000",
    "pipeline": "default",
    "processing_currencies": "USD, EUR, CHF, JPY, AUD, CAD, Other",
    "processing_jurisdictions": "Europe (EU / EEA), North America, ..."
    // ... 15+ more properties, most null in test deals
  },
  "associations": {
    "companies": {
      "results": [
        { "id": "426487875793", "type": "deal_to_company" },
        { "id": "426418834661", "type": "deal_to_company_unlabeled" },
        { "id": "426487875793", "type": "deal_to_company_unlabeled" }
      ]
    }
  },
  "url": "https://app-eu1.hubspot.com/contacts/147930284/record/0-3/498828505295"
}
```

**Observations:**

- **Deal ID format = 12-digit numeric string** (`498828505295`), same shape as companies.
- **`dealstage` is a word-ID string** for HubSpot defaults (`appointmentscheduled`, etc.) and a **numeric string** for BSG-added custom stages (see §6.1). Backend treats it as opaque `text`.
- **`pipeline: "default"`** — the literal word "default" is the pipeline ID even though its label is "Gateway sales pipeline".
- **`amount`** is a **stringified decimal** (`"500000"`, not `500000`). Backend Zod schema accepts both string + number forms then coerces.
- **`monthly_volume_range` / `monthly_txn_range` are enum strings** (`"$50,000 – $500,000"`, `"500 – 2,000"`). These are buckets, not exact numbers — handled differently from `forecasted_monthly_volume` which is an exact number (and was `null` in the test deal — sales hasn't filled it).
- Associations: see §8.3 for v3 string-type format used here.

### 5.2 Get by ID + 5.3 Batch read

Same patterns as companies (§4.2, §4.3). Path: `/crm/v3/objects/deals/{dealId}` and `/crm/v3/objects/deals/batch/read`.

### 5.4 Search

Same shape as companies search (§4.4) but path `/crm/v3/objects/deals/search`.

Useful filters for our case:

```json
{
  "filterGroups": [
    {
      "filters": [
        { "propertyName": "hs_lastmodifieddate", "operator": "GTE", "value": "2026-05-01T00:00:00Z" },
        { "propertyName": "pipeline", "operator": "EQ", "value": "default" }
      ]
    }
  ]
}
```

(Multiple filters within one group = AND. Multiple groups = OR.)

---

## 6. Pipelines & stages — endpoints

Needed to translate `dealstage` internal IDs into human-readable
labels for our UI.

### 6.1 List all deal pipelines

```http
GET /crm/v3/pipelines/deals
Authorization: Bearer ...
```

**Response (real BSG data, fetched 2026-05-14):**

```json
{
  "id": "default",
  "label": "Gateway sales pipeline",
  "displayOrder": 0,
  "stages": [
    { "id": "appointmentscheduled",  "label": "New Referral",        "displayOrder": 0, "probability": "0.1" },
    { "id": "qualifiedtobuy",        "label": "Qualified",           "displayOrder": 1, "probability": "0.3" },
    { "id": "5230659805",            "label": "Pre-Approved by Bank","displayOrder": 2, "probability": "0.5" },
    { "id": "decisionmakerboughtin", "label": "Proposal Sent",       "displayOrder": 3, "probability": "0.6" },
    { "id": "contractsent",          "label": "Proposal Confirmed",  "displayOrder": 4, "probability": "0.7" },
    { "id": "5230659806",            "label": "KYB Approved",        "displayOrder": 5, "probability": "0.8" },
    { "id": "5230659807",            "label": "Agreement signed",    "displayOrder": 6, "probability": "0.9" },
    { "id": "closedwon",             "label": "Closed Won",          "displayOrder": 7, "probability": "1.0" },
    { "id": "closedlost",            "label": "Closed Lost",         "displayOrder": 8, "probability": "0.0" }
  ]
}
```

**Stage ID format mix** — BSG uses HubSpot's renamed default stages
(`appointmentscheduled`, `qualifiedtobuy`, `decisionmakerboughtin`,
`contractsent`, `closedwon`, `closedlost`) AS-IS but with custom
labels. The three numeric-ID stages (`5230659805` / `5230659806` /
`5230659807`) are stages BSG added on top of the defaults. Backend
must treat `dealstage` as opaque `text` — never assume any specific
format.

### 6.1.1 Stages relevant to BSG document workflow

| Stage ID | Label | When BSG documents matter |
|---|---|---|
| `decisionmakerboughtin` | **Proposal Sent** | ⭐ Operator generates an OFFER document for the deal and shares with merchant. Phase 9 may auto-transition deal here when a BSG offer is confirmed. |
| `contractsent` | **Proposal Confirmed** | ⭐ Merchant accepted the BSG offer. Auto-transition candidate. |
| `5230659807` | **Agreement signed** | ⭐ Full MSA + Pricing Schedule signed. Likely the moment we mark our `documents.status = confirmed`. |

These three transitions are the strongest candidates for **Phase 9
deal-stage automation** (BSG document lifecycle → HubSpot deal stage
update). Phase 8 does NOT automate; operator handles in HubSpot UI.

**How we use this:**
- Sync the entire pipelines tree to a local `pipelines` + `pipeline_stages` table at the same time as companies / deals sync.
- When displaying a deal in our UI, look up `pipeline_stages.label` by `deal.dealstage` → show human-readable label.
- Refresh pipelines as part of the same "Sync from HubSpot" button click.

### 6.2 Single pipeline / stage

Rarely needed for our use case since 6.1 returns everything. But available:

```http
GET /crm/v3/pipelines/deals/{pipelineId}
GET /crm/v3/pipelines/deals/{pipelineId}/stages
GET /crm/v3/pipelines/deals/{pipelineId}/stages/{stageId}
```

---

## 7. Search — filter operators

| Operator | Meaning | Example value shape |
|---|---|---|
| `EQ` | Equal | `"value": "acme.com"` |
| `NEQ` | Not equal | `"value": "acme.com"` |
| `GT` | Greater than | `"value": "1000"` |
| `GTE` | Greater than or equal | `"value": "2026-01-01T00:00:00Z"` |
| `LT` | Less than | |
| `LTE` | Less than or equal | |
| `IN` | In a list | `"values": ["a", "b", "c"]` ← note plural |
| `NOT_IN` | Not in a list | `"values": [...]` |
| `BETWEEN` | Range | `"value": "...", "highValue": "..."` |
| `HAS_PROPERTY` | Field is non-null | no value |
| `NOT_HAS_PROPERTY` | Field is null | no value |
| `CONTAINS_TOKEN` | Substring with wildcards | `"value": "*acme*"` |
| `NOT_CONTAINS_TOKEN` | Inverse | |

**Group semantics:**
- Multiple `filters[]` within one group → **AND**.
- Multiple `filterGroups[]` → **OR**.
- Max **5 filter groups**, max **6 filters per group**, max **18 filters total** per search.

**Pagination on search:**
- `limit` — max 200 per page (default 10).
- `after` — cursor (integer). First request: omit. Subsequent: use `paging.next.after`.
- **Hard cap: 10,000 total results per search query.** If a query
  would return >10k, you must add more selective filters or split by
  date range.

---

## 8. Associations — endpoints

Used to:
- Find all deals associated with a company (or vice versa).
- Find primary company for a deal.

### 8.1 Read associations for a single record

```http
GET /crm/v4/objects/deals/12345/associations/company
Authorization: Bearer ...
```

**Response:**

```json
{
  "results": [
    {
      "toObjectId": 98765,
      "associationTypes": [
        {
          "category": "HUBSPOT_DEFINED",
          "typeId": 5,
          "label": "Primary"
        }
      ]
    }
  ]
}
```

### 8.2 Batch read associations

```http
POST /crm/v4/associations/company/deal/batch/read
Authorization: Bearer ...
Content-Type: application/json

{
  "inputs": [
    { "id": "98765" },
    { "id": "98766" }
  ]
}
```

Returns deal IDs grouped per input company.

### 8.3 Association format — observed on real BSG data

When you query a record's associations via `GET /crm/v3/objects/...?associations=company`,
HubSpot returns **string type names**, not numeric typeIds. Example
from a real BSG deal:

```json
"associations": {
  "companies": {
    "results": [
      { "id": "426487875793", "type": "deal_to_company" },
      { "id": "426418834661", "type": "deal_to_company_unlabeled" },
      { "id": "426487875793", "type": "deal_to_company_unlabeled" }
    ]
  }
}
```

**Observations:**

- `type` is a **human-readable string**, not a numeric typeId.
- The same target ID can appear **multiple times** with different
  `type` values (e.g. `deal_to_company` AND `deal_to_company_unlabeled`
  for the same company). Backend must **dedupe by `id`** when
  rendering relationships.
- `deal_to_company` = the primary/labeled association.
  `deal_to_company_unlabeled` = a secondary or unlabeled link.

| String type | Direction | Meaning |
|---|---|---|
| `deal_to_company` | deal → company | Primary association (labeled) |
| `deal_to_company_unlabeled` | deal → company | Secondary or unlabeled |
| `deal_to_contact` | deal → contact | Contact linked to the deal |
| `company_to_deal` | company → deal | Reverse direction — used when we list deals for a picked company |
| `company_to_contact` | company → contact | |

**Associations are directional** — querying with
`?associations=company` from a deal endpoint returns
`deal_to_company*` types; from a company endpoint with
`?associations=deal` returns `company_to_deal` types.

### 8.3.1 NumericassociationTypeId for WRITING associations

When **creating** a note (or any other object) and attaching it to
existing records via the `associations` field on the request body,
HubSpot requires the numeric `associationTypeId`. This is different
from the string `type` returned on reads.

| Association | category | typeId | Confirmed |
|---|---|---|---|
| Note → Company | `HUBSPOT_DEFINED` | **190** | ✅ Tested 2026-05-14 — note created successfully and visible in HubSpot UI |
| Note → Deal | `HUBSPOT_DEFINED` | **214** | 🟡 Per public docs; not yet tested against BSG. Expected to behave identically. |
| Note → Contact | `HUBSPOT_DEFINED` | **202** | Not used today; reserved. |

So the asymmetry is: **reads return string types, writes need numeric typeIds**. This is a HubSpot API quirk.

### 8.4 Writing notes back — our integration pattern

When a BSG document is created/updated, the backend writes a Note to
the related HubSpot Company (and/or Deal) so HubSpot stays the source
of truth for "what contracts exist for this client".

**One request, two associations:**

```http
POST /crm/v3/objects/notes
Authorization: Bearer ...
Content-Type: application/json

{
  "properties": {
    "hs_note_body": "📄 BSG-7100123-456789 — Offer + Agreement<br/>Created 2026-05-14 by operator@bsg.com<br/>View: https://bsg-app.example.com/documents/<uuid>",
    "hs_timestamp": "2026-05-14T15:00:00Z"
  },
  "associations": [
    {
      "to": { "id": "12345678" },
      "types": [
        { "associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 190 }
      ]
    },
    {
      "to": { "id": "98765432" },
      "types": [
        { "associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 214 }
      ]
    }
  ]
}
```

**Properties used on the note:**

| Property | Required | What we put |
|---|---|---|
| `hs_note_body` | Yes | Rich-text-ish HTML (line breaks via `<br/>`). HubSpot renders this on the activity timeline. |
| `hs_timestamp` | Recommended | When the note should appear chronologically. Without this, it gets `now()`. We use the document's `confirmed_at`. |

**Response:** standard `{ id, properties, createdAt, updatedAt }` shape.
Store `responses.id` as `documents.hubspot_note_id` so we can update
later instead of duplicating.

**To update an existing note** (e.g. when an operator clones the
document and the new draft is confirmed):

```http
PATCH /crm/v3/objects/notes/{noteId}
Authorization: Bearer ...
Content-Type: application/json

{
  "properties": {
    "hs_note_body": "... updated body ..."
  }
}
```

Associations stay unless we explicitly change them.

**Scope required:** `crm.objects.contacts.write` for writing +
`crm.objects.contacts.read` for re-reading our own notes — HubSpot
quirk where Notes API uses Contact-level permissions, see §2.2.

### 8.4.1 Validated against BSG account on 2026-05-14

A smoke-test note was created (and afterwards deleted) on a real
BSG company:

- ✅ `POST /crm/v3/objects/notes` with `associationTypeId: 190` →
  HTTP 200, note created, visible in HubSpot UI.
- ✅ `<br>` line breaks render correctly in the activity timeline.
- ✅ `<a href="https://example.com">click me</a>` renders as a
  clickable hyperlink in HubSpot UI.
- ✅ HubSpot normalises self-closing `<br/>` to `<br>` in
  `hs_note_body` after persistence (standard HTML5 behaviour).
- ✅ HubSpot adds `hs_object_source: "INTEGRATION"` and
  `hs_object_source_label: "INTEGRATION"` automatically — so anyone
  reading the note in the UI can see it came from our integration.
- ✅ `hs_body_preview` (plain-text version) and
  `hs_body_preview_html` are generated automatically from
  `hs_note_body`.
- ✅ `DELETE /crm/v3/objects/notes/:id` → HTTP 204 + subsequent
  GET → 404 (no archival residue).

Full response shape on a successful create:

```json
{
  "id": "491578110182",
  "properties": {
    "hs_body_preview": "...plain text auto-generated...",
    "hs_body_preview_html": "<html><head></head><body>...</body></html>",
    "hs_body_preview_is_truncated": "false",
    "hs_createdate": "2026-05-13T21:21:49.201Z",
    "hs_lastmodifieddate": "2026-05-13T21:21:49.201Z",
    "hs_note_body": "...HTML body sent in request...",
    "hs_obj_coords": "0-46-491578110182",
    "hs_object_id": "491578110182",
    "hs_object_source": "INTEGRATION",
    "hs_object_source_id": "39486628",
    "hs_object_source_label": "INTEGRATION",
    "hs_timestamp": "2026-05-13T21:21:48Z"
  },
  "createdAt": "2026-05-13T21:21:49.201Z",
  "updatedAt": "2026-05-13T21:21:49.201Z",
  "archived": false,
  "url": "https://app-eu1.hubspot.com/contacts/147930284/objects/0-46/views/all/list?filters=..."
}
```

Backend stores `id` as `documents.hubspot_note_id` so subsequent
updates use PATCH instead of creating duplicates.

---

## 9. Open questions — resolution status (validated 2026-05-14)

All twelve open questions resolved against the live BSG account.
Anything still 🟡 is a known-deferral, not a blocker.

| # | Question | Resolution |
|---|---|---|
| 1 | What HubSpot tier is BSG on? | ✅ **Free or Starter** — daily quota 250,000, burst 100/10s, secondly 10. |
| 2 | Full `properties` JSON on a typical Company | ✅ **263 properties total: 257 HubSpot-built-in + 6 BSG custom** (full list in `bsg_hubspot_field_mapping.md`). Custom names: `company_type`, `segment_type`, `industry_type`, `submitter_telegram`, `from_where_and_whom_you_come_to_us`, `referral_source`. |
| 3 | Full `properties` JSON on a typical Deal | ✅ **237 properties total: 201 built-in + 36 BSG custom**. Many directly map to calculator/contract fields — see `bsg_hubspot_field_mapping.md`. |
| 4 | Format of `dealstage` value? | ✅ **Mixed.** HubSpot-default stages use word-IDs (`appointmentscheduled`, `qualifiedtobuy`, `decisionmakerboughtin`, `contractsent`, `closedwon`, `closedlost`). BSG-added custom stages use numeric IDs (`5230659805`, `5230659806`, `5230659807`). |
| 5 | Format of `pipeline` value? | ✅ **String `default`** — but its `label` is "Gateway sales pipeline". The pipeline ID is the literal word "default" despite being a BSG custom pipeline (HubSpot kept the slot name). |
| 6 | All stages in `Gateway sales pipeline` | ✅ **9 stages** captured — see §6.1 below. |
| 7 | Approximate count of companies + deals | ✅ **50 companies + 8 deals.** Trivial dataset — single-request initial sync. |
| 8 | Length + format of HubSpot company / deal IDs | ✅ **12-digit numeric strings** (e.g. company `426418136305`, deal `498828505295`). |
| 9 | Pre-existing BSG-document custom properties in HubSpot? | ❌ **No.** No `bsg_document_url`, `bsg_pricing_summary`, etc. found. Phase 9 will push BSG data as free-text Notes (§8.4) or — if product wants structured fields — we provision new custom properties via the schemas API. |
| 10 | 429 error response shape | 🟡 Not observed (well below quota during testing). Public docs claim: `{"status":"error","message":"...","errorType":"RATE_LIMIT"}`. Backend retry logic uses exponential backoff regardless of body shape. |
| 11 | Does `hs_note_body` accept HTML? | ✅ **Yes.** `<br>` line breaks work; `<a href>` renders as a clickable link in HubSpot UI. Confirmed by test note that was successfully created and rendered. HubSpot normalises self-closing `<br/>` to `<br>` (standard HTML5 behaviour). |
| 12 | Confirm note↔company associationTypeId | ✅ **190 confirmed working** for `HUBSPOT_DEFINED` → note→company. Note created via `POST /crm/v3/objects/notes` with `associationTypeId: 190` succeeded and was visible on the target company. Note→deal typeId 214 documented but not test-validated; expected to work identically. |

### BSG-specific findings observed during testing

| Finding | Value | Implication |
|---|---|---|
| HubSpot region | `app-eu1.hubspot.com` | API base `https://api.hubapi.com` works (no regional URL needed). Token starts with `pat-eu1-`. |
| Account name | `Black Stripe Group LTD` | — |
| Companies naming convention | `(A) Name` = Agent (партнер), `(M) Name` = Merchant (клієнт) | Our UI can prefix-filter or display these tags. |
| `hs_object_source` on API-created notes | `INTEGRATION` | HubSpot tags Notes created via our app as "INTEGRATION" source — operators in HubSpot UI see it. |
| Sample enum values observed | `company_type`: `referring_partner` / `direct_client`. `segment_type`: `Master_referring_partner` / `Aggregating_Merchant`. | Need to fetch full enum option lists via `GET /crm/v3/properties/companies/{propertyName}` when wiring UI dropdowns. |
| Most pricing-related deal fields | `null` in real deals (e.g. `transaction_fee__mdr`, `forecasted_monthly_volume`, `setup_fee`) | Phase 9 auto-hydrate of calculator is "best-effort". Sales-team workflow discussion needed: should these be required before generating an offer? |

---

## 10. Test calls used during validation (executed 2026-05-14)

All eight calls below were run against the live BSG HubSpot account
on 2026-05-14. Results filled in the `🟡 TBD-VALIDATE` markers
throughout this doc. **Re-run these any time HubSpot changes the
account tier, adds custom properties, or revises pipeline stages** —
they're the canonical smoke-test suite for the integration.

### Call 1 — Inspect ONE company (any company, doesn't matter which)

```bash
curl -s -H "Authorization: Bearer $HS_TOKEN" \
  "https://api.hubapi.com/crm/v3/objects/companies?limit=1&properties=name,domain,city,country,industry,phone,createdate,hs_lastmodifieddate"
```

**Send the full response JSON** — we want to see every key in `properties`.

### Call 2 — Inspect ONE deal

```bash
curl -s -H "Authorization: Bearer $HS_TOKEN" \
  "https://api.hubapi.com/crm/v3/objects/deals?limit=1&properties=dealname,amount,dealstage,pipeline,closedate,hubspot_owner_id,createdate&associations=company"
```

### Call 3 — List all deal pipelines

```bash
curl -s -H "Authorization: Bearer $HS_TOKEN" \
  "https://api.hubapi.com/crm/v3/pipelines/deals"
```

### Call 4 — Count total companies + deals (so we can plan initial sync)

```bash
curl -s -X POST -H "Authorization: Bearer $HS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.hubapi.com/crm/v3/objects/companies/search" \
  -d '{"limit": 1}'
# Response includes `total` field.

curl -s -X POST -H "Authorization: Bearer $HS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.hubapi.com/crm/v3/objects/deals/search" \
  -d '{"limit": 1}'
```

### Call 5 — Check rate-limit headers

```bash
curl -i -H "Authorization: Bearer $HS_TOKEN" \
  "https://api.hubapi.com/crm/v3/objects/companies?limit=1" \
  | head -30
```

Send the headers — we confirm the `X-HubSpot-RateLimit-*` values for
BSG's tier.

### Call 6 — Inspect the BSG-specific pipeline & stages

```bash
curl -s -H "Authorization: Bearer $HS_TOKEN" \
  "https://api.hubapi.com/crm/v3/pipelines/deals" | jq
```

Confirm the list of stages in `Gateway sales pipeline` (we only see
"New Referral" in the UI). Backend needs them all + their IDs.

### Call 7 — Test creating a Note (write-back smoke test)

Once write scopes are added (`crm.objects.notes.write`):

```bash
# Replace COMPANY_ID with any test company's HubSpot ID
curl -s -X POST -H "Authorization: Bearer $HS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.hubapi.com/crm/v3/objects/notes" \
  -d '{
    "properties": {
      "hs_note_body": "Test note from BSG Calculator integration — please ignore.<br/>Created at <a href=\"https://example.com\">test link</a>.",
      "hs_timestamp": "2026-05-14T16:00:00Z"
    },
    "associations": [
      {
        "to": { "id": "COMPANY_ID" },
        "types": [
          { "associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 190 }
        ]
      }
    ]
  }' | jq
```

This confirms:
- Note creation works with our token
- `associationTypeId: 190` is correct for note→company
- `hs_note_body` HTML support (open the note in HubSpot UI after — does the link render as a clickable hyperlink or as raw `<a href=...>` text?)

### Call 8 — Inspect what the operator sees as a custom property

Some BSG custom properties have spaces and punctuation in their UI
labels (e.g. "From where and whom you come to us"). The API uses
sanitised internal names. Check what the internal name actually is:

```bash
curl -s -H "Authorization: Bearer $HS_TOKEN" \
  "https://api.hubapi.com/crm/v3/properties/companies" | jq '.results[] | {name, label, type}'
```

Same for deals:

```bash
curl -s -H "Authorization: Bearer $HS_TOKEN" \
  "https://api.hubapi.com/crm/v3/properties/deals" | jq '.results[] | {name, label, type}'
```

This gives us the full property catalogue with API names — critical
for the Zod schemas in §11.

---

## 11. Validated — codebase decisions are now concrete

With real data in hand (2026-05-14), the following are settled:

1. **`companies` table schema** — 6 BSG custom properties get named
   columns (`company_type`, `segment_type`, `industry_type`,
   `submitter_telegram`, `from_where_and_whom_you_come_to_us`,
   `referral_source`). Everything else (the 257 HubSpot built-ins)
   passes through `hubspot_raw` JSONB. Mapping in
   `docs/bsg_hubspot_field_mapping.md`.
2. **`deals` table schema** — 36 BSG custom properties; of those,
   ~14 are pricing-relevant and get named columns; the rest live in
   `hubspot_raw` JSONB.
3. **`pipelines` + `pipeline_stages` tables** — seed with one
   pipeline (`default` / "Gateway sales pipeline") and 9 stages.
   Re-sync via "Refresh from HubSpot" button.
4. **Document number suffix rule:**
   - Source ID = `deal.hubspot_deal_id` if deal is linked, else
     `company.hubspot_company_id`.
   - HubSpot IDs are 12-digit numeric strings.
   - Take **last 6 digits**, no padding needed (always ≥6 digits).
   - Example: deal `498828505295` → suffix `505295` → number
     `BSG-7100123-505295`.
5. **Zod schemas:**
   - `properties.*` fields can be `null` OR string/number → use
     `.nullable()` everywhere.
   - `amount` and other numeric fields come as **stringified
     decimals** (e.g. `"500000"`) — Zod schema accepts both via
     `z.union([z.string(), z.number()]).transform(...)`.
   - `dealstage` and `pipeline` are opaque `text` — never assume
     word-ID vs numeric.
6. **Associations dedupe rule** (§8.3) — when reading
   `?associations=company` on a deal, the same company ID can
   appear with multiple `type` values. Backend dedupes by ID and
   prefers the labeled type (`deal_to_company` over `deal_to_company_unlabeled`)
   when displaying primary company.
7. **Sync strategy:**
   - At 50 companies + 8 deals + 1 pipeline, **full sync per refresh
     is trivial** (3 requests total, well under burst limit).
   - Incremental sync (using `hs_lastmodifieddate` filter via Search
     API) becomes worth it only if companies > 1000. Defer.
8. **Note write-back format** — confirmed working via §8.4.1. HTML
   `<br>` + `<a href>` render correctly. Backend uses the format
   from §8.4 example, stores returned `id` as `documents.hubspot_note_id`.

---

## 12. Sources

Official HubSpot developer documentation (fetched 2026-05-14):

- [HubSpot CRM API overview (2026-03)](https://developers.hubspot.com/docs/api-reference/latest/overview)
- [CRM API | Companies guide](https://developers.hubspot.com/docs/api-reference/crm-companies-v3/guide)
- [CRM API | Deals guide](https://developers.hubspot.com/docs/api-reference/crm-deals-v3/guide)
- [CRM API | Pipelines guide](https://developers.hubspot.com/docs/api-reference/crm-pipelines-v3/guide)
- [CRM API | Associations guide](https://developers.hubspot.com/docs/api-reference/crm-associations-v3/guide)
- [Search the CRM](https://developers.hubspot.com/docs/api-reference/search/guide)
- [HubSpot CRM Search API Guide](https://developers.hubspot.com/docs/guides/api/crm/search)
- [API usage guidelines and limits](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines)
- [HubSpot's API usage limits and guidelines](https://developers.hubspot.com/docs/guides/apps/api-usage/usage-details)

---

## 13. Cross-references in our project

- `docs/phase_08_backend_plan.md` §10 — Phase 8 vs Phase 9 HubSpot
  split. Phase 8 reserves the schema; Phase 9 wires real API calls.
- `docs/client_and_hubspot_workflow.md` — operator workflow
  (Phase 8 manual picker → Phase 9 HubSpot sync).
- `docs/phase_08_backend_plan.md` §13 — table of deferred items
  pending HubSpot API access. This doc resolves several of them once
  test data confirms the shapes.
- `docs/backend_state_schemas.md` — our backend payload shapes.
  The `companies` + `deals` table schemas in `phase_08_backend_plan.md`
  §3 already reserve `hubspot_raw` JSONB so any shape from HubSpot
  flows through losslessly until we extract named columns.

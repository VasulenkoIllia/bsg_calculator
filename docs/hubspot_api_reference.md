# HubSpot CRM API Reference — Companies + Deals

Date: 2026-05-14
Status: **Spec skeleton — pending validation against real HubSpot test API.**

Compiled from HubSpot developer docs (see §Sources). Marked clearly
where fields / shapes need confirmation via real test calls. When you
share real responses we will replace the `🟡 TBD-VALIDATE` markers
with concrete observed values.

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
| `crm.objects.notes.write` | Create notes (we push BSG document links / pricing summaries onto the related Company or Deal as Notes — see §8.4) |
| `crm.objects.notes.read` | Read existing notes (so we don't duplicate when re-syncing) |

### 2.2 Scopes — recommended (one-time discovery + UX polish)

| Scope | Purpose |
|---|---|
| `crm.schemas.companies.read` | List available custom properties on Companies — used once during dev to map our backend columns. |
| `crm.schemas.deals.read` | Same for Deals. |
| `crm.objects.owners.read` | Resolve `hubspot_owner_id` numeric → human name. Without it, deal owner shows as a number in our UI. |

### 2.3 Scopes NOT needed (deliberately omitted)

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

🟡 **TBD-VALIDATE — what HubSpot tier is BSG account?** Confirms our
daily budget.

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

🟡 **TBD-VALIDATE** — observe headers + 429s on real test calls to
confirm the actual numbers. Internal HubSpot blog mentions ~5 req/sec
or 4 concurrent searches but the actual quota is not in the public
docs. **For our 100-500 docs/month volume, default polling 2-3
seconds apart should be safe.**

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

🟡 **TBD-VALIDATE:** confirm the exact `properties` keys BSG account
uses. Different HubSpot accounts have different custom properties.
First test call: pull ONE company, log the full `properties` object,
identify which ones we actually need vs ignore.

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

🟡 **TBD-VALIDATE:** Pull ONE deal from BSG's HubSpot. Note whether
`dealstage` / `pipeline` are word-IDs ("contractsent") or numeric
strings ("11348542"). Both forms exist in different HubSpot accounts.

**Response shape:** identical to companies (§4.1) but with deal properties.

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

**Response:**

```json
{
  "results": [
    {
      "id": "default",
      "label": "Sales Pipeline",
      "displayOrder": 0,
      "stages": [
        {
          "id": "appointmentscheduled",
          "label": "Appointment Scheduled",
          "displayOrder": 0,
          "metadata": { "probability": "0.2" },
          "archived": false
        },
        {
          "id": "qualifiedtobuy",
          "label": "Qualified to Buy",
          "displayOrder": 1,
          "metadata": { "probability": "0.4" },
          "archived": false
        },
        ...
        {
          "id": "closedwon",
          "label": "Closed Won",
          "displayOrder": 6,
          "metadata": { "probability": "1.0" },
          "archived": false
        },
        {
          "id": "closedlost",
          "label": "Closed Lost",
          "displayOrder": 7,
          "metadata": { "probability": "0.0" },
          "archived": false
        }
      ]
    }
  ]
}
```

🟡 **TBD-VALIDATE:** BSG's actual pipeline IDs + stage IDs. Custom
HubSpot accounts can have completely different pipelines (e.g.
"Partner Pipeline", "Enterprise Deals", etc.).

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

### 8.3 Default association type IDs (HUBSPOT_DEFINED)

| From → To | typeId | Notes |
|---|---|---|
| Deal → Company | 5 | Primary association |
| Deal → Contact | 3 | |
| Company → Deal | 6 | Reverse direction |
| Company → Contact | 2 | |
| Note → Company | 190 | Used when we write back a BSG note to a company (§8.4) |
| Note → Deal | 214 | Used when we write back a BSG note to a deal (§8.4) |
| Note → Contact | 202 | (reserved — not used today) |

**Associations are directional** — `deal→company` (typeId 5) is a
different lookup from `company→deal` (typeId 6). For our case (find
deals for a picked company), use **`company→deal` direction**.

🟡 **TBD-VALIDATE** — confirm `190` (note→company) and `214` (note→deal)
typeIds against a real test call. These come from public HubSpot docs
but the actual numeric IDs are account-specific and may differ. Easiest
check: create a note via the UI on a test company, then GET its
associations and read the typeId.

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

**Scope required:** `crm.objects.notes.write` (writing) +
`crm.objects.notes.read` (re-reading our own notes during sync).

**🟡 TBD-VALIDATE** — confirm:
1. Does `hs_note_body` render basic HTML (`<br/>`, `<a href=...>`) or is it plain-text-only? Public docs are inconsistent on this. Easiest check: create a note via UI with a link, GET it via API, see what `hs_note_body` contains.
2. Does association typeId 190 / 214 work as documented? Numbers vary across HubSpot tiers in some cases.

---

## 9. Open questions to validate against real test API

### Already observed from BSG HubSpot UI (2026-05-14)

These are confirmed from screenshots of the live BSG account; no API
call needed:

| ✅ Confirmed | Value |
|---|---|
| HubSpot region | EU (`app-eu1.hubspot.com`) — API base stays `api.hubapi.com` (see §2.5) |
| Account name | `Black Stripe Group LTD` |
| Has custom pipeline | Yes — `Gateway sales pipeline` (NOT the default `default` pipeline). First stage observed: `New Referral`. |
| Custom properties on Company | `Company type`, `Segment Type` (e.g. "Direct Mercahnt"), `Submitter Telegram`, `From where and whom you come to us`, `Industry Type`, `Description`, `Company owner` |
| Custom properties on Deal | `Deal Type`, `Priority`, `Chargeback Fee`, `Cost per Transaction`, `Record source` (e.g. "Integration"), `Last Contacted`, `Deal owner` |
| Standard Deal properties | `Amount` (€2,000,000 observed), `Close Date`, `Pipeline`, `Deal Stage` |
| Deals → Companies association | Confirmed bidirectional ("DEAL WITH PRIMARY COMPANY" badge visible). Multi-company deals supported (1 deal observed with 2 companies). |
| Contacts on Deal | Yes — at least one contact per deal in some cases (e.g. `Haim Samuel Garson` with email + phone) |

### Still requires API call to confirm

| # | Question | Why it matters |
|---|---|---|
| 1 | What HubSpot tier is BSG on? (Free/Starter/Pro/Enterprise) | Determines daily quota (250k / 625k / 1M). Check via UI Settings → Account & Billing. |
| 2 | Full `properties` JSON on a typical Company — get every key | Map each one to either a named column on our `companies` table or pass through as `hubspot_raw`. |
| 3 | Full `properties` JSON on a typical Deal — get every key | Same for `deals`. |
| 4 | Format of `dealstage` value: word-ID (`"newreferral"`) or numeric (`"11348542"`)? | Both forms exist. Affects our local pipeline-stage lookup table. |
| 5 | Format of `pipeline` value for "Gateway sales pipeline" — word-ID or numeric? | Same. |
| 6 | All stages in the `Gateway sales pipeline` (we only see "New Referral") | Backend needs the full set + their order + probabilities. |
| 7 | Approximate count of companies + deals in BSG | Determines initial sync strategy (single batch vs paged). |
| 8 | Length + format of HubSpot company IDs in BSG (numeric only? always same length?) | Critical for our `BSG-7100000-XXXXXX` number-suffix rule. |
| 9 | Are there custom company properties already provisioned for BSG document data (e.g. `bsg_document_url`, `bsg_pricing_summary`)? | If yes, Phase 9 can write to them as a structured alternative to free-text Notes. |
| 10 | Confirm 429 error response body shape | Backend retry logic. |
| 11 | Does `hs_note_body` accept HTML (`<br/>`, `<a>`) or plain text only? | Affects format of our pushed Notes (§8.4). |
| 12 | Confirm note→company / note→deal association typeIds (190 / 214 per public docs) | These IDs are sometimes account-specific in HubSpot. |

---

## 10. Suggested test calls — minimum set for validation

Run these against the test HubSpot when you have access. We will use
the responses to fill in `🟡 TBD-VALIDATE` markers and finalise the
backend Zod schemas.

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

## 11. After validation — what changes in the codebase

Once we have real data, the following will be finalised:

1. **`companies` table schema** — extract specific HubSpot properties
   we care about into named columns; everything else into
   `hubspot_raw` JSONB.
2. **`deals` table schema** — same approach.
3. **`pipelines` + `pipeline_stages` tables** — local mirror for
   label lookups.
4. **Document number suffix logic** — finalise the
   `BSG-7100000-XXXXXX` HubSpot ID extraction rule (numeric? last 6
   chars? padding rules?). See `phase_08_backend_plan.md` §6.
5. **Zod schemas for HubSpot inbound payloads** — strict typing of
   what we accept from the API.
6. **Sync endpoint behavior** —  decide full vs incremental sync,
   how often, what triggers it.

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

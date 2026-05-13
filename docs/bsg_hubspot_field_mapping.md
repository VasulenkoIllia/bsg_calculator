# BSG ↔ HubSpot Field Mapping

Date: 2026-05-14
Status: **Source of truth — validated against live BSG HubSpot 2026-05-14.**

Single canonical reference for which HubSpot property feeds which BSG
calculator/contract field. Used by:

- **Phase 8 sync** (read-only) — pulls these fields into our DB.
- **Phase 9 auto-hydrate** — when an operator opens the calculator
  from a HubSpot deal, the matching properties pre-fill the form.
- **Phase 9 write-back** — selected BSG outputs push back as
  structured fields (where we provision them) or as free-text
  Notes (default).

See also:
- `docs/hubspot_api_reference.md` — endpoints, rate limits, scopes.
- `docs/phase_08_backend_plan.md` §10 — Phase 8 sync mechanics.
- `docs/client_and_hubspot_workflow.md` — operator UX flow.

---

## 1. Companies — full property catalogue

### 1.1 BSG custom properties (6 total)

These six are the only non-HubSpot-built-in properties on Companies in
the BSG account. They get **dedicated columns** on our `companies`
table.

| HubSpot property | UI label | Type | Sample value | Our column | Use in app |
|---|---|---|---|---|---|
| `company_type` | Company type | enum/select | `referring_partner`, `direct_client` | `company_type` text | Distinguishes Agent vs Merchant for filters/UI. |
| `segment_type` | Segment Type | enum/select | `Master_referring_partner`, `Aggregating_Merchant`, `Direct_Merchant` | `segment_type` text | Display badge in documents listing. |
| `industry_type` | Industry Type | string/text | (often null in test data) | `industry_type` text NULL | Display only. Distinct from HubSpot's built-in `industry` enum. |
| `submitter_telegram` | Submitter Telegram | string/text | (null) | `submitter_telegram` text NULL | Display only — partner contact handle. |
| `from_where_and_whom_you_come_to_us` | From where and whom you come to us | string/text | (null) | `from_where_and_whom_you_come_to_us` text NULL | Display only. Free-form attribution. |
| `referral_source` | Referral source | string/text | (null) | `referral_source` text NULL | Display only. Cross-references the partner who introduced this merchant. |

### 1.2 HubSpot built-in properties we read

We don't extract every one of the 257 HubSpot built-ins — we read only
the ones we use. The rest passes through to `companies.hubspot_raw` JSONB.

| HubSpot property | Type | Our usage |
|---|---|---|
| `name` | string | Display name (with "(A)" / "(M)" prefix convention) |
| `domain` | string | Display + optional autocomplete from email domain |
| `city` | string | Display |
| `country` | string | Display + ISO mapping to flag |
| `industry` | enum | Display (note: BSG also has its own custom `industry_type`) |
| `phone` | string | Display |
| `description` | textarea | Display in company detail panel |
| `hubspot_owner_id` | number | Resolved via `crm.objects.owners.read` to person name |
| `createdate` | datetime | First-seen timestamp |
| `hs_lastmodifieddate` | datetime | Used for incremental sync trigger (Phase 9 if needed) |
| `hs_object_id` | string (numeric) | = `id` field — primary key on HubSpot side |

### 1.3 Properties we explicitly DON'T extract

Everything else in the 257-property HubSpot built-in catalogue:
analytics fields (`hs_analytics_*`), lifecycle stage history fields
(`hs_date_entered_*`, `hs_date_exited_*`), marketing-touch fields
(`first_conversion_*`, `hs_analytics_first_touch_*`), etc.

These are stored in `companies.hubspot_raw` JSONB so no data is lost,
but they're not extracted into named columns until/unless a feature
needs them.

---

## 2. Deals — full property catalogue

### 2.1 Pricing properties that map to the calculator

These are the **most valuable** for Phase 9 auto-hydration. When an
operator clicks "Open calculator from this deal", the calculator's
form pre-fills from these fields. Note: **in real BSG data most are
null** (sales has not standardised filling them yet).

| HubSpot property | UI label | Type | Calculator field | Notes |
|---|---|---|---|---|
| `forecasted_monthly_volume` | Forecasted Monthly Volume | number | `payinVolume` (Zone 1) | Exact monthly EUR. Often null — see §3. |
| `forecasted_transaction_count` | Forecasted Transaction Count | number | `payinTransactions` (Zone 1) | |
| `transaction_fee__mdr` | Transaction Fee / MDR (%) | number | `payinEuPricing.single.mdrPercent` (Zone 3) | |
| `cost_per_transaction` | Cost per Transaction | number | `payinEuPricing.single.trxCc` (Zone 3) | |
| `setup_fee` | Setup Fee | number | `contractSummary.accountSetupFee` (Zone 4) | One-time fee. |
| `chargeback_fee` | Chargeback Fee | number | `contractSummary.disputeCost` (Zone 4) | Per-action. |
| `min_monthly_fee` | Min Monthly Fee | number | `toggles.monthlyMinimumFeeAmount` (Zone 4) | Triggers `monthlyMinimumFeeEnabled` if > 0. |
| `current_chargeback_rate` | Current Chargeback Rate | number | (display only — informational) | Read-only context. |
| `switzerland_share_in_total_europe_volume` | Switzerland share in total EUROPE volume | number | `payinEuPricing.dedicatedCountries.chPercent` (Zone 3) ⭐ | **Maps directly to our Dedicated Countries CH%.** |
| `united_kingdom_share_in_total_europe_volume` | United Kingdom share in total EUROPE volume | number | `payinEuPricing.dedicatedCountries.ukPercent` (Zone 3) ⭐ | **Maps directly to our Dedicated Countries UK%.** Auto-toggles `enabled: true` when value > 0. |

### 2.2 Context properties for display

Not for calculation but shown in the operator's deal context panel.

| HubSpot property | UI label | Type | Our usage |
|---|---|---|---|
| `dealname` | Deal Name | string | Title at top of deal context |
| `amount` | Amount | number (stringified) | Deal monetary value — display |
| `dealstage` | Deal Stage | string (mixed format — see §6.1) | Resolved via `pipeline_stages.label` |
| `pipeline` | Pipeline | string | Resolved to "Gateway sales pipeline" |
| `closedate` | Close Date | datetime | Expected close |
| `business_vertical` | Business vertical | enum | e.g. "iGaming / Betting" |
| `business_vertical_other` | Vertical - other | string | Free-text if `business_vertical=other` |
| `business_description` | Business description | textarea | |
| `processing_currencies` | Processing currencies | string | Comma-separated list |
| `processing_currencies_other` | Currencies - other | string | |
| `processing_jurisdictions` | Processing jurisdictions | string | Region list |
| `payment_rails` | Payment rails | string | |
| `payout_destinations` | Payout destinations | string | |
| `apm_detail` | APM detail | string | Alternative Payment Methods detail |
| `clientele_type` | Clientele type | string | B2B/B2C/B2G etc. |
| `monthly_volume_range` | Monthly volume range | enum string | Bucket like "$50,000 – $500,000" — used only when the exact `forecasted_monthly_volume` is null |
| `monthly_txn_range` | Monthly txn range | enum string | Same pattern |
| `client` | Client | string | BSG-internal client name. Often duplicates `dealname` or contains `(M) ...` |
| `agent` | Agent | string | BSG-internal agent name. Cross-references `company_type=referring_partner` companies |

### 2.3 KYB / compliance properties (display only)

| HubSpot property | UI label | Notes |
|---|---|---|
| `is_licensed` | Is licensed | radio yes/no |
| `is_startup` | Is startup | radio yes/no |
| `license_type` | License type | enum |
| `license_issuing_authority` | Issuing authority | string |
| `incorporation_date` | Incorporation date | string (free-form date) |
| `operating_duration` | Operating duration | enum |
| `company_registration_country` | Company location | string |
| `ubo_data` | UBO Data (JSON) | textarea — Ultimate Beneficial Owner data as JSON string |
| `integration_status` | Integration Status | enum |
| `order_reference_number` | Order Reference Number | string |
| `referring_partner_or_affiliate` | Referring partner or affiliate | string |
| `website_urls` | Website URLs | string (potentially multiple) |

### 2.4 HubSpot built-in deal fields we use

| HubSpot property | Our usage |
|---|---|
| `dealname` | Display name |
| `amount` | Deal value display |
| `dealstage` | Pipeline stage lookup |
| `pipeline` | Pipeline lookup |
| `closedate` | Display |
| `hubspot_owner_id` | Resolved via owners API |
| `createdate` | Display |
| `hs_lastmodifieddate` | Sync trigger (Phase 9) |
| `hs_object_id` | Primary key |

### 2.5 Built-ins we explicitly skip

All `hs_analytics_*`, `hs_date_entered_*`, `hs_date_exited_*`,
`hs_v2_*` (lifecycle pipeline calculation fields), days-in-stage
metrics, etc. → captured in `deals.hubspot_raw` JSONB for forensic
inspection but not extracted to named columns.

---

## 3. Sales-team workflow gap (important)

**Observation from live data:** every pricing-related deal property
listed in §2.1 was `null` in the test deal we fetched. This means:

- **Phase 9 auto-hydrate is opportunistic, not guaranteed.** When
  a property is null, the calculator falls back to its default seed.
- **Operators will need to manually fill the calculator** for most
  current deals.
- **Long-term improvement (out of Phase 8 scope):** discuss with
  sales whether deals at stage `Pre-Approved by Bank` or later
  should have these pricing properties **required** before an
  operator generates a BSG offer. This could be enforced via:
  - HubSpot UI required-field rules at pipeline stage transitions
  - A pre-check on our backend's "Open calculator from deal" endpoint
    that warns the operator if critical fields are missing

**Phase 8 behavior:** sync the values as-is. Phase 9 auto-hydrate
uses whatever exists. No backend rules enforce sales workflow.

---

## 4. Notes write-back format

When BSG generates an offer document, the backend pushes a Note onto
both the related Company (typeId 190) and Deal (typeId 214). The note
body uses this template:

```html
📄 <b>BSG-7100123-505295 — Offer</b><br>
Created 2026-05-14 by operator@bsg.com<br>
<a href="https://bsg-app.example.com/documents/<uuid>">View document</a>
```

(Phase 8 publishes Notes manually via operator action; Phase 9 may
auto-publish on `documents.status → confirmed`.)

When an existing note (tracked by `documents.hubspot_note_id`)
needs updating (e.g. operator confirms a draft, or generates a
new revision), the backend uses `PATCH /crm/v3/objects/notes/{id}`
to overwrite `hs_note_body`. Associations stay intact.

---

## 5. Pipeline stage → BSG document workflow

| HubSpot stage | Label | BSG document trigger | Auto-action |
|---|---|---|---|
| `appointmentscheduled` | New Referral | — | — |
| `qualifiedtobuy` | Qualified | — | — |
| `5230659805` | Pre-Approved by Bank | Operator may start building calc | — |
| `decisionmakerboughtin` | **Proposal Sent** | ⭐ BSG offer generated | Phase 9: when operator confirms an offer, **suggest** stage transition here (don't auto-do it — operator confirms in HubSpot UI). |
| `contractsent` | **Proposal Confirmed** | Merchant accepted | Phase 9: similar suggestion. |
| `5230659806` | KYB Approved | KYB done | — |
| `5230659807` | **Agreement signed** | ⭐ Full bundle signed | Phase 9: when our doc moves to `documents.status = confirmed` AND `document_type = agreement`, suggest transition. |
| `closedwon` | Closed Won | Deal won | — |
| `closedlost` | Closed Lost | Deal lost | — |

⭐ Phase 8 has **no auto-transitions**. Operator manages stage
movement in HubSpot UI. Phase 9 may add suggestions / confirmations.

---

## 6. Sample enum option lists (TBD — fetch when wiring UI dropdowns)

When building any UI control that lists allowed enum values, fetch
the option list via:

```
GET /crm/v3/properties/companies/{propertyName}
GET /crm/v3/properties/deals/{propertyName}
```

The response includes an `options[]` array with `label` + `value`
pairs.

**Confirmed enum values observed in real data** (not exhaustive —
fetch via API for the complete authoritative list):

| Property | Observed values |
|---|---|
| `company_type` | `referring_partner`, `direct_client` |
| `segment_type` | `Master_referring_partner`, `Aggregating_Merchant` |
| `business_vertical` | `iGaming / Betting` (+ likely others) |
| `is_licensed` | `yes`, `no` |
| `is_startup` | `yes`, `no` |
| `monthly_volume_range` | `$50,000 – $500,000` (one of several buckets) |
| `monthly_txn_range` | `500 – 2,000` (one of several buckets) |

Phase 8 backend: fetch full option lists once during initial sync,
store in `companies_property_options` and `deals_property_options`
lookup tables (or in a single `hubspot_enum_options` JSONB blob on a
config row). Refresh on each "Sync from HubSpot" trigger.

---

## 7. Cross-references

- `docs/hubspot_api_reference.md` — endpoints, scopes, rate limits.
- `docs/phase_08_backend_plan.md` — Phase 8 backend orchestration.
- `docs/backend_state_schemas.md` — TS contracts for snapshot/document payloads.
- `docs/client_and_hubspot_workflow.md` — operator UX for client picker + HubSpot link.
- `docs/ui_phase_8_9_requirements.md` — documents listing / view / clone UI.
- `docs/calculator_logic_and_formulas.md` — calculator math (target of auto-hydration).
- `docs/decisions.md` — full decision log.

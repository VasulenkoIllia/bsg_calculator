# HubSpot → monday.com: cutover plan + critical risk analysis

Date: 2026-08-22, revised 2026-08-27. **Hard deadline: HubSpot stops working after 2026-08-31 — 4 days left.**
Companion to `docs/monday_migration_analysis.md` (code inventory) — this file is
the operational plan: what we sync, how it maps to monday, what breaks on the
deadline, and in which order we do it.

Everything below is validated against the live monday account
(`BlackStripeGroup`, plan **pro**) and the restored prod copy `bsg_prodcopy`
(76 companies / 28 deals / 62 documents / 35 calc-configs, dump of 2026-08-22).

---

## 0. Operating model — the end-to-end scenario

Written so nothing has to be guessed later. Decisions marked **DECIDED** are
fixed; the rest is in §7.

### 0.0 Decision log (product owner, 2026-08-22)

| # | Decision |
|---|---|
| D1 | **Clients come from monday** from cutover on. Consequence the team must be told: a client created only in HubSpot after cutover never reaches us — new clients are created in monday. |
| D2 | **Notes are written only to monday.** The 34 existing HubSpot Notes stay as history and die with the HubSpot account. No dual-write. |
| D3 | **REVISED 2026-08-27 — one note, same rule as HubSpot today:** document pinned to a deal → the update goes on the **deal** card; no deal, or a deal exists but this document is not pinned to it → the update goes on the **client** card. One stored note id, one API call, no partial-failure state. (Supersedes the earlier "both cards" decision.) |
| D4 | Numbering: already-issued `documents.number` never changes; new documents take the suffix from the monday item id. Mixed suffixes per client accepted. |
| D5 | Add a `BSG ID` text column to Companies (M) + Agents (A) holding our company UUID (auto-heal after an item is deleted and recreated). |
| D6 | Webhooks: simple auth — unguessable secret path segment, payload used only as a trigger, every field re-read from the API. |
| D7 | The 5 test companies are purged at the very end. |
| D8 | An explicit **era marker** distinguishes HubSpot-era rows from monday-era rows so the delete path knows which system (if any) to tear a note down in. The HubSpot path must keep working until 2026-08-31. |
| D9 | No implementation starts until the audit + final plan are reviewed. Everything is tested on the local prod copy first; test clients may be created in monday for end-to-end checks. |
| D10 | **The monday board structure as of 2026-08-27 is FINAL.** Between 2026-08-22 and 2026-08-27 the boards were rebuilt: `dropdown_mm6b150e` (Company type), `dropdown_mm6btcce` (Lifecycle Stage), `dropdown_mm6bfakw` (Partner Status) and `dropdown_mm6epmzw` (Deal Stage) were **deleted**; status columns `color_mm6hp7ht` (Companies) / `color_mm6hfzy3` (Deals) / `color_mm6hgbtv` (Agents) replaced them, and groups now mirror the funnel. Item counts moved 64→72 companies, 43→42 agents, 31 deals (+SETTLIX 662149). Consequence: **the adapter must resolve columns by title+type at boot and fail loudly if one is missing — never hardcode an id and never write NULL silently.** |
| D11 | Deleting a client in monday must NEVER delete our data when work exists against it. Rules: owns documents **or calc-configs** → keep the row, stamp `crm_deleted_at`, drop its deals, refuse new notes (today the guard covers documents only — calc-configs are `ON DELETE CASCADE` and would be lost; this is fixed as part of the migration). Owns nothing → hard delete. Archive == delete; restore clears the flag. **Absence from a backfill is never a delete** — only an explicit `item_deleted` event may hard-delete. |

**Still open — must be answered by the final plan:** exactly *which markers* decide
that a monday client is synced into our system (board membership alone, or a
status/label as well). See §0.1–§0.2 for the data and the current
recommendation (board membership only, no gating status).

### 0.1 Who we sync, and what "status" means

| monday board | Sync? | Lands in our `companies.company_type` as | Why |
|---|---|---|---|
| **Companies (M) (Gateway)** `5102466967` (64) | yes, **all items** | `direct_client` | the merchants we write documents for |
| **Agents (A)** `5102466950` (43) | yes, **all items** | `referring_partner` | one of them owns a document today (`(A) ConsultiPay`), and deals reference agents |
| **Deals (Gateway)** `5102466996` (31) | yes, all | — | documents can be pinned to a deal |
| Contacts `5102466985` (37) | **no** | — | we never use contacts; syncing them buys nothing |
| Test `5102348757` | no | — | unrelated board |

**Board membership replaces the old `HUBSPOT_COMPANY_TYPE_FILTER`.** Mapping the
board onto the existing `company_type` values means every UI filter we already
have (the wizard's client picker shows only `direct_client`, the companies list,
the typeahead) keeps working **unchanged**.

**Consequence to expect:** our companies table grows from 76 to ~107 rows,
because agents were never cached before. They will be visible in the admin
companies list (filterable), but NOT in the client picker.

### 0.2 Does a new client need a status? — **recommendation: no gating status**

The question is whether a monday client should reach our system only after
someone sets a status (e.g. `Lifecycle Stage = Opportunity`).

**Recommendation: sync everything on the board, use status for display only.**

- `Company type` is already 62/64 `Client` — the *board* is the real filter.
- `Lifecycle Stage` is filled 64/64 (`Lead` 29 / `Opportunity` 22 /
  `Disqualified` 13) and is genuinely informative → show it as a badge and as an
  optional list filter.
- `Partner Status` is empty on 62/64 — unusable as a gate.

**What a gating status would cost us** — this is exactly the mechanism that hurt
us on HubSpot, so it is worth stating plainly. Today a company whose type stops
matching the filter is:
1. marked `filtered_out` by the webhook processor — meaning **every subsequent
   update to it is silently ignored**, and
2. **deleted** by the backfill's cleanup pass (`hubspot-backfill.ts`
   `cleanupNonMatching`), together with its deals.

The only thing standing between that and data loss today is a `NOT EXISTS
(SELECT 1 FROM documents …)` guard which skips document-owning companies. A
client who merely has a saved calculator and no document yet is **not** protected
by that guard (calc-configs are `ON DELETE CASCADE`).

**So: in the monday design we drop the destructive filter entirely.** Nothing is
ever deleted because of a status. If the operator later wants "hide disqualified
clients", that is a UI filter, not a delete.

**If the status is removed / changed in monday** (e.g. `Opportunity` →
`Disqualified`): we simply store the new value. The client stays, its documents
stay, its calculators stay. Only the badge changes.

### 0.3 Lifecycle: a new client appears in monday

1. Manager creates an item on Companies (M).
2. monday fires `create_item` → our endpoint ACKs immediately and queues the
   event.
3. The worker (5 s tick) **re-fetches the item from the API** (never trusts the
   payload) and upserts a row.
4. The client is selectable in the wizard/calculator within ~5–10 s.

Until webhooks exist (they are the last work item), the same happens on:
- the operator pressing **Refresh**, or
- the scheduled backfill.

### 0.4 Lifecycle: something changes in monday

| Change | Event | Our reaction |
|---|---|---|
| renamed | `change_name` | re-fetch → update `name` |
| dropdown changed | `change_column_value` | re-fetch → update the mapped column |
| deal linked/unlinked | `change_column_value` on the relation | re-fetch → re-point `deals.crm_company_id` |
| item deleted | `item_deleted` | owns documents → flag `crm_deleted_at` + keep everything; owns nothing → delete the row |
| item archived | `item_archived` | same as deleted (archived items are invisible to `items_page`) |
| item restored | `item_restored` | re-fetch → upsert, clear the flag |
| item deleted **and recreated** | `item_deleted` + `create_item` | new item id → the `BSG ID` column carries our UUID, so the reconcile script re-binds automatically (**DECIDED: add the column**) |

### 0.5 Lifecycle: a document is created in our system

1. Operator picks a client (and optionally a deal) and saves the document.
2. The number `BSG-<seq>-<last 6 digits of the monday item id>` is allocated
   (**DECIDED**: new documents take the suffix from the monday id; already-issued
   numbers never change).
3. After the transaction commits, a background job posts the update **on the
   client card**, and — if the document is pinned to a deal — **a second update on
   the deal card** (**DECIDED**).
4. The badge flips `not_synced → synced`; a failure leaves `failed` + a Retry
   button. History records `synced_to_crm` / `sync_failed`.
5. Deleting the document tears down both updates, then soft-deletes the row.

### 0.6 Backfill — the safety net (redesigned)

Runs on demand and on a schedule (proposed: hourly). Differences from the HubSpot
version:
- **no cleanup/delete pass** — the backfill only inserts and updates;
- items present in our DB but missing from the board are **flagged**
  (`crm_deleted_at`), never deleted;
- covers all three boards.

This is what keeps the cache correct even if a webhook is lost, and it is why
shipping webhooks last is acceptable.

---

## 1. Everything we do FROM HubSpot and TO HubSpot, mapped to monday

### 1.1 Reads (HubSpot → our cache)

| # | What we do today | Code | monday equivalent | Effort |
|---|---|---|---|---|
| R1 | Backfill companies filtered by `company_type=direct_client` (Search API) | `hubspot-backfill.ts` | `items_page` on **Companies (M) `5102466967`**; the type filter is replaced by *board choice* (merchants vs Agents `5102466950`) | S |
| R2 | Backfill deals + resolve parent company (primary → fallback) | `hubspot-backfill.ts`, `extractDealCompanyCandidates` | `items_page` on **Deals `5102466996`**; parent from `board_relation_mm6bmb7` — filled **31/31** (read it via `... on BoardRelationValue { linked_item_ids }`; the generic `text`/`value` fields are null for relation columns) | S |
| R3 | TTL refresh on every stale GET | `shared/ttl-refresh.ts` + companies/deals services | `items(ids:[…]) { column_values }` — same pattern, same TTL | S |
| R4 | Deal pipeline + stage labels, cached 1 h | `hubspot.service.ts`, `GET /hubspot/pipelines` | Dropdown `settings_str` of `dropdown_mm6epmzw` ("Deal Stage") on the Deals board — same cache shape | S |
| R5 | Inbound webhooks → event queue → cache upsert/delete | `webhooks/**` | `create_webhook` per board × event; see §3 | L |
| R6 | Manual operator refresh (`POST /hubspot/refresh`) | `webhooks.controller.ts` | Same endpoint, monday fetch underneath | S |
| R7 | Company merge / merged-alias self-heal | `companies.merge.service.ts` | **Nothing — monday has no merge.** Retired (see §5 risk M1) | — |
| R8 | Deleted-upstream handling (`hubspot_deleted_at`) | `webhooks.processor.ts` | `item_deleted` / `item_archived` webhooks + "not returned by `items_page`" | M |
| R9 | Readiness probe pings HubSpot | `health.routes.ts` → `/ready` | `query { me { id } }` | S |

### 1.2 Writes (our system → HubSpot)

We never write company/deal fields upstream. The **only** write is the Note.

| # | What we do today | Code | monday equivalent |
|---|---|---|---|
| W1 | `createNote` + `associateNoteWith` (deal if pinned, else company) on document create/sync | `documents/sync.service.ts` | **one** call: `create_update(item_id, body)` — the association *is* the item id |
| W2 | Same for calc-configs | `calculator-configs/sync.service.ts` | same |
| W3 | `deleteNote` on document/calc delete | `documents.service.ts`, `calculator-configs.service.ts` | `delete_update(id)` |
| W4 | (never used) `updateNote` | `hubspot.client.ts` | `edit_update` |

**Simplification:** two HubSpot calls (create + associate) collapse into one
monday call, and the "association failed but the Note exists" half-state
disappears entirely — that whole error branch in `sync.service.ts` goes away.

### 1.3 The Note itself (the operator brief: "deal data in the client's note")

Today: `Offer BSG-7100062-750018 // Company: (M) SKOGOS // Created … by … ` + a
`Link` to our SPA, posted on the **deal** when the document is pinned to one,
otherwise on the company.

**DECIDED 2026-08-22 (Q1): post to BOTH cards.** The update always goes on the
**Company (M)** item; when the document is pinned to a deal it *also* goes on the
**Deal** item (8 of 62 documents today). Schema consequence: `documents` and
`calculator_configs` need **two** note ids (`crm_company_note_id`,
`crm_deal_note_id`), the delete flow tears down both, and a partial failure
(company update created, deal update failed) must land in `failed` with the id it
did create. Cost: ~+0.5 day.

Body:

```
Offer BSG-7100062-750018 // Company: SKOGOS SOLUTIONS INC. // Deal: BSPOK IT Solutions LTD (662129)
Created 22.08.2026, 15:40 by Admin (admin@bsg.test)
Link
```

`create_update` accepts HTML, so the builder in `shared/hubspot/note-builder.ts`
is reused nearly verbatim.

---

## 2. Data mapping (validated against live boards)

### Companies (M) `5102466967` — 64 items

| Our column | monday source |
|---|---|
| `crm_company_id` (new) | item `id` |
| `name` | item `name` (monday has **no** `(M) ` prefix) |
| `company_type` | `dropdown_mm6b150e` "Company type" (label, e.g. `Client`) |
| `segment_type` | `dropdown_mm6bzwfm` (e.g. `Direct Mercahnt` — typo carried over from HubSpot) |
| `lifecycle_stage` | `dropdown_mm6btcce` (e.g. `Lead`) |
| — | `dropdown_mm6bfakw` "Partner Status" (new, not in our schema) |
| `hubspot_created_at` / `_modified_at` | item `created_at` / `updated_at` |
| `crm_raw` | full `column_values` array |

Agents (A) `5102466950` has the same shape **plus `text_mm6b8spx` "Id"** holding
the original HubSpot company id. One of our document-owning companies —
`(A) ConsultiPay / Monepik Limited` — lives there, so the agents board must be
synced too, not just merchants.

### Deals `5102466996` — 31 items

| Our column | monday source |
|---|---|
| `crm_deal_id` (new) | item `id` |
| `name` | item `name` (`"BSPOK IT Solutions LTD (662129)"`) |
| `stage` | `dropdown_mm6epmzw` "Deal Stage" (label, e.g. `New Referral`) |
| parent company | `board_relation_mm6bmb7` "Company (M)" — filled 31/31 |
| (order ref) | `text_mm6b2j7s` — the migration key, 28/28 match |
| `amount`, `currency`, `business_vertical`, `client_label`, `agent_label`, `pipeline_id` | **do not exist in monday** → stay NULL |

---

## 3. Webhooks in monday — concrete configuration

monday has no portal-wide subscription UI: each webhook is one
`create_webhook(board_id, url, event)` mutation, so we provision them from a
script and store the returned ids.

**Endpoint:** `POST /api/v1/monday/webhooks/:secret` (see auth below).

**Handshake:** the first POST carries `{"challenge":"…"}` and must be echoed back
verbatim as JSON. No signature check may run before that response.

**Events to subscribe, per board** (Companies (M), Agents (A), Deals):

| Event | Handling (maps onto the existing processor) |
|---|---|
| `create_item` | fetch item → upsert |
| `change_column_value` | fetch item → upsert |
| `change_name` | fetch item → upsert |
| `item_deleted` | `deleteOrMark…` (documents-owning row is flagged, not deleted) |
| `item_archived` | same as deleted (archived items vanish from `items_page`) |
| `item_restored` | fetch → upsert, clear the flag |

18 subscriptions total (6 × 3 boards). Not needed: `create_update` /
`edit_update` (we author those ourselves — subscribing would echo our own writes
back at us).

**Authentication — decision Q2.** A webhook created with a *personal token* is
**not signed** (JWT signing exists only for webhooks created by a registered
monday **app** with a Signing Secret). Two options:

- **A (recommended, 1 day):** unguessable secret in the path + our existing rate
  limiter + **always re-fetch the item from the API instead of trusting the
  payload** (the current HubSpot processor already works this way). A forged
  request can then at worst trigger a re-fetch of an item id — no data can be
  injected.
- **B (3–4 days):** register a monday app, use JWT + Signing Secret. Cleaner, but
  it is a separate approval/setup track with the deadline this close.

**Delivery:** monday retries once a minute for 30 minutes. Our `*_webhook_events`
queue, idempotency key, retry budget and backoff design port over unchanged —
only the payload parser and the fetch call change.

**Edge behaviour observed:** the API sits behind Cloudflare and answered a burst
of 3 discovery queries with an **HTML 429**. The client needs backoff even far
below the documented per-minute limits (already implemented in
`scripts/monday-inspect.ts`).

---

## 4. Document numbering — the part that touches signed PDFs

Today `numbering.service.ts` builds `BSG-<7-digit sequence>-<last 6 digits of
hubspot_company_id>`, e.g. `BSG-7100062-750018` from company `442300750018`.

Facts:
- The number is **persisted** in `documents.number`; it is not recomputed on
  read. Existing numbers therefore cannot change by accident — they are already
  printed in signed PDFs.
- Uniqueness comes from the 7-digit sequence, **not** from the suffix. The suffix
  is context only, so a source change carries no functional collision risk.
- monday item ids are 10 digits (`3170219470`) → the format survives unchanged
  (`…-219470`).

**Options**

| | Behaviour | Verdict |
|---|---|---|
| A | New documents take the suffix from the monday item id | Simple, but the *same client* gets two different suffixes before/after cutover |
| B | **Add `companies.document_number_suffix`**, populated at migration from the current HubSpot id and used from then on | **Recommended** — per-client continuity is preserved forever, and numbering stops depending on any CRM at all |
| C | Change the number format | Rejected — the format is in signed documents |

Option B is ~20 lines plus a migration, and it removes a whole class of future
risk: the next CRM change would not touch numbering at all. New companies (that
never existed in HubSpot) get their suffix from the monday item id.

---

## 5. What breaks on 2026-08-31 — critical risk register

| # | Risk | Sev | Likelihood | Impact today | Mitigation |
|---|---|---|---|---|---|
| **C1** | **Documents and calc-configs become undeletable.** `deleteDocument` / `deleteCalculatorConfig` refuse to proceed when a row has `hubspot_note_id` and HubSpot is unconfigured (`ValidationError`), and if the token is merely revoked the `deleteNote` call fails → `delete_failed`, row survives. | **Critical** | **Certain** | **34 live documents + 3 calc-configs** hold note ids | Cutover SQL: move `hubspot_note_id` → `legacy_hubspot_note_id`, reset state so the teardown branch is skipped. Notes die with the HubSpot account anyway |
| **C2** | Auto-sync on create keeps firing at a dead API → every new document lands in `failed` with a red badge, operators are trained to click Retry forever | High | Certain | all new documents | Switch `AUTO_SYNC_TO_HUBSPOT` → monday adapter, or set it false before the 31st |
| **C3** | ~~Deals→Company relations missing~~ **RESOLVED 2026-08-22**: relations are filled 31/31. Verified against our DB: 25/28 identical, 0 unlinked, 3 differ — and in all 3 monday is *correct* while our cache carries the HubSpot agent-as-primary mis-association (`(A) Daykkhin.com`, `(A) ConsultiPay ×2`); none of the 3 owns documents. The migration silently fixes them | — | — | none | none needed; no writes to monday required |
| **C4** | monday item ids are the only binding we have; if an operator deletes and recreates an item, the link breaks (the "deleted in CRM" badge makes it visible, but re-binding is manual) | High | Medium | any company | **DECIDED: add the `BSG ID` text column** on Companies (M) + Agents (A), store our company UUID → the reconcile script re-binds automatically ("auto-heal") |
| C5 | `/ready` returns 503 forever once HubSpot 401s (`health.routes.ts`) | Medium | Certain | monitoring only — Docker's HEALTHCHECK uses `/health`, which does **not** touch HubSpot, so no restart loop | Remove the HubSpot check in the same PR |
| C6 | 7 duplicate company pairs in our cache map onto 1 monday item each (3 of them with documents on only one side) | Medium | Certain | 4 documents | Fold duplicates with the existing merge service **before** the remap |
| C7 | Webhook processor burns 5 retries × N events against a dead API, floods logs, 401 circuit-breaker trips every batch | Medium | Certain | ops noise | Stop the processor / switch it to monday in the same deploy |
| C8 | Unsigned monday webhooks | Low | — | forged event = a re-fetch of an item id | **DECIDED: simple option** — unguessable secret in the path, rate limiter, and the payload is used only as a trigger: every field is re-read from the API with our own token |
| **C11** | We store dropdown **labels** as text (`Direct Mercahnt`, `Opportunity`). Renaming a label in monday silently changes the stored value, and anything filtering on that text breaks | Medium | Medium | company_type / segment / lifecycle / deal stage | Store the label **id** alongside the text and key our logic on the id; log a warn when a known id changes its label |
| **C12** | Two updates per document (client + deal) are two non-idempotent calls: the first can succeed and the second fail | Medium | Low | 8 of 62 documents | One advisory lock for the whole sequence; persist whichever id was created; `failed` state + Retry re-posts only the missing one |
| **C13** | Board membership is not a perfect proxy for type — 1 item on Companies (M) is a `Referring Partner` and 1 has no type at all | Low | Certain | 2 rows | Board decides `company_type`; log a warn on the mismatch so sales can fix it in monday |
| **C14** | Our companies list grows 76 → ~107 (agents were never cached) — operators will notice new rows | Low | Certain | admin list | Agents are `referring_partner`, so the wizard's client picker is unaffected; add a type filter to the list |
| C9 | monday deals carry no amount/currency/vertical → columns go NULL, any UI that shows them looks broken | Low | Certain | deals UI | Hide the columns or accept NULL — cosmetic |
| C10 | Daily API budget (Pro: ~10k calls/day) | Low | Low | — | Our volume is ~100 items; TTL refresh + webhooks stay far below |
| M1 | Merge/self-heal machinery is retired with nothing equivalent upstream | Low | — | drift detection | `item_deleted`/`item_archived` + the reconcile script (re-pointed at monday) |

---

## 6. Plan for the 9 days

**Day 1 (22.08) — decisions + data hygiene.** Answer Q2, Q4 (§7). Fold the 7
duplicate pairs on prod via the merge service. Add the `BSG ID` text column to
Companies (M) and Agents (A) and fill it from our matching table.

**Day 2–3 (23–24.08) — CRM port + monday read adapter.** Additive migration
(`crm_provider`, `crm_company_id`, `crm_deal_id`, `crm_raw`, `crm_note_id`,
`legacy_hubspot_note_id`, `companies.document_number_suffix`); GraphQL client
with backoff; mapper for `column_values`; backfill over three boards; TTL
refresh; stage labels from the dropdown settings.

**Day 4 (25.08) — write-back + numbering.** `create_update` / `delete_update`,
note body with the deal line, numbering switched to
`companies.document_number_suffix`.

**Day 5 (26.08) — dry-run on `bsg_prodcopy`.** Apply `crm_id_map`, then assert:
62 documents and 35 calc-configs still resolve to a company, all 28 deals keep
their parent, no `documents.number` changed, PDF renders for a sample of 5.

**Day 6 (27.08) — prod cutover.** Fresh dump → apply remap → deploy with the
monday adapter live and HubSpot disabled → run C1 cutover SQL → smoke-test:
create a document, check the update appears on the client card, delete it, check
the update disappears.

**Day 7–8 (28–29.08) — webhooks (may slip into September).** Provisioning script,
challenge endpoint, processor rewrite, 18 subscriptions, monitoring for a full
day. Deliberately the LAST item: until they exist, a new client created in monday
does not reach us automatically — the gap is covered by the manual Refresh button
and a scheduled backfill, which is acceptable at 76 companies.

**Day 9 (30–31.08) — buffer + HubSpot switch-off.** Verify no code path calls
`api.hubapi.com`; remove the token from prod env.

**If the schedule slips**, the non-negotiable minimum before the 31st is:
C1 cutover SQL + C2 (auto-sync off / switched) + write-back on monday +
numbering. Reads can survive for a while on a manual backfill, and webhooks can
land in the following week — TTL refresh plus the manual Refresh button cover the
gap.

---

## 7. Decisions needed before implementation

- ~~**Q1** where the update goes~~ — **DECIDED: both cards** (company always,
  deal when the document is pinned to one).
- **Q2** Webhook auth: secret path + always-re-fetch (recommended, 1 day) or a
  registered monday app with JWT (3–4 days)?
- ~~**Q3** write Deals→Company relations into monday~~ — **moot**, the relations
  are already there (31/31, verified 2026-08-22).
- **Q4** May we add a `BSG ID` text column on the two company boards (and fill
  it)? This is what makes the binding survivable long-term.
- **Q5** Numbering: option B (per-company frozen suffix, recommended) or option A
  (monday id for new documents)?
- ~~**Q6** the 5 test companies~~ — **DECIDED: purge at the very end**, after the
  migration is done and verified.

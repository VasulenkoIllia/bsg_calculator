# HubSpot → monday.com — migration plan v2 (authoritative)

Revised **2026-08-27** after a 9-agent cross-audit (5 inventories → 3 adversarial
reviews → synthesis). Supersedes v1, archived at
`docs/archive/monday_migration_plan_v1_archived.md`. Where v1 and this file
disagree, **this file wins** — §1 lists every retraction explicitly.

**Deadline: HubSpot stops after 2026-08-31. Real budget = Thu 28 / Fri 29 /
Mon 31 = 3 business days.** Zero implementation exists today
(`grep -rl monday server/ src/` → 0 files, newest migration 0019).

**The goal is therefore re-scoped: "safe without HubSpot by 8/31", NOT "monday
parity by 8/31".** Full parity (write-back, webhooks, UI rename) lands in
September. §7 lists what we consciously do not do this week.

### Verified on 2026-08-27 (write access confirmed; numbers re-checked on today's prod dump)

- **`bsg_prodcopy` now holds the 2026-08-27 02:50 prod dump** (restored, 0 errors),
  pulled from the FTP archive over SSH keys. The nightly `pg_dump` cron is proven:
  six daily dumps present (08-22 … 08-27), distinct checksums.
- **Prod data has not changed since 2026-08-22**: 76 companies / 28 deals /
  62 documents (35 alive) / 35 calc-configs / 8 users, and the gate numbers hold
  exactly — **34** live documents and **3** calc-configs carry a note id,
  **8** documents are deal-pinned, **5** companies are flagged deleted-in-HubSpot.
  The team has effectively moved its CRM work to monday already.

- **monday write scope WORKS with the current personal token.** Probe on the Test
  board: `create_item` → `create_update` → read back → `delete_update` → verify
  empty, all ✅. The update body is stored as **HTML with the `<a href>` link
  intact**; author renders as "IT Department". Cost ~1 000 complexity per
  mutation. **No monday App registration is needed — WS11 is unblocked.**
  Test item `3189386930` ("TEST ILLIA SYNC") left on the Test board.
- **`BSG ID` text columns created** (D5): Companies (M) → `text_mm6md0ww`,
  Agents (A) → `text_mm6mrvtb`.
- ✅ **Subscription confirmed as being paid** (operator, 2026-08-27). Re-run
  the account probe after payment lands: the trial reports `plan: null` and a
  1M/min complexity budget, a paid Pro reports a `plan` object and 10M/min.
  Until that is confirmed, treat the lower budget as the operating limit.
- ⚠️ **THE ACCOUNT IS ON A TRIAL THAT EXPIRES IN ~4 DAYS** (UI banner
  "You have 4 days left on your trial", ~2026-08-31 — the same day HubSpot dies).
  The API confirms it: `tier: "pro"` but **`plan: null`** (no paid subscription
  attached) and `complexity.before = 1 000 000/min`, i.e. the trial/free budget,
  not the 10 000 000 a paid personal token gets. If the trial lapses the account
  drops toward Free (documented 1 000 API calls/day), which would degrade or break
  the sync at the exact moment HubSpot is switched off. **A paid subscription must
  be confirmed before cutover — this is now a hard prerequisite, ahead of every
  engineering task.**

---

## 1. Retractions — what v1 got wrong

| # | v1 claimed | Reality (verified 2026-08-27) |
|---|---|---|
| R1 | The 34 legacy HubSpot Notes have no monday counterpart, so C1's fix is to abandon them | **They were already migrated into monday, 1:1.** Scanning every update body on the three boards for `/BSG-\d{7}-\d{6}/` yields exactly 34 distinct numbers; the set difference against our 34 note-bearing live documents is empty in both directions; placement is 25 Companies + 1 Agents + **8 Deals — exactly the 8 deal-pinned documents**. Abandoning them would leave permanent orphan updates on live client cards. The destructive C1 SQL is **struck**; teardown stays possible via `delete_update`. |
| R2 | "Every UI filter we already have (the wizard's client picker shows only `direct_client`) keeps working unchanged" | **False.** `listCompaniesQuerySchema` accepts only `q`/`sort`/`cursor`/`limit`, and `listCompanies` builds its WHERE from `q` and the cursor alone. There is no type predicate anywhere. 3 `referring_partner` rows are reachable from the typeahead today, distinguished only by the `(A) ` name prefix — **a prefix that disappears when monday names take over.** |
| R3 | Cutover = "remove the token from prod env" | **That crash-loops production.** `env.ts:230/244/292` hard-fail boot in prod when the base URL, webhook secret or API token are missing. There is currently **no runtime off-switch for HubSpot at all**, and `isConfigured()` is `token.length > 0`, so a revoked token still reports "configured". |
| R4 | Column ids in v1 §2 | Four are deleted: `dropdown_mm6b150e`, `dropdown_mm6btcce`, `dropdown_mm6bfakw`, `dropdown_mm6epmzw`. Replacements are **status** columns (`color_mm6hp7ht`, `color_mm6hfzy3`, `color_mm6hgbtv`) needing a different GraphQL fragment. monday **silently omits unknown column ids** from `column_values(ids:)` (HTTP 200, no error) — a mapper written from v1 §2 writes NULL into company_type/lifecycle/stage on 72 rows **and reports success**. |
| R5 | Day 1 = fold the 8 duplicate pairs | That schedules the only irreversible operation first, before any dry-run, and it is not a prerequisite — the primary/alias binding handles duplicates natively. **Fold last, per pair, with counts shown.** |
| R6 | Notes go on both cards (v1 §1.3, C12, Q1) | Retracted by revised D3 (one note) — independently confirmed by R1's placement evidence. |
| R7 | Numbering needs work before the deadline | It does not. D4 needs no migration; `allocateNextNumber` keeps reading `companies.hubspot_company_id`, which still exists and stays populated. Q5 closed as option A. |
| R8 | v1 §6 day-by-day schedule | Void — it assumed 9 days and a different scope. Replaced by §4. |

---

## 2. Decision log

| # | Decision |
|---|---|
| D1 | Clients come from monday. A client created only in HubSpot after cutover never reaches us. |
| D2 | Notes are written only to monday. No dual-write. |
| D3 | **One note per row**: deal card when the document is pinned to a deal, otherwise the client (or agent) card. Same rule as HubSpot today. |
| D4 | Already-issued `documents.number` never changes; new documents take the suffix from the monday item id. |
| D5 | Add a `BSG ID` text column to Companies (M) + Agents (A) holding our company UUID. |
| D6 | Webhooks: unguessable secret path, payload is a trigger only, every field re-read from the API. |
| D7 | The 5 test companies are purged at the very end (not this week). |
| D8 | An era marker decides which system holds the artifact to tear down. |
| D9 | No implementation before this plan is reviewed; everything is rehearsed on `bsg_prodcopy` first. |
| D10 | The monday board structure of 2026-08-27 is final — **to be re-confirmed**, `activity_logs` show structural edits on 08-24, 08-25 and 08-26. |
| D11 | Deleting a client in monday never deletes our data when documents **or calc-configs** exist; archive == delete; absence from a backfill is never a delete. |
| **D12** | **Dual READS from now, single-provider WRITES behind `CRM_PROVIDER`.** Reads are safe because the monday backfill writes only `crm_*`/`monday_*` columns while HubSpot keeps maintaining `hubspot_*`. It is also required: the team still creates clients in HubSpot until 8/31. |
| **D14** | **Re-sync behaves exactly as in HubSpot: each manual Sync creates a NEW update**; the previous ones stay on the card as history, and `hubspot_note_id` points at the most recent. The "this creates a NEW note" confirm dialog stays. (`edit_update` rejected.) |
| **D15** | **monday owns notes completely: deleting a document tears the update(s) down.** Combined with D14 this REQUIRES a note ledger — see below. |
| **D16** | **The note ledger is APPROVED** (`crm_notes` table). Teardown enumerates every update ever created for a row instead of trusting the single most-recent pointer, so a document synced N times leaves zero orphans on the client card. Also fixes the pre-existing `failed`-with-a-note-id orphan and the `delete_pending` stranding. ~half a day. |
| **D13** | **Nothing is renamed and nothing is re-keyed this week.** `hubspot_raw`, `hubspot_company_id`, `hubspot_deal_id`, `hubspot_note_id`, the wire error codes and the FE sort-field strings all keep their names. Parallel columns only. |

### Consequence of D14 + D15: the note ledger is now mandatory

D14 (a new update per re-sync) and D15 (teardown on delete) cannot both hold with
a single mutable pointer: `hubspot_note_id` remembers only the LAST update, so
deleting a document that was synced three times removes one update and leaves two
permanent orphans on a live client card — each carrying the document number,
company name, creator email and a link into our SPA.

This flaw exists in the HubSpot implementation today (re-sync mints a fresh Note,
delete removes only the newest). "Work exactly like HubSpot" would inherit it, so
the ledger was approved (D16):

```sql
CREATE TABLE crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  calculator_config_id uuid REFERENCES calculator_configs(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('hubspot','monday')),
  note_id text NOT NULL,
  target text NOT NULL CHECK (target IN ('company','agent','deal')),
  target_item_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK ((document_id IS NULL) <> (calculator_config_id IS NULL))
);
```

Teardown then enumerates rows instead of trusting one pointer, and each row is
retried independently. `hubspot_note_id` + `crm_note_provider` stay as the "most
recent" pointer the UI already reads, so nothing existing changes shape. Cost:
~half a day. It also fixes the pre-existing `failed`-with-a-note-id orphan (one
such calc-config exists today) and the `delete_pending` stranding.

---

## 3. Era marker — the design everything hangs on

The marker answers exactly one question: **"if this row is deleted, which system
holds the artifact I must tear down?"** So it is per-row, **mutable**, and written
in the same statement as the note id. It is not an origin stamp.

### Migration 0020a (ships first, additive, instant, DROP-reversible)

```sql
ALTER TABLE documents          ADD COLUMN crm_note_provider text;
ALTER TABLE documents          ADD COLUMN crm_note_target   text;
ALTER TABLE documents          ADD COLUMN legacy_hubspot_note_id text;
ALTER TABLE calculator_configs ADD COLUMN crm_note_provider text;
ALTER TABLE calculator_configs ADD COLUMN crm_note_target   text;
ALTER TABLE calculator_configs ADD COLUMN legacy_hubspot_note_id text;

UPDATE documents          SET crm_note_provider='hubspot' WHERE hubspot_note_id IS NOT NULL; -- 34
UPDATE calculator_configs SET crm_note_provider='hubspot' WHERE hubspot_note_id IS NOT NULL; -- 3

ALTER TABLE documents ADD CONSTRAINT documents_crm_note_pairing_check
  CHECK ((hubspot_note_id IS NULL     AND crm_note_provider IS NULL)
      OR (hubspot_note_id IS NOT NULL AND crm_note_provider IN ('hubspot','monday')));
ALTER TABLE documents ADD CONSTRAINT documents_crm_note_target_check
  CHECK (crm_note_target IS NULL OR crm_note_target IN ('company','agent','deal'));
-- identical pair on calculator_configs
```

`hubspot_note_id` **keeps its name** and now means "the id of the CRM artifact for
this row, in the system named by `crm_note_provider`". Renaming it breaks five
hand-mirrored FE sort unions with a runtime 400 and no compile error.

### The predicate change — two lines, whole risk class retired

```
needsTeardown = noteId !== null
             && crmNoteProvider === env.CRM_PROVIDER      // <- the only new clause
             && state IN ('synced','delete_failed')
```

| Row | `CRM_PROVIDER='hubspot'` (today) | after the flip to `'monday'` |
|---|---|---|
| legacy (provider=hubspot) | true → tears down the HubSpot Note **exactly as today** | **false** → branch skipped: no dead-API call, no 400, no `delete_failed` wedge; soft-delete proceeds and a `hubspot_note_abandoned` event preserves the id |
| monday (provider=monday) | false | true → `delete_update(id)` |
| never synced (id NULL) | false | false |

Because every existing row is `provider='hubspot'` and the default is
`'hubspot'`, **deployed behaviour today is byte-identical** — the existing delete
suites must pass with zero test edits.

Also required in the same PR: `softDeleteDocument` / `restoreDocument` and both
calc twins must null `crm_note_provider` + `crm_note_target` alongside
`hubspot_note_id`, or the pairing CHECK rejects every restore (6 restores have
happened in prod).

Post-flip hardening (separate one-line migration, **never before** the flip — all
34 rows are legitimately hubspot+synced today):

```sql
ALTER TABLE documents ADD CONSTRAINT documents_no_dead_crm_teardown_check
  CHECK (crm_note_provider IS DISTINCT FROM 'hubspot'
      OR hubspot_sync_state NOT IN ('synced','delete_failed'));
```

---

## 3a. Final review outcome (2026-08-27)

A 6-lens adversarial review of the complete diff, with every finding then
attacked by a separate verifier: **25 confirmed** (1 blocker, 6 high,
10 medium, 8 low), **5 rejected as misreadings**. Verdict:
**ship-with-fixes**. All five must-fix items plus five of the mediums were
fixed and re-verified the same day.

| Fixed | What it was |
|---|---|
| **blocker** | Four `hubspot.isConfigured()` calls were unconditional, so sync and delete refused to work in exactly the configuration `env.ts` now blesses — CRM_PROVIDER=monday with no HubSpot token. Replaced with a provider-dispatched `crmIsConfigured()`; **proved end-to-end** (sync → update on the card → delete → update gone, with no HubSpot token present). |
| high | The rewritten publish path discarded the note id when HubSpot's *association* call failed after the note was already created — an unrecoverable orphan on the customer timeline, and a regression on the LIVE path. The id is now written to the ledger before the error propagates. |
| high | The new `companyType` filter made `(A) ConsultiPay / Monepik Limited` — a referring_partner that owns a live document — unreachable in both client pickers. The filter now also admits any row that already owns work: 86 visible, 41 empty agents still hidden. |
| high | `flagDeleted` resolved a duplicate-bound item with an unordered `LIMIT 1` and could hard-delete the wrong half of a pair. It now aggregates across every row sharing a `crm_item_id` and deletes only when the whole group owns nothing. |
| high | `runMondayBackfill` had no trigger — after the flip there would have been no way to load or refresh monday data. Added `npm run monday:backfill`. |
| high ×2 | Two runbook gates were impossible to execute as written (a migration count of 21 against a tree of 23; a `node -e "require('./dist/...')"` boot check against a project that emits no `dist/server` and is `type: module`). Both corrected and **actually run**. |
| medium | Auto-sync was gated on `CRM_PROVIDER === 'hubspot'`, which would have silently switched auto-posting off for good at the flip. It now posts to whichever CRM is active. |
| medium | `withFallback` built its ledger row with a placeholder UUID, so `markCrmNoteTornDown` updated nothing and the note stayed "live" forever. It now persists first and re-reads the real row. |
| medium | The webhook path secret — the endpoint's only credential — was written to the log on every delivery via the request URL. Now masked before the logger sees it. |
| medium | `item_deleted` / `item_archived` acted on the payload without re-reading the item, breaking the "payload is only a trigger" invariant on the single most destructive branch. Deletions are now confirmed against the API first. |
| medium | Transport: the abort timer was cleared before the body was read (a stalled body hung forever), and a non-numeric `Retry-After` made the backoff `NaN`. |

Rejected as misreadings, with reasons recorded in the review output: a
claimed re-apply hazard in 0020 (drizzle's migrator gates on journal
timestamps, so the second run cannot happen), a pre-existing advisory-lock
split, two SQL misreadings, and one duplicate of an already-confirmed item.

Deferred to September (none block the cutover): the remaining mediums and
lows — `crm_deleted_at` is written but not yet surfaced in the UI, the
reconcile script is not yet ported to monday, and the webhook processor's
column cache never invalidates.

---

## 4. Workstreams, in dependency order

**Status as of 2026-08-27 evening: every code workstream is BUILT and
verified against the restored prod copy + the live monday account.** What
remains is the adversarial review of the complete diff, then the deploy.
413 server tests and 402 frontend tests pass; typecheck and lint are clean.

| # | Workstream | Before 8/31? | Depends on |
|---|---|---|---|
| **WS0** ✅ | Unblock the critical path: **probe monday write scope**, confirm the board freeze, approve `BSG ID`, pick the authoritative Deals→Companies relation | ⛔ yes | — |
| **WS1** ✅ | **HubSpot-side safety** — era marker + `CRM_PROVIDER` + conditional env gates + disarm `cleanupNonMatching`. Ships as a provable no-op | ⛔ yes | — |
| **WS2** ✅ | Capture perishable evidence (legacy note map, `hubspot_raw` export, live board schema, fresh match) | ⛔ yes | — |
| WS3 ✅ | Migration 0020b — parallel binding chain (`crm_item_id`, `monday_raw`, `crm_id_map`, widened CHECK vocabularies) | no | WS0 |
| WS4 ✅ | monday read adapter — client, fail-loud column resolver, mapper | no | WS0, WS3 |
| WS5 ✅ | monday backfill + dual reads + **an operator "Sync from monday" control** | no | WS4, WS6 |
| WS6 ✅ | The remap DML — bind local rows to monday ids | no | WS2, WS3 |
| WS7 ✅ | **Client-picker safety** — the `company_type` filter that does not exist yet | no (but **before agents are backfilled**) | WS5 |
| **WS8** ⏳ deploy | Cutover: append the monday credentials, stop the app for the remap window, flip `CRM_PROVIDER`, restore auto-sync | ⛔ yes | WS1, WS5 |
| WS9 later | Re-bind the 34 legacy notes to their monday updates (replaces the struck C1 SQL) | no | WS2, WS8 |
| WS10 later | Company delete-path hardening | no | WS3 |
| WS11 ✅ | Write-back to monday (`create_update`/`delete_update`) | no — **September** | WS0, WS8 |
| WS12 ✅ receiver; delivery verified after deploy | Webhooks | no — **September** | WS4, WS5 |
| WS13 later | Frontend rename + era UI | no — **September** | WS8 |

### The three traps that make a half-built adapter worse than none (WS4)

1. **`items(ids:)` returns out of order and silently drops unknown ids.** Verified:
   3 requested → 2 returned, shuffled, HTTP 200, no error, no null placeholder.
   Index-zipping corrupts companies wholesale. Map by id; classify every
   requested id absent from the map as `gone`.
2. **Recycle-binned items come back in full with `state:"deleted"`.** Verified on
   item 3170231543. A naive `isHubspotNotFound` port classifies it as transient,
   and `upsertCompany`'s unconditional `hubspotDeletedAt: null` **resurrects a
   deliberately deleted company**. Use `classifyMondayItem → active | recycled |
   gone` and pass an explicit `isLive`.
3. **Unknown column ids are silently omitted.** Fetch all `column_values` and
   resolve in our code; fail loudly at boot on a missing id or changed type.
   `StatusValue.index` is null on 20 of 103 items despite the label being set —
   persist both label and nullable index, never treat null as "not set".

### Things that must not happen (each verified as a live foot-gun)

- **`cleanupNonMatching` must be disarmed before agents are synced.**
  `HUBSPOT_COMPANY_TYPE_FILTER=direct_client` in both `.env` and `.env.server`, so
  `npm run hubspot:backfill` deletes non-matching companies guarded only by
  `NOT EXISTS(documents)` — and `calculator_configs` is `ON DELETE CASCADE`, so
  configs are destroyed uncounted. After agents arrive this wipes ~40 rows.
- **`deleteDealsByCompanyId` currently runs unconditionally** in
  `deleteOrMarkCompany`, and `documents.hubspot_deal_id` is `ON DELETE SET NULL` —
  so the branch we call "flag and keep everything" silently and permanently nulls
  the deal pin on 8 documents and 4 calc-configs. Move it into the hard-delete
  branch only.
- **No in-place re-key.** `documents_hubspot_deal_id_…` and
  `calculator_configs_hubspot_deal_id_…` are `confupdtype='a'` (NO ACTION) and
  **not deferrable**, so `UPDATE deals SET hubspot_deal_id=…` hard-fails 23503.
- **Never rename `hubspot_raw`.** 28/28 deals carry `order_reference_number`
  (the matching key), `ubo_data` and `business_description`; none exist on any
  monday board and no application code reads the column, so an overwrite is
  silent and unrecoverable after 8/31.
- **`companies.crm_item_id` must NOT be UNIQUE** — 7 monday items are each claimed
  by two of our rows. Partial unique index on `binding_role='primary'` instead;
  consequently it can never be an FK target.
- **Agents must key on the monday item id, not `text_mm6b8spx`.** That column
  holds real 12-digit HubSpot company ids (42/42 filled, 3 matching our rows) —
  `upsertCompany`'s `onConflictDoUpdate` would **overwrite a merchant and flip it
  to `referring_partner`**, removing it from the picker while it still owns
  documents.
- **A backfill before the remap sees 76/76 companies as unbound → "absent".**
  Hence `crm_missing_since` (observation, never authorizes anything) is split from
  `crm_deleted_at` (event-sourced only), and the flagging pass aborts above a 5%
  delta or when `total_bound = 0`.

---

## 5. What ships first — PR #1, a provable no-op

1. Migration 0020a in full (§3).
2. `env.ts`: add `CRM_PROVIDER ∈ {hubspot,monday}` defaulting to `hubspot`; make
   the three production HubSpot gates conditional on `CRM_PROVIDER==='hubspot'`;
   add the `MONDAY_*` vars alongside. **Remove nothing.**
3. The two predicates (`documents.service.ts:539-542`,
   `calculator-configs.service.ts:274-277`).
4. Null `crm_note_provider`/`crm_note_target` in soft-delete + restore, both
   entities.
5. Write both fields in the sync services beside the note id.
6. Disarm `cleanupNonMatching` (hard-refuse above 3 `referring_partner` rows;
   widen the guard with `NOT EXISTS(calculator_configs)`).
7. Wire `CRM_PROVIDER` through the TTL-refresh `enabled` flag and the auto-sync
   flag so all three flip together.

Plus the read-only captures of WS2. **Explicitly not now:** do not set
`AUTO_SYNC_TO_HUBSPOT=false` (pure UX regression for the remaining HubSpot days —
it must be false *by* 8/31, not before), do not touch the signature middleware,
the raw-body mount, the webhook processor or any `hubspot_*` column name, do not
fold duplicates, do not purge.

---

## 6. Verification gates (abridged — 20 in the audit output)

**Pre-flight:** delete/sync suites pass with zero test edits; era backfill counts
exact (34/3, and `(hubspot_note_id IS NULL) <> (crm_note_provider IS NULL)` = 0);
container boots **both** with `CRM_PROVIDER=hubspot` + no monday token **and**
with `CRM_PROVIDER=monday` + no HubSpot token (this is what proves the cutover is
possible at all — today it crash-loops); monday write-scope probe succeeds.

**Remap:** relative counts captured in a temp table, never hard-coded literals;
`documents WHERE hubspot_deal_id IS NOT NULL AND crm_deal_item_id IS NULL` = 0;
no `documents.number` changed; exactly one `primary` per `crm_item_id`.

**Post-cutover:** delete one of the 34 legacy documents — must soft-delete with no
HubSpot call, no 400, no `delete_failed`; then restore and delete it again.
Client picker with an empty query shows alphabetical clients, not the 42 freshly
inserted agents. Byte-compare PDFs of 3 pre-cutover documents.

**Rollback rehearsal on `bsg_prodcopy` before touching prod:** apply 0020a+0020b →
remap → run the down scripts → `pg_dump --schema-only` diff must be empty.

---

## 7. Accepted risks — what we consciously do not do this week

- **monday write-back is not achievable** (WS11 → September). Documents created
  after cutover sit at `not_synced` and are posted manually if needed.
- Webhooks → September, covered by the hourly backfill (3,024 complexity per full
  3-board pass = 0.3% of one minute's budget).
- Frontend rename + the legacy-era pill → September. Wire names and error-code
  strings stay frozen so the four bare-string matches keep working.
- `deals.amount/currency/business_vertical` (28/28 populated) have no monday
  source → COALESCE-preserved, not nulled.
- All 71 matched companies get renamed on first sync (68 prefix-only) — announced,
  not prevented; `legacy_hubspot_name` preserves the original.
- 3 live documents carry number suffixes matching no current company id.
- The 5 test companies are not purged this week.

---

## 8. Open questions — blocking

1. **Write scope (minutes to answer, blocks everything downstream):** may we run
   one `create_update` + `delete_update` probe on a throwaway monday item? Never
   tested once. If the token lacks the scope, the remedy is a monday App
   registration (3–4 days) — knowable today instead of Sunday night.
2. **Board freeze:** `activity_logs` show structural edits on 08-24, 08-25 **and**
   08-26. Will the boards stop changing before September?
3. **`BSG ID` column:** approve creation on both boards. Also — the existing bare
   `Text` columns carry a literal `+` on 19/72, 3/42 and 4/31 items. What does it
   encode? It may be a business state we should read.
4. **Which Deals→Companies relation is authoritative** — `board_relation_mm6bmb7`
   (31/31, correct on the newest deal) or `board_relation_mm6hc7y6` (30/31, added
   08-25, already disagreeing)? Same question for `Deals` vs `Dup. of Deals` on
   the Companies board.
5. ~~**BSPOK duplicate pair**~~ — **DECIDED 2026-08-28: leave it alone.**
   `434297253062` (primary) owns 2 documents and no deal; `434572170473`
   (alias) owns the one deal and no documents. Nothing is re-parented.

   The `primary` flag is already on the correct row and cannot sensibly
   move: both document numbers embed `253062`, the last six digits of that
   row's `hubspot_company_id`, and document numbers are legal records that
   never change.

   The one deal stays stranded on the alias row, which means it can never
   be pinned to a BSPOK document (`ensureDealBelongsToCompany` rejects a
   cross-company reference). Accepted: nothing is pinned to it today, and
   **every NEW deal arriving from monday attaches to the primary row** —
   `monday.backfill.ts` resolves a deal's parent with
   `crm_item_id = X AND crm_binding_role = 'primary'` — so the problem does
   not grow.

   Residue the operator will see: two identical `(M) BSPOK IT Solutions
   LTD` rows in the client picker, both `direct_client`. Cosmetic.

   The alias row cannot be silently purged: the deletion webhook counts
   owned work per monday ITEM, not per row, so it sees the 2 documents on
   the group and keeps both rows.

   Reversible at any time by re-parenting the deal
   (`UPDATE deals SET hubspot_company_id = '434297253062' WHERE
   hubspot_deal_id = '507556347101'`) — but only AFTER the flip, since a
   HubSpot sync would otherwise write the old association back.
6. **Flip on Friday 29.08, not Monday 31.08.** Reversibility expires with the
   HubSpot account. Confirm Friday.
7. Re-sync semantics in monday: `edit_update` in place (recommended) or
   create-fresh as today?
8. Do the 34 migrated legacy updates get torn down with their document (WS9,
   recommended), or preserved as a migration record?

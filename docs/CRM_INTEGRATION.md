# CRM integration — how it works, how to operate it

**Status:** monday.com is the only CRM. Production has run
`CRM_PROVIDER=monday` since 2026-08-28. The HubSpot account no longer
exists (confirmed 2026-09-14), so there is no provider rollback: the
HubSpot code still in the repo (`server/modules/hubspot/`,
`src/api/hubspot.ts`) is dormant and has nothing to talk to.

This is the operating manual. The blow-by-blow of the cutover itself is in
`monday_cutover_runbook.md` (gitignored, server-side); this file is the
part that stays true afterwards. The permanent record of the migration —
what was done, what went wrong, and what was fixed afterwards — is
[`CRM_MIGRATION_RECORD.md`](CRM_MIGRATION_RECORD.md).
[`monday_migration_plan.md`](monday_migration_plan.md),
[`monday_migration_analysis.md`](monday_migration_analysis.md) and
[`monday_audit_round4.md`](monday_audit_round4.md) are historical planning
documents: they explain why decisions were made, not how the system runs
today.

---

## 1. The one switch

```
CRM_PROVIDER=monday
```

Everything keys off this. It selects which client the note-writer talks
to, which webhook processor starts at boot, which API `/ready` probes, and
which side the TTL refresh reads from. There is no partial state: one
provider is active, the other is inert.

**There is no switching back.** The code-level switch still exists —
`server/config/env.ts` accepts `hubspot` or `monday` — but the HubSpot
account is gone, so `hubspot` would point the app at an API that no longer
answers.

**Set it explicitly.** The code default is still `hubspot` (the test suite
relies on it; changing the default is a code change, deliberately
deferred); the `.env` templates set `CRM_PROVIDER=monday` explicitly, and
an existing `.env` must too. An environment without `CRM_PROVIDER=monday` does not quietly run monday:
in production it either refuses to boot (the HubSpot-only variables become
mandatory again) or, if old HubSpot values are still in `.env`, boots
against the dead HubSpot API with no monday webhook processor, no
scheduled backfill and no heartbeat. Production must set
`CRM_PROVIDER=monday`, and so must every new environment.

### What monday mode needs

| variable | |
|---|---|
| `CRM_PROVIDER` | `monday` — explicitly, see above |
| `MONDAY_API_TOKEN` | required in production; every read and every note write goes through it |
| `MONDAY_WEBHOOK_SECRET` | required in production, at least 16 characters (`openssl rand -hex 24`). It is the last path segment of the webhook URL, so that URL is itself a secret — never paste it into a ticket, chat or document. Unset, the webhook route answers 404 |
| `MONDAY_API_BASE_URL` | must be exactly `https://api.monday.com/v2` in production (SSRF guard); that is the default |
| `MONDAY_API_VERSION` | `2026-07`. Asserted at boot; if the assertion fails, an ERROR is logged and neither the webhook processor nor the scheduled jobs start |
| `MONDAY_BOARD_COMPANIES` / `_AGENTS` / `_DEALS` | defaults are the real boards (§2); production refuses to boot unless the three are distinct |
| `MONDAY_BACKFILL_INTERVAL_HOURS` | default 24; 0 disables the scheduled backfill (§5) |
| `MONDAY_BACKFILL_FIRST_DELAY_MINUTES` | default 15 — delay before the first scheduled backfill after boot |
| `HUBSPOT_SYNC_TTL_SECONDS` | legacy name, still live: the TTL for the monday refresh on read (default 300) |
| `AUTO_SYNC_TO_HUBSPOT` | legacy name, still live: posts notes automatically to the *active* CRM (§4). The code default is `false`; production must keep it `true` |

The HubSpot production checks (`HUBSPOT_API_TOKEN`,
`HUBSPOT_WEBHOOK_SECRET`, the `HUBSPOT_API_BASE_URL` guard) run only when
`CRM_PROVIDER=hubspot`; in monday mode those variables can be removed or
left empty — but never put a placeholder in `HUBSPOT_API_TOKEN`: any
non-empty value must start with `pat-` or boot fails, whatever the
provider.

## 2. What is connected

| | |
|---|---|
| Boards | Companies `5102466967` · Agents `5102466950` · Deals `5102466996` |
| API version | pinned `2026-07`, asserted at boot — a wrong pin fails loudly instead of silently returning a different shape |
| Webhooks | 7 events × 3 boards = 21, plus 4 pre-existing foreign ones we do not own |
| Endpoint | `POST /api/v1/monday/webhooks/:secret` |

Columns are resolved **by recorded id first**, falling back to title only
if the id is gone. Boards were rebuilt four times in one week during
development, so title-only matching was not survivable.

### Field meanings

Many identifiers still say `hubspot`. That is deliberate: renaming the
database vocabulary and the wire contract is a coordinated change that has
been deferred (§9). None of them means HubSpot is involved. What they hold
today:

| name | where | meaning in the monday era |
|---|---|---|
| `hubspot_company_id` | `companies` | The company's natural key (unique, not null). Rows from the HubSpot era keep their old id; companies created from monday carry a synthetic `mon:<itemId>` |
| `hubspot_company_id` | `deals` | The deal → company foreign key: which company a deal belongs to (see Company (M), §7) |
| `hubspot_deal_id` | `deals` | The deal's natural key; deals created from monday carry `mon:<itemId>` |
| `hubspot_modified_at` | `companies`, `deals` | Shown in the UI as "CRM updated": the monday item's `updated_at`, written on every sync since `4aeb134` (kept as-is if monday sends none) |
| `last_synced_at` | `companies`, `deals` | When the row was last synced from monday; advanced on every sync since `4aeb134`. Drives the TTL refresh (§5) and the "Last synced" line on the company page |
| `crm_item_id`, `crm_board_id` | `companies`, `deals` | The monday binding: which item, on which board. Null = unbound (§9) |
| `crm_binding_role` | `companies` | `primary` or `alias`. Where two of our rows are bound to one monday card (duplicates found during the migration), the row that owns the real work is `primary` |
| `crm_company_item_id` | `deals` | The deal's "Company (M)" link, as monday last reported it |
| `hubspot_sync_state`, `hubspot_note_id` (`hubspotSyncState`, `hubspotNoteId` in code) | `documents`, `calculator_configs` | Note sync state and the latest note id, for whichever CRM holds the note — `crm_note_provider` says which |
| `synced_to_hubspot` | event type | A note was posted to the active CRM; the event history shows "Synced to CRM" |
| `HUBSPOT_UNREACHABLE` | API error code | The active CRM (monday) is unreachable. Kept because the frontend matches the string literally |
| `/api/v1/hubspot/*` | routes | HubSpot-era endpoints: still mounted, dormant, not called by the SPA. The monday webhook endpoint lives under `/api/v1/monday` |
| `HUBSPOT_SYNC_TTL_SECONDS`, `AUTO_SYNC_TO_HUBSPOT` | env | Still live in monday mode — see §1 |

Most operator-facing text already says "CRM". A few labels still say
"HubSpot" — the "HubSpot sync" column on the documents and calculators
lists, for one. They are leftover labels, not a sign that HubSpot is
involved.

## 3. How data comes IN

```
monday change -> webhook -> queue (monday_webhook_events) -> processor -> DB
```

The endpoint does almost nothing: it verifies the secret, normalises the
event name, dedupes, writes one row, and returns 200. All real work
happens in a processor that polls the queue every 5s.

Three properties worth knowing:

- **The payload is a trigger, never data.** We re-read the item from the
  API with our own token. A forged request can at most cause a wasted
  read.
- **Event names are translated.** monday ACCEPTS `create_item` but SENDS
  `create_pulse`; three delivered names were observed live and the other
  four are mapped from monday's documented legacy spellings.
  `normaliseEventType` maps both vocabularies onto ours. Getting this wrong is invisible — see §7.
- **Retries are bounded.** 5 attempts, 30s × attempts backoff, then the
  row is marked `failed` and stops. A `failed` row is a permanently lost
  change; §6 is how you find out.

## 4. How data goes OUT

Saving a document or calculator posts a note (a monday "update") to the
CRM. Target selection: **deal-pinned → the deal's card; otherwise → the
company's card.** Automatic posting is `AUTO_SYNC_TO_HUBSPOT=true` — the
legacy name, but it posts to the active CRM. It fires when a document is
created and when a calculator is first saved (later calculator auto-saves
do not post); the manual Sync action posts a new note on demand.

Every note is recorded in `crm_notes` with the provider that created it.
That ledger is what makes teardown correct across the era boundary:
deleting a document or calculator tears down only the notes held by the
active CRM. A HubSpot-era note is skipped — the account is gone, so there
is nothing left to delete, and the document or calculator is soft-deleted
without calling any CRM (its HubSpot-era ledger row is left as it is).
Without the ledger, deleting an old document would try to delete a HubSpot
note id through monday's API.

## 5. Self-healing

Two independent mechanisms, and they cover different failures:

**TTL refresh on read.** Reading a row whose `last_synced_at` is older
than `HUBSPOT_SYNC_TTL_SECONDS` (default 300) schedules a background
re-read of that one item. This is what heals a row after a lost webhook.
It never acts on absence and never fires for an unbound row — see
`monday.refresh.ts` for why.

**Scheduled backfill.** Every `MONDAY_BACKFILL_INTERVAL_HOURS` (default
24, first run 15 minutes after boot) the app re-reads all three boards.
This is what heals rows NOBODY OPENS — the TTL refresh cannot, because it
only fires on read, and a client nobody looks at for three months would
otherwise sit wrong for three months. It is also the only path allowed to
conclude "this item is gone", because it sees a whole board at once and
aborts if more than 5% of bound rows go missing together.

Setting the interval to 0 disables it, and the startup path logs a WARN
saying so — a silently absent safety net is how this gap appeared in the
first place.

The same script is available on demand: `npm run monday:backfill`.

## 6. Checking that it is alive

Once an hour the app logs the queue itself, and **the level carries the
meaning**:

- `ERROR` — events have exhausted their retries. Each one is a change from
  monday that was never applied.
- `WARN` — the oldest pending event is over ten minutes old; the processor
  is not draining.
- `INFO` — healthy.

```bash
docker compose logs --since 24h app | grep "monday:health"
```

This is visibility, not paging: nobody is woken up. It exists because the
failure being guarded against is *nobody thinking to look*.

On demand:

```bash
curl -s http://127.0.0.1:8080/ready
```

Returns `checks.monday` plus `mondayWebhookQueue`:

| field | what a bad value means |
|---|---|
| `pending` | steadily rising: the processor is stuck or monday is flooding us |
| `failed` | **any non-zero value is a permanently lost change** — investigate |
| `oldestPendingAgeSeconds` | more than a few minutes: the processor is not draining |
| `lastProcessedAgeSeconds` | hours, during working time: webhooks may be silently gone |

The queue is reported but deliberately does NOT fail readiness — late data
is not a reason to pull the app out of service.

**The failure mode to fear is silence.** An empty queue looks identical to
"nobody edited anything". If `lastProcessedAgeSeconds` is large during a
working day, verify the webhooks still exist:

```bash
TOKEN=$(grep '^MONDAY_API_TOKEN=' .env | cut -d= -f2-)
for B in 5102466967 5102466950 5102466996; do
  curl -sS -X POST https://api.monday.com/v2 \
    -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
    -H "API-Version: 2026-07" \
    -d "{\"query\":\"query { webhooks (board_id: $B) { id event } }\"}"
  echo
done
```

Expect 8 / 9 / 8 (ours plus the foreign ones).

## 7. Things that bit us, so they do not bite again

**Event-name mismatch.** Cost us the first cutover attempt. The endpoint
answered 200, the log said "not subscribed" at INFO, the queue stayed
empty, and everything looked healthy while nothing synced. Unrecognised
events on our own boards are now WARN.

**`z.coerce.boolean()`.** It is `Boolean(string)`, so `"false"` was
`true`. Five flags were affected. Any new boolean env var must use
`envBoolean`.

**`sed -i 's/^KEY=.*/'` on a key that is not in `.env`.** Silently does
nothing and exits 0. `CRM_PROVIDER` had no line in the file, so the flip
would not have happened. Use the upsert form.

**Deleting a card does not remove it from the API.** monday's recycle bin
still returns the item with `state: deleted`, which is why the processor
gets confirmation rather than inferring from absence.

**A deal's company was taken once and never again.** Syncing a deal we
already had updated its name and stage but not its company, so a change of
Company (M) in monday was silently ignored forever — by webhooks, the
scheduled backfill and the TTL refresh alike. Three deals imported during
the migration were stuck under their referring agents, which made them
invisible in the wizard for their merchants (found 2026-09-14). Since
`a84d653` every sync applies Company (M), with three guards: only a
primary bound company is accepted, an empty or unbound link leaves the
deal alone, and a deal already under any row bound to the Company (M) card
— including the alias half of a duplicate pair, where one pair
deliberately keeps its deal on the alias row — is not moved.

**Two timestamps were also written once and never again** (same class,
found the same day). `last_synced_at` was set only on insert, so every
bound row looked stale forever: the TTL refresh re-read it from monday on
every single view, and the company page showed a "last synced" date from
May. And the "CRM updated" column (`hubspot_modified_at`) kept the
HubSpot-era or creation date instead of the card's last change in monday.
Since `4aeb134` every sync advances both; if monday sends no `updated_at`
the previous value is kept.

**The lesson from both:** a field the INSERT branch of an upsert writes
and the UPDATE branch forgets is frozen at its first value, silently. When
changing an upsert in `monday.backfill.ts`, compare the two branches field
by field.

## 8. Routine operations

**Re-run the backfill** (safe any time; read-only against monday):
```bash
docker compose exec -T app npm run monday:backfill
```

**Check for board drift** before anything structural:
```bash
docker compose run --rm --no-deps -T --entrypoint npm app run monday:drift
```

**Rotate the API token:** replace `MONDAY_API_TOKEN` in `.env`, restart
`app`. The 21 webhooks need no re-registration: they are bound to the URL
secret, not the token, and processing resumes once the new token is live.

**Rotate the webhook secret:** this changes the endpoint URL, so the 21
webhooks must be deleted and re-created. Do not rotate it casually.

**Register the webhooks** (fresh install, or after rotating the secret):
one `create_webhook(board_id, url, event)` GraphQL mutation per board ×
event — the seven canonical events (`create_item`, `change_column_value`,
`change_name`, `item_deleted`, `item_archived`, `item_restored`,
`item_moved_to_any_group`) on each of the three boards, all pointing at
`<APP_PUBLIC_URL>/api/v1/monday/webhooks/<MONDAY_WEBHOOK_SECRET>`. The app
must already be running with that secret: monday sends a challenge when
the webhook is created and refuses to register an endpoint that does not
answer it. The four pre-existing `change_specific_column_value` webhooks
on the boards are not ours — do not delete them.

**Fresh install:** `server/scripts/monday-remap.ts` was the one-time tool
that bound our legacy rows to monday items during the migration; a fresh
install does not need it. The backfill creates rows straight from the
boards.

**Deploy:** from a clean checkout of a pinned, full commit SHA. rsync
`src`, `server`, `scripts` and `docker` with `--delete` and copy the root
build files; verify with a sha256 manifest (the tree matches, nothing left
over) and confirm the `docker-compose.yml` checksum is unchanged; tag the
current image `bsg-calculator:rollback-<sha>`; then
`docker compose build app` and `docker compose up -d --no-deps app`. Never
`docker compose down` — it would take the unrelated nginx-proxy-manager
stack with it. That tagged image is the only rollback there is: there is
no CRM-provider rollback. Full procedure: [`deployment.md`](deployment.md)
§6.1 (deploy) and §6.4 (rollback); first install, including webhook
registration: [`deployment.md`](deployment.md) §4.6.

## 9. Known gaps

- **No paging.** Queue health is logged hourly and exposed on `/ready`,
  but nothing sends anyone a message. Closing this properly needs a
  destination (email, Slack, an uptime probe hitting `/ready`), which is
  an infrastructure decision rather than a code one.
- **The code default is still `hubspot`.** `CRM_PROVIDER` defaults to
  `hubspot` in `server/config/env.ts`; the templates set
  `CRM_PROVIDER=monday`, but the fallback when the variable is missing is
  still `hubspot`. The test suite relies on the default, so changing it is
  a code change, deliberately deferred. Until then every environment must
  set `CRM_PROVIDER=monday` explicitly; one that forgets refuses to boot in
  production, or, if old HubSpot values are still set, runs the dormant
  HubSpot paths (§1).
- **Field names still say `hubspot`** — `hubspot_company_id` holds
  `mon:<id>` for monday-native rows; the full list is under Field meanings
  (§2). Renaming the schema and the wire contract is a coordinated change,
  deliberately deferred.
- **Five companies are unbound** (test data with only deleted documents).
  They cannot sync and will not heal. Harmless, but they are why the
  refresh checks for a binding first.

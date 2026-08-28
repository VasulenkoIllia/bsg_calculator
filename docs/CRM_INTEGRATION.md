# CRM integration — how it works, how to operate it

**Status:** monday.com is the live CRM since 2026-08-28. HubSpot code is
still present and still works; it is switched off by one environment
variable.

This is the operating manual. The blow-by-blow of the cutover itself is in
`monday_cutover_runbook.md` (gitignored, server-side); this file is the
part that stays true afterwards.

---

## 1. The one switch

```
CRM_PROVIDER=monday      # or: hubspot
```

Everything keys off this. It selects which client the note-writer talks
to, which webhook processor starts at boot, which API `/ready` probes, and
which side the TTL refresh reads from. There is no partial state: one
provider is live, the other is inert.

Switching back is genuinely one variable plus a restart — **for as long as
the HubSpot account exists.** That was the point of keeping both code
paths.

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
  `create_pulse`; all seven differ. `normaliseEventType` maps both
  vocabularies onto ours. Getting this wrong is invisible — see §7.
- **Retries are bounded.** 5 attempts, 30s × attempts backoff, then the
  row is marked `failed` and stops. A `failed` row is a permanently lost
  change; §6 is how you find out.

## 4. How data goes OUT

Saving a document or calculator posts a note to the CRM. Target selection:
**deal-pinned → the deal's card; otherwise → the company's card.**

Every note is recorded in `crm_notes` with the provider that created it.
That ledger is what makes teardown correct across the era boundary: a note
written to HubSpot is torn down via HubSpot even now, because the row says
so. Without it, deleting an old document would try to delete a HubSpot
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
`app`. Webhooks are unaffected — they authenticate with the URL secret,
not the token.

**Rotate the webhook secret:** this changes the endpoint URL, so the 21
webhooks must be deleted and re-created. Do not rotate it casually.

**Deploy:** see `deployment.md`. The short version: rsync the tree from a
clean checkout, verify with a sha256 manifest, `docker compose build app`,
`docker compose up -d --no-deps app`. Never `docker compose down` — it
would take the unrelated nginx-proxy-manager stack with it.

## 9. Known gaps

- **No paging.** Queue health is logged hourly and exposed on `/ready`,
  but nothing sends anyone a message. Closing this properly needs a
  destination (email, Slack, an uptime probe hitting `/ready`), which is
  an infrastructure decision rather than a code one.
- **Field names still say `hubspot`** — `hubspot_company_id` holds
  `mon:<id>` for monday-native rows. Renaming the schema and the wire
  contract is a coordinated change, deliberately deferred.
- **Five companies are unbound** (test data with only deleted documents).
  They cannot sync and will not heal. Harmless, but they are why the
  refresh checks for a binding first.

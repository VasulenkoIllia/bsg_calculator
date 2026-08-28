# HubSpot → monday.com: what was done, and what it cost

Completed 2026-08-28. This is the permanent record: the sequence, the
decisions, the things that went wrong, and the state the system was left
in. The operating manual is `CRM_INTEGRATION.md`.

## Why

The HubSpot account was being switched off at the end of August 2026.
That deadline set everything: there was no option to run both in parallel
for a month, and no option to slip.

## The shape of the migration

Deliberately split into two, with a gap between them:

**Stage E — deploy the code, change no behaviour.** The whole monday
integration and four migrations went to production with
`CRM_PROVIDER=hubspot`, so every monday path stayed asleep. This proved
the schema and the code in the real environment while HubSpot was still
live to fall back to.

**Stage F — the flip.** Credentials, drift check, freeze, remap, one
environment variable, restart, webhooks.

Splitting them meant the risky part was small and reversible, instead of
one large irreversible event.

## What the remap actually did

| | |
|---|---|
| Companies matched | **71 of 76** — 65 by exact name, 3 by HubSpot id, 3 by loose name |
| The 3 loose matches | verified by hand against monday: a `(closed)` suffix, `Nexton / Daniel` vs `Nexton, Daniel`, a trailing full stop |
| Deals matched | **28 of 28**, by order reference number — deterministic |
| Unmatched | 5 test companies. Between them 26 documents, **all soft-deleted, none carrying a note** |
| Duplicates | 8 monday cards each claimed by two of our rows; the row owning real work became `primary` |
| Deal-pinned documents rebound | **8 of 8** |
| Document numbers changed | **0** — 62 rows, 62 distinct numbers, before and after |

The whole remap ran in one transaction, wrote only binding columns, and
left the HubSpot chain (`hubspot_company_id`, `hubspot_deal_id`) intact —
which is what made rollback a single environment variable.

The forensic trail is in `crm_id_map`: 99 rows recording what matched
what, and by which key.

## What went wrong, and what it taught

**monday sends different event names than it accepts.** `create_webhook`
takes `create_item`; the delivery says `create_pulse`. All seven of our
events differ. The allowlist held the registration names, so every live
delivery was ACKed 200, logged at INFO as "not subscribed", and dropped.
Nothing errored. The endpoint was healthy, the 21 webhooks existed, the
queue was empty — and an empty queue looks exactly like a CRM nobody
edited.

This is the important one, because **no test suite would have caught it**.
434 server tests passed against our own idea of the event names. It took
creating one card in production and looking at what arrived.

**`z.coerce.boolean()` is `Boolean(string)`.** So `"false"` was `true`.
Five flags were affected, including `PUPPETEER_NO_SANDBOX` — had it been
set to `false` in production, fixing the parser would have broken PDF
generation. It was `true`, so nothing broke, but that was luck rather
than judgement. Checking the live `.env` before the restart is what turned
it from a discovery into a non-event.

**`sed -i 's/^KEY=.*/'` silently does nothing when the key is absent.**
`CRM_PROVIDER` had no line in the production `.env`, so the documented
flip command would have exited 0 without flipping anything. Found in
review, before it ran.

**Deleting a monday card does not remove it from the API.** The recycle
bin still returns the item with `state: deleted`. This is why the
processor takes confirmation from the API rather than inferring from
absence — and why a test-card deletion cleanly removed the row instead of
leaving it flagged.

## Corrections to earlier claims in this project's own documents

Recorded because being wrong in a document is worse than being wrong in
conversation:

- **"The monday subscription is paid."** It was not. The API returns
  `tier: "pro"`, which is the TRIAL's feature tier; `account.plan` was
  `null`. Caught from a UI banner, not from the API. A non-null `plan` is
  the only proof.
- **"Two rollback triggers."** `information_schema.triggers` returns one
  row per *event*, so two triggers on two tables appeared as four rows.
  `pg_trigger` gives the real count.
- **"A deleted card leaves the row flagged."** It does not, for a row that
  owns nothing — see above.

## What was added afterwards, in response to the audit

The cutover left two real gaps, both closed the same day:

- **Self-healing stopped existing at the flip.** The HubSpot era refreshed
  a stale row on read; that path was correctly switched off and nothing
  replaced it, so freshness rested entirely on webhooks. Restored against
  monday, plus a scheduled backfill for rows nobody opens.
- **Silence was indistinguishable from calm.** Queue depth, failed count
  and staleness are now on `/ready` and in an hourly log line whose
  severity carries the meaning.

Backups were verified rather than assumed: the nightly cron dumps the
whole database, so the three new tables are captured. The cron was
hardened to write to a temp file and verify it with `pg_restore -l` before
replacing the previous dump — before that, a failed dump would have left a
zero-byte file that looked like a backup.

## The state this left behind

Production runs monday.com as the live CRM. HubSpot code is intact and one
variable away. Rollback images for every step of the day are on the host.

**The largest remaining risk was never in the code:** the monday
subscription was still a trial, expiring the same week HubSpot was
switched off. No commit closes that.

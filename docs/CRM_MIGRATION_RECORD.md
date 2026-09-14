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
| The 3 loose matches | verified by hand against monday: a `(closed)` suffix, a slash where monday had a comma, a trailing full stop |
| Deals matched | **28 of 28**, by order reference number — deterministic |
| Unmatched | 5 test companies. Between them 26 documents, **all soft-deleted, none carrying a note** |
| Duplicates | 8 monday cards each claimed by two of our rows; the row owning real work became `primary` |
| Deal-pinned documents rebound | **8 of 8** |
| Document numbers changed | **0** — 62 rows, 62 distinct numbers, before and after |

The whole remap ran in one transaction, wrote only binding columns, and
left the HubSpot chain (`hubspot_company_id`, `hubspot_deal_id`) intact —
which is what made rollback, at the time, a single environment variable
(no longer possible — see "After the migration").

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

*(That was the state on 2026-08-28. The HubSpot account has since gone, so
"one variable away" no longer holds — see "After the migration" below.)*

**The largest remaining risk was never in the code:** the monday
subscription was still a trial, expiring the same week HubSpot was
switched off. No commit closes that.

## After the migration (2026-09-14)

**The HubSpot account is gone.** Confirmed 2026-09-14. The rollback the
whole design preserved — set `CRM_PROVIDER` back to `hubspot` — no longer
exists: monday.com is the only CRM, and the HubSpot code still in the repo
is dormant with nothing to talk to. The code default of `CRM_PROVIDER` is
still `hubspot` (the tests rely on it; changing it is deferred), so every
environment must set `CRM_PROVIDER=monday` explicitly. The identifiers
that still say `hubspot` are explained in `CRM_INTEGRATION.md` under
"Field meanings".

**Two fixes, one bug twice.** Both found and fixed on 2026-09-14:

- **`a84d653` — a deal now follows its Company (M) link on every sync.**
  Syncing a deal we already had refreshed its name and stage but never its
  company, so a change of Company (M) in monday was ignored by webhooks,
  the scheduled backfill and the TTL refresh alike. Three deals imported
  during the migration had been stuck under their referring agents, which
  made them invisible in the wizard for their merchants. The fix keeps
  three guards: only a primary bound company is accepted; an empty or
  unbound link leaves the deal where it is; and a deal already under any
  row bound to the same monday card — including the alias half of a
  duplicate pair — is not moved.
- **`4aeb134` — `last_synced_at` and "CRM updated" (`hubspot_modified_at`)
  now advance on every sync.** Both had been written only when a row was
  first inserted. Every bound row therefore looked permanently stale: the
  TTL refresh re-read it from monday on every view, the company page showed
  a "last synced" date from May, and "CRM updated" kept the HubSpot-era or
  creation date instead of the card's last change.

**What it taught.** Both were the same class of bug: a field the INSERT
branch of an upsert wrote and the UPDATE branch forgot. Nothing errored;
the value was simply frozen at its first write. When changing an upsert,
compare the INSERT and UPDATE branches field by field — a field the UPDATE
does not touch should be left alone on purpose, not by omission.

**monday was still operating on 2026-09-14.** This record does not
establish whether the trial described above was converted to a paid plan;
by the correction earlier in this record, only a non-null `account.plan`
proves that.

The operating manual, `CRM_INTEGRATION.md`, describes the system as it
runs now. `monday_migration_plan.md`, `monday_migration_analysis.md` and
`monday_audit_round4.md` are historical planning documents.

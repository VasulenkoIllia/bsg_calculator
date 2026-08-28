# monday migration — audit round 4 (2026-08-27)

Round 3 ended with a GO on Stage E and a must-fix list. This round fixed
that list, and re-auditing after the fixes turned up five more defects —
three of them in code that had no test coverage at all, which is the same
hole the round-3 blockers came through.

Everything below was reproduced before it was fixed and verified after.
Nothing here is "reasoned to be correct".

## Blockers — closed

**f1 — every bound-deal upsert failed.**
`upsertOneDeal` wrote `deals.crm_deleted_reason`; migration 0021 created
that column on `companies` only. Proved against `bsg_prodcopy`:
`column "crm_deleted_reason" of relation "deals" does not exist`.
Fixed, then re-proved by running the real backfill: 114 companies and 31
deals updated, no abort.

**f3 — every backfill run aborted in the missing-sweep.** (new this round)
`flagMissing` passed a JS array into `<> ALL(...)`. Drizzle expands an
array into a row constructor — `($1, $2, … $114)` — and Postgres answers
`op ANY/ALL (array) requires array on right side`. It now passes one
`jsonb` parameter, which also sidesteps the 65 535 bind-parameter ceiling.

Both faults are one-line mistakes in raw SQL that no type-checker can see,
and the backfill had **zero** tests. `server/tests/monday-backfill.integration.test.ts`
now covers both. The coverage was verified by mutation, not by assertion:
re-introducing f1 fails 2 tests, re-introducing f3 fails 3.

**E1 — the documented rollback was broken.**
Retagging the previous image while migrations stay applied is the natural
rollback, and it would have broken every note write: pre-0020 code sets
`hubspot_note_id` without `crm_note_provider`, which the 0020 CHECK
rejects. Confirmed on a copy of production, not deduced.

Migration **0023** adds a BEFORE INSERT/UPDATE trigger that fills the
marker in for such a write, so an image-only rollback is safe. Labelling
those writes `hubspot` is not a guess — code that predates the column has
no monday client and could only ever have written a HubSpot note. The
runbook gained the rollback recipe it never had (image → down script →
dump restore, smallest step first). Rollback was re-rehearsed with 0023 in
place: `__drizzle_migrations` 20 → 24 → 20, zero leftover columns, tables,
triggers or functions.

## High — closed

**f2 — the flip would have silently not happened.**
Stage F used `sed -i 's/^CRM_PROVIDER=.*/…/'`. `CRM_PROVIDER` defaults to
`hubspot` in `server/config/env.ts`, so the live `.env` has never contained
the key — `sed` matches nothing, exits 0, prints nothing. Replaced with an
idempotent upsert that also sets `AUTO_SYNC_TO_HUBSPOT`, and asserts a
count of 2. Tested against a mock `.env` in all three states: key absent,
key present, and run twice.

**MON-01 — archiving in monday unlocked an irreversible purge.**
monday reports archiving and deletion through the same signal. The purge
guard accepted any `crm_deleted_at`, so a one-click, reversible tidy-up on
the board made a company eligible for a hard delete of its signed
documents. The guard now refuses `crm_deleted_reason = 'archived'`, the
webhook no longer auto-deletes archived rows even when they own nothing,
and the badge shows a neutral "Archived in CRM" instead of a red
"Deleted" next to a button that refuses. Covered by 3 API tests and 3
component tests.

## Found while re-auditing — closed

**MON-05 — a truncated board read reported success.**
Both paginators stopped at a page cap and carried on as if they had the
whole board. In the backfill that hands `flagMissing` a short seen-list,
so live rows are flagged as missing from their board — a data-integrity
error reported as a clean pass. Both now raise instead.

**MON-06 — HubSpot-era scripts were not provider-gated.**
The runbook only ever appends to the live `.env`, so `HUBSPOT_API_TOKEN`
survives the flip and `reconcile-companies` / `hubspot-backfill` stay
runnable. Either would write HubSpot's view over monday-era rows;
`reconcile --prune-empty` additionally marks companies deleted. Both now
refuse unless `--force-hubspot-era` is typed out, and the automatic
startup backfill skips itself when monday is active.

**MON-07 — a duplicated board id would misroute every webhook.**
The controller maps board id → company/agent/deal and silently skips what
it does not recognise, so two ids being equal in `.env` routes one board's
events to the wrong object type. Now rejected at boot.

**MON-08 — deleting a legacy document destroyed the only record of its note.**
`softDeleteDocument` cleared `hubspot_note_id` on the stated assumption
that "we just tore down the upstream Note". That stopped being true at the
cutover: a HubSpot-era note is unreachable once monday is active, so the
teardown is skipped, the note stays on the customer's card, and its id was
erased. The id now moves to `legacy_hubspot_note_id` — the column 0020
added for exactly this and which nothing ever wrote to on this path.

**MON-09 — the cutover's central promise was untested.**
Every test in the suite ran with the default `CRM_PROVIDER=hubspot`, so
"legacy documents still delete cleanly after the flip" had only ever been
checked by hand. `server/tests/monday-era-delete.integration.test.ts` now
mocks the frozen env module and asserts that neither CRM is dialled.
It found MON-08 on its first run.

**MON-10 — the test suite attempted live calls to the HubSpot API.**
A full run was caught issuing nine outbound requests to
`https://api.hubapi.com`. `reconcile-companies.integration.test.ts` stubs
`getCompany` and states in its own header that "no real HTTP fires", but a
list endpoint on the same path was never stubbed. Each failed call was
then retried with 1s/2s/4s backoff, and that work outlived the test that
started it.

The suite must not reach a third-party service at all — and HubSpot goes
dark on 2026-08-31, after which those calls change behaviour again.
`server/tests/setup.ts` now replaces `globalThis.fetch` with a guard that
rejects any non-localhost request, naming the URL, so a stub that stops
working breaks its own test instead of a random one later. Ten consecutive
full runs since: zero blocked requests, i.e. nothing else in the suite
reaches outward.

## Test-suite flakiness — not a defect in this codebase

An intermittent failure (documented in `server/tests/setup.ts` since before
this migration) still appears in roughly 3 full runs in 10, never twice on
the same test. It is worth stating plainly what it is, because two earlier
explanations of mine were wrong.

The failures are **environmental**, caused by an HTTP proxy in the sandbox
these commands run in. The evidence is direct: one run failed with

```
loginAs creator@bsg.test failed: 503 ct=text/plain body={} text=Proxy key is incorrect
```

on `POST /api/v1/auth/login` — a route whose code can only ever answer
200, 400, 401 or 403, and which never emits plain text. The same
interference explains the other shapes seen: 404s with an empty body, and
a 15s timeout. No proxy is configured in the project, in npm, or in the
shell environment.

Two controls back this up: a bare loopback HTTP server took 600/600
requests cleanly, and supertest against a trivial Express app took 800/800
cleanly — so neither supertest nor loopback is at fault in isolation; the
interference appears only under a full run's port churn.

**Expected impact on the deploy: none.** It is not reproducible from the
application code, and CI is unaffected unless it runs behind the same kind
of interceptor. Two genuine improvements came out of chasing it and are
kept on their own merit:

- `server/shared/background-work.ts` — the three fire-and-forget
  schedulers now register their detached promise in a registry until it
  settles, and the suite awaits that. The previous mitigation drained a
  fixed number of event-loop ticks, which cannot bound an await chain
  spanning a network round-trip.
- `describeResponse()` in `server/tests/test-helpers.ts` — every login
  helper now reports status, content-type, body AND raw text. `failed:
  404` cannot distinguish "no route matched" from a `NotFoundError`; that
  ambiguity is what made this take as long as it did, and it is what
  finally produced the proxy evidence.

## Production hardening found on the way

**The connection pool could hang forever.** `pg` defaults
`connectionTimeoutMillis` to 0 — wait indefinitely — so all
`DB_POOL_MAX` (10) clients being busy is indistinguishable from the
database being down: requests pile up holding their HTTP connections,
nothing is logged, and the app simply stops answering. Now 10s and
configurable, so starvation surfaces as an error naming the query.

A `statement_timeout` was considered for the same reason and deliberately
NOT set: `server/db/migrate.ts` runs through this same pool, so a future
migration rewriting a large table would be killed halfway — a far worse
failure than a slow one.

## Verdict

GO on Stage E, unchanged from round 3 and now on firmer ground: with
`CRM_PROVIDER=hubspot` the whole change is provider-gated, and the four
migrations are additive and reversible — the rollback was rehearsed end to
end today (20 -> 24 -> 20, zero leftovers).

Backfill re-run against a copy of production after every fix: 114
companies, 31 deals, no abort; 62 documents, 62 distinct numbers, 0
orphans, 0 lost deal pins; 34 HubSpot-era notes still marked as such. The
28 real HubSpot deals are untouched, which is decision D12 holding.

Full suite: 425 tests across 35 files. Frontend: 408 across 47.
Typecheck clean on both projects; lint clean on every file this work
touched.

## Drift check against live monday — 2026-08-28

Re-verified against the live account after all the fixes, using the
production client and production column specs so it fails where the app
would fail. **No breaking change**: API version served as pinned; all
three boards active; every mapped column still resolves by its recorded id
with unchanged type; 72 companies + 42 agents + 31 deals, all active;
31/31 deals still carry their `Company (M)` link; every bound row points
at an active card and nothing new is unbound; zero cards edited since the
last sync.

The 122 bound rows reconcile exactly: 114 primary + 8 duplicate aliases →
114 distinct cards = 72 + 42.

The `TEST ILLIA SYNC` cards are no longer on any board — the end state the
plan asked for. Nothing in our database referenced them.

This is now `npm run monday:drift`, wired into the runbook as a pre-flight
step immediately before the Stage F freeze. It is read-only.

## Decisions — both now closed

- ~~**The BSPOK duplicate pair**~~ — **decided 2026-08-28: no change.**
  The primary flag is already on the correct row (both document numbers
  embed its HubSpot id, and numbers never change). The single historical
  deal stays on the alias row and is not pinnable to a BSPOK document;
  accepted, because nothing is pinned to it and every new deal from monday
  attaches to the primary row. See `monday_migration_plan.md` §open
  questions item 5 for the full reasoning and the one-line reversal.
- ⛔ **monday subscription is NOT paid — 3 days of trial left (2026-08-28).**
  An earlier entry here claimed the opposite. That was a misreading: the
  API returns `tier: "pro"`, which describes the **trial's feature tier**,
  not payment. `account.plan` returning `null` was the real signal, and the
  monday UI states plainly "You have 3 days left on your trial".

  **This is now the single highest risk in the whole migration.** The trial
  expires around 2026-08-31 — the same day HubSpot is switched off. If both
  lapse, the system has no working CRM at all: note writes fail, webhooks
  stop being served, and the backfill cannot read. There is no fallback,
  because the HubSpot account will be gone by then.

  Pay before the trial ends, and re-check with
  `account { plan { max_users period tier version } }` — a **non-null
  `plan`** is the confirmation, not `tier`.

  Capacity itself is not a concern: the observed ceiling is 1,000,000
  complexity per minute against ~3,000 for a full three-board pass.

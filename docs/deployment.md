# Deployment — Full-stack Production

**Date**: 2026-05-20 (Sprint 7.3)
**Target domain**: `<APP_DOMAIN>` (set in `.env`)
**Architecture**: single Docker image (Vite SPA + Express API + Chromium) behind Traefik, with a sibling Postgres 15 container.
**CRM**: monday.com — the only CRM since 2026-08-28; the HubSpot account no longer exists. The CRM sections and the update procedure (§6.1) were revised on 2026-09-14; the operating manual is [CRM_INTEGRATION.md](CRM_INTEGRATION.md).

---

## 1. Architecture

```
                  ┌───────────────────────────────────────┐
   public         │  Traefik (host)                       │
   HTTPS ────────►│   • TLS termination (Let's Encrypt)   │
                  │   • Router → app container :8080      │
                  └───────────────┬───────────────────────┘
                                  │ proxy network
                  ┌───────────────▼───────────────────────┐
                  │  app container  (bsg-calculator-app)  │
                  │   • Express :8080                     │
                  │     ├─ /api/*    → API handlers       │
                  │     └─ /*        → SPA static (/srv/spa) │
                  │   • Chromium for Puppeteer PDF render │
                  └───────────────┬───────────────────────┘
                                  │ default network
                  ┌───────────────▼───────────────────────┐
                  │  postgres container (bsg-postgres)    │
                  │   • postgres:15-alpine                │
                  │   • bsg_postgres_data named volume    │
                  └───────────────────────────────────────┘
```

- One container for FE+BE (no nginx — Express serves the SPA directly).
- Postgres is a sibling container; only the `app` reaches it via the internal Docker network.
- Migrations run inside the entrypoint script BEFORE the API listens; Drizzle's per-migration hash gates idempotency.
- The container runs as the non-root `node` user so Chromium can engage its built-in sandbox (no `--no-sandbox` flag).

> **Check against the host (2026-09).** This diagram and §3 describe the Traefik setup in the repository's `docker-compose.yml`. The production host keeps its own `docker-compose.yml`, which deploys never overwrite, and it also runs an unrelated reverse-proxy stack (see the `docker compose down` warning in §6.1). §1 and §3 may therefore not match the host; reconcile them before relying on them.

---

## 2. Files on the server

The image is built on the host, so the deploy directory (`<deploy-dir>`) holds the whole Docker build context plus two files that belong to the host:

| Path | Purpose |
|---|---|
| `src/`, `server/`, `scripts/`, `docker/` | source trees the `Dockerfile` copies into the image (`server/` includes the migrations; `docker/entrypoint.sh` waits for postgres, migrates, starts the server) |
| `Dockerfile`, `.dockerignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.server.json`, `vite.config.ts`, `postcss.config.cjs`, `tailwind.config.cjs`, `index.html` | root build files for the multi-stage build (SPA + API + Chromium) |
| `docker-compose.yml` | postgres + app (the repository version carries Traefik labels). The host keeps its own copy — deploys never overwrite it |
| `.env` | **your secrets** — filled in from `.env.production.example`; host-only, never committed, never overwritten by a deploy |

§6.1 is how the synced files are kept identical to a pinned commit.

---

## 3. Server prep — one-time

### 3.1 Traefik external network

The `app` service joins the existing Traefik network. If you don't have one yet:

```bash
docker network create proxy
```

Otherwise verify the name and update `TRAEFIK_NETWORK` in `.env` to match.

### 3.2 DNS

Point `<APP_DOMAIN>` (A or CNAME record) to the server's public IP. Traefik will request a Let's Encrypt cert via the configured resolver (env var `TRAEFIK_CERTRESOLVER`).

---

## 4. First deploy

### 4.1 Clone

```bash
git clone https://github.com/your-org/bsg-calculator.git <deploy-dir>
cd <deploy-dir>
git checkout main
```

This is for the first install only. Later updates are not pulled on the host: they are synced from a pinned commit (§6.1).

### 4.2 Configure `.env`

```bash
cp .env.production.example .env
nano .env   # fill in every REQUIRED value: the <REQUIRED> placeholders and the empty MONDAY_API_TOKEN
```

**Generate secrets locally before pasting them in:**

```bash
# JWT access secret (32+ chars)
openssl rand -base64 48

# Postgres password (alpha-num only is simpler for URL-encoding)
openssl rand -base64 32 | tr -d '+=/'

# monday webhook path secret (MONDAY_WEBHOOK_SECRET, 16+ chars)
openssl rand -hex 24
```

**Required values you must obtain ahead of time:**

| Var | Source |
|---|---|
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` (NEW per env) |
| `TOTP_ENCRYPTION_KEY` | `openssl rand -hex 32` (64 hex; encrypts 2FA secrets at rest — the app **refuses to boot in prod** with the all-zero dev default) |
| `DB_PASSWORD` | `openssl rand -base64 32 \| tr -d '+=/'` |
| `CRM_PROVIDER` | `monday` — set it explicitly. The code default is still `hubspot`, and with it production refuses to boot asking for HubSpot credentials (the HubSpot account no longer exists — do not supply them) |
| `MONDAY_API_TOKEN` | monday → Developer Center → My access tokens (personal API token). Production refuses to boot without it |
| `MONDAY_WEBHOOK_SECRET` | `openssl rand -hex 24` (16+ chars — production refuses to boot on a shorter one). It becomes part of the webhook URL, so treat that URL as a secret too |
| `APP_DOMAIN` | Your public host, e.g. `app.example.com` |
| `APP_PUBLIC_URL` | `https://${APP_DOMAIN}` |

Keep the other monday values from the template: `MONDAY_API_BASE_URL` must be exactly `https://api.monday.com/v2` in production, `MONDAY_API_VERSION=2026-07`, and the three `MONDAY_BOARD_*` ids (the defaults are the real boards) must differ. Two legacy-named variables are still used by monday and stay as in the template: `AUTO_SYNC_TO_HUBSPOT=true` (auto-posts notes to the active CRM; the code default is `false`) and `HUBSPOT_SYNC_TTL_SECONDS` (TTL refresh, default 300). HubSpot-only variables are not needed — see the retired HubSpot block in `.env.production.example`.

The `.env` file is **never committed**. Keep a copy outside the repo (1Password / Bitwarden / sealed-secret) so you can rebuild a host from scratch.

### 4.3 Build + start

```bash
# First boot: build the image locally + start postgres + app.
docker compose up -d --build

# Tail logs while the entrypoint waits for postgres + applies
# migrations + starts the server.
docker compose logs -f app
```

Expected log sequence on a green boot:

```
[entrypoint] waiting for postgres at postgres:5432 ...
[entrypoint] postgres reachable (after 3s)
[entrypoint] applying migrations ...
[entrypoint] migrations applied
[entrypoint] starting server: tsx server/index.ts
INFO  [bsg-calculator] API listening  port=8080 env=production
INFO  [startup] HubSpot backfill + webhook processor NOT started — HubSpot is not the active CRM  crmProvider=monday
INFO  [monday] API version confirmed  apiVersion=2026-07
INFO  [monday:webhook] processor started  pollMs=5000 batchSize=50
INFO  [monday:maintenance] scheduled backfill armed  everyHours=24 firstRunInMinutes=15
```

The three `[monday…]` lines appear only with `CRM_PROVIDER=monday`, and only after monday has confirmed the pinned API version. If you see `[startup] monday API version assertion FAILED — not starting the webhook processor. Fix MONDAY_API_VERSION.` instead, the webhook processor, the scheduled backfill and the hourly `[monday:health]` log are all off: fix `MONDAY_API_VERSION` — or `MONDAY_API_TOKEN`, because a rejected token fails the same check — and restart `app`. With `MONDAY_BACKFILL_INTERVAL_HOURS=0` the last line is replaced by a WARN saying the scheduled backfill is disabled.

### 4.4 Verify

```bash
# Container health (Docker's own probe):
docker compose ps         # both containers should be (healthy)

# API health from inside the host:
curl https://<APP_DOMAIN>/health
# → {"status":"ok","app":"bsg-calculator", ...}

# Readiness (probes the DB and the monday API; also reports the webhook queue):
curl https://<APP_DOMAIN>/ready
# → {"status":"ready","checks":{"db":"ok","monday":"ok"},
#    "mondayWebhookQueue":{"pending":0,"failed":0,"oldestPendingAgeSeconds":null,"lastProcessedAgeSeconds":null},
#    "ts":"..."}

# SPA reachable (returns the React shell HTML):
curl -I https://<APP_DOMAIN>/
```

`checks.monday` is a live `query { me { id } }` against monday with your token; `"fail"` turns the response into HTTP 503 with `"status":"degraded"` (usually a revoked token). `mondayWebhookQueue` is reported but never affects the status code — [CRM_INTEGRATION.md](CRM_INTEGRATION.md) §6 explains each field.

### 4.5 Create the bootstrap admin user

The fresh DB has no users. Create the first one — typically a
super-admin so they can later invite the rest via the (Stage 3) UI:

```bash
# Phase 8 Stage 1+ style: explicit --role.
docker compose exec app npx tsx server/scripts/create-user.ts \
  --email=admin@your-domain.com \
  --password='use-a-strong-pw' \
  --display='Admin' \
  --role=super_admin
```

Backward-compat shortcuts still work:
- `--admin` ≡ `--role=admin`
- `--super-admin` ≡ `--role=super_admin`
- no flag ≡ `--role=user` (least privileged)

You can now log in at `https://<APP_DOMAIN>/login`.

#### Optional: bootstrap super-admin via env

If you'd rather promote an existing user via env (e.g. after they
were created with `--admin` initially), set
`BOOTSTRAP_SUPER_ADMIN_EMAIL=admin@your-domain.com` in `.env` and
restart the app. The script promotes that user on every boot. It
is idempotent (already-super-admin = no-op) and never demotes, so
removing the env later doesn't strip privileges.

### 4.6 First monday sync

On a fresh install the companies table is empty. With the app up (§4.3) and `CRM_PROVIDER=monday`, `MONDAY_API_TOKEN` and `MONDAY_WEBHOOK_SECRET` set, run these in order:

1. **Drift check** — read-only; confirms the token, the pinned API version, the three boards and every mapped column. Run it before the first sync and before any structural change to the boards:

   ```bash
   docker compose run --rm --no-deps -T --entrypoint npm app run monday:drift
   ```

2. **Backfill** — loads every company, agent and deal from the three boards. It upserts and never deletes, so it is safe to re-run at any time:

   ```bash
   docker compose exec -T app npm run monday:backfill
   ```

3. **Register the webhooks** — 7 events × 3 boards = 21 webhooks, created with monday's `create_webhook` GraphQL mutation (same token, `API-Version: 2026-07`), all pointing at:

   ```
   <APP_PUBLIC_URL>/api/v1/monday/webhooks/<MONDAY_WEBHOOK_SECRET>
   ```

   - Boards: Companies `5102466967`, Agents `5102466950`, Deals `5102466996`.
   - Events: `create_item`, `change_column_value`, `change_name`, `item_deleted`, `item_archived`, `item_restored`, `item_moved_to_any_group`. Register these names; monday *delivers* different ones (`create_pulse`, `update_name`, `update_column_value`, `delete_pulse`, `archive_pulse`, `restore_pulse`, `move_pulse_into_group`), which `normaliseEventType` maps back onto ours.
   - One mutation per board × event, e.g.:

     ```graphql
     mutation {
       create_webhook (board_id: 5102466967, url: "<APP_PUBLIC_URL>/api/v1/monday/webhooks/<MONDAY_WEBHOOK_SECRET>", event: create_item) { id board_id }
     }
     ```

   - **The app must already be running with that secret.** monday sends a challenge to the URL when a webhook is created and refuses to register an endpoint that does not echo it back; the app answers only when the path secret matches `MONDAY_WEBHOOK_SECRET` (a wrong one gets 403, an unset one 404).
   - The URL contains the secret: keep it out of tickets, chat and shared shell history.
   - **Four pre-existing `change_specific_column_value` webhooks on these boards are not ours. Do not delete them** — not while cleaning up, not while re-registering. Listing the webhooks per board should show 8 / 9 / 8 (ours plus the foreign ones); the query is in [CRM_INTEGRATION.md](CRM_INTEGRATION.md) §6.

4. **Verify end to end** — edit a card on one of the boards and watch `docker compose logs -f app` for `[monday:webhook] event queued` followed by `[monday:webhook] batch complete`. An endpoint that answers 200 while the queue stays empty is the failure mode to fear (it cost the first cutover attempt — see [CRM_MIGRATION_RECORD.md](CRM_MIGRATION_RECORD.md)).

From then on changes flow in through the webhooks, with the TTL refresh and the scheduled backfill as safety nets ([CRM_INTEGRATION.md](CRM_INTEGRATION.md) §5). `server/scripts/monday-remap.ts` was the one-time tool that bound the legacy HubSpot-era rows to monday items during the migration; a fresh install does not need it.

### 4.7 Deleted and archived companies

A company deleted in monday is flagged (`crm_deleted_at`) by the webhook processor only after the monday API confirms the deletion — absence alone is never treated as one. If the company owns no documents and no calculators it is then removed; otherwise it is kept and badged **"Deleted in CRM"**. An **archived** card is only flagged (badge **"Archived in CRM"**), never removed, because archiving is reversible; restoring the card clears the flag. A card that simply stops appearing is marked **"Not found in CRM"** — an observation, never a deletion.

To remove a deleted company together with its documents, an `admin` / `super_admin` opens it and clicks **"Delete from system…"** (`DELETE /api/v1/companies/:id`). The action is audited, and it refuses unless the company is flagged as deleted in the CRM — an archived company is refused too.

> **HubSpot era (retired).** This section used to describe `server/scripts/reconcile-companies.ts` (`--prune-empty`, `--repoint`, `--purge`, `--mark`), which reconciled the cache against HubSpot. It refuses to run in monday mode. Do not use its `--force-hubspot-era` override — there is no HubSpot to roll back to. It has no use today. `docs/decisions.md` still refers to it as part of the historical record.

---

## 5. CRM configuration (monday.com)

(Do this ONCE per environment.) Everything is covered above: the token and webhook secret go into `.env` (§4.2), then the drift check, backfill and webhook registration (§4.6). Token rotation, webhook-secret rotation and health checks are in [CRM_INTEGRATION.md](CRM_INTEGRATION.md) §6–§8. Rotating `MONDAY_WEBHOOK_SECRET` changes the endpoint URL, so all 21 webhooks must be deleted and re-created — never touch the four foreign ones while doing so.

> **HubSpot era (retired).** Until 2026-08-28 this section set up a HubSpot Private App (`HUBSPOT_API_TOKEN`) and its webhook subscription to `/api/v1/hubspot/webhooks` (`HUBSPOT_WEBHOOK_SECRET`). The HubSpot account no longer exists; none of it applies, and there is no rollback to HubSpot. The migration is recorded in [CRM_MIGRATION_RECORD.md](CRM_MIGRATION_RECORD.md).

---

## 6. Day-2 operations

### 6.1 Apply updates

Production is updated by syncing a pinned commit into the deploy directory and rebuilding only `app` — not by `git pull` on the host (current procedure, 2026-09):

1. Choose the FULL commit SHA to deploy and work from a clean checkout of it (`git status` clean, no untracked files).
2. `rsync --delete` the `src/`, `server/`, `scripts/` and `docker/` directories into the deploy directory, and copy the root build files the `Dockerfile` uses: `Dockerfile`, `.dockerignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.server.json`, `vite.config.ts`, `postcss.config.cjs`, `tailwind.config.cjs`, `index.html`. Never overwrite the host's `.env` or `docker-compose.yml`.
3. Verify before building: a sha256 manifest of the synced files matches the checkout (every file identical, no leftovers), and the `docker-compose.yml` checksum is unchanged.
4. Tag the image that is running now so it can be restored: `docker tag bsg-calculator:latest bsg-calculator:rollback-<currently-deployed-sha>` (compose runs `bsg-calculator:latest` unless `APP_IMAGE` is set).
5. Build and recreate only the app:

   ```bash
   docker compose build app
   docker compose up -d --no-deps app
   # Postgres is not recreated; migrations apply in the entrypoint on boot.
   ```

6. Verify the boot. The three `[monday…]` lines from §4.3 must appear, and `/ready` must answer 200 with `"monday":"ok"`:

   ```bash
   docker compose logs --since 5m app | grep '\[monday'
   docker compose exec -T app curl -sS http://127.0.0.1:8080/ready
   ```

   `/ready` alone is not enough: if the boot-time API-version check failed, `checks.monday` can still be `"ok"` while nothing processes the webhook queue (§7).

**Never run `docker compose down`** on the host — it would take an unrelated reverse-proxy stack on the host down with it ([CRM_INTEGRATION.md](CRM_INTEGRATION.md) §8). Only ever recreate `app` with `--no-deps`.

### 6.2 Tail logs

```bash
docker compose logs -f app          # app + entrypoint
docker compose logs -f postgres     # DB
```

### 6.3 Database backup (`pg_dump` cron)

The Postgres data lives in the `bsg_postgres_data` Docker volume — survives container recreate but **NOT** `docker volume rm`. Daily snapshots are the operator's responsibility.

Sample crontab on the host:

```cron
# Daily 03:15 — dump the bsg_calculator DB to <deploy-dir>/backups/
15 3 * * * cd <deploy-dir> && docker compose exec -T postgres pg_dump -U bsg -Fc bsg_calculator > "backups/bsg-$(date +\%F).dump" && find backups/ -name 'bsg-*.dump' -mtime +30 -delete
```

Restore (manually, on a fresh server):

```bash
# In a NEW deploy, before users start using it:
docker compose exec -T postgres pg_restore -U bsg -d bsg_calculator -c < bsg-2026-05-20.dump
```

After a restore, sanity-check the document numbering sequence:

```sql
-- If MAX(seq) of stored documents is ahead of the singleton row,
-- the next save would collide. Bump the singleton manually:
SELECT MAX(split_part(number, '-', 2)::int) FROM documents;
SELECT next_value FROM document_number_sequence;
-- If max > next_value, run:
UPDATE document_number_sequence SET next_value = <max + 1>;
```

### 6.4 Rollback

Restore the image tagged before the deploy (§6.1 step 4):

```bash
docker tag bsg-calculator:rollback-<previous-sha> bsg-calculator:latest
docker compose up -d --no-deps --force-recreate app
```

`--force-recreate` makes sure the container is recreated from the re-pointed tag, even on a compose version that does not notice the image change. This rolls back code only — there is no CRM-provider rollback (the HubSpot account no longer exists); keep `CRM_PROVIDER=monday`.

Postgres data is unaffected. Migrations are forward-only — rolling back the container image does NOT undo schema changes. If a migration broke production, restore the DB from backup and pin the previous image.

### 6.5 Force a re-sync from monday

```bash
# Re-read all three boards (idempotent upsert, never deletes — safe any time):
docker compose exec -T app npm run monday:backfill
```

The same pass runs on its own every `MONDAY_BACKFILL_INTERVAL_HOURS` (default 24). Run it by hand after a webhook outage, or when `[monday:health]` reports failed events.

> **HubSpot era (retired):** this used to be `server/scripts/hubspot-backfill.ts`. It refuses to run in monday mode and cannot run against a HubSpot account that no longer exists. Do not use its `--force-hubspot-era` override — there is no HubSpot to roll back to.

### 6.6 Health endpoints

| Endpoint | Used by | Behavior |
|---|---|---|
| `GET /health` | Docker HEALTHCHECK | always 200 if Express is listening — no external deps |
| `GET /ready` | manual / load balancer | 200 only if the DB ping and the monday API probe (`checks.monday`) pass; 503 with `"status":"degraded"` otherwise. Also reports `mondayWebhookQueue`, which never affects the status code |

---

## 7. Troubleshooting

### "FATAL: DATABASE_URL is not set"
`.env` is missing or the var is empty. Re-check.

### "MONDAY_TOKEN_INVALID" in app logs
monday rejected the API token (revoked or rotated). Issue a new personal token in monday → replace `MONDAY_API_TOKEN` in `.env` → `docker compose up -d --no-deps app` (the restart picks up the new env). Until then `/ready` shows `"monday":"fail"` and every note write fails. Deliveries still arrive and queue (the endpoint authenticates with the URL secret), but the processor cannot re-read items, so each event fails and after 5 attempts — about two minutes after it arrived — is marked `failed`. After fixing the token, run `docker compose exec -T app npm run monday:backfill` and check `mondayWebhookQueue.failed` on `/ready`. Failed rows are kept for audit, so that count, and the ERROR in the hourly `[monday:health]` log, does not clear by itself. (If the app was restarted with the bad token, the processor is not running at all and events wait as `pending` — see the next entry.)

### "[startup] monday API version assertion FAILED"
monday did not confirm `MONDAY_API_VERSION` (or the check itself failed, e.g. on a rejected token or a transient network error). The check runs only once, at boot, so until the next restart the webhook processor, the scheduled backfill and the hourly `[monday:health]` log are **not running** — inbound changes only queue up. `/ready` does not reveal this: `checks.monday` probes the token, not the processor, so it can show `"ok"`; only a rising `mondayWebhookQueue.pending` gives it away. Fix the cause and restart `app`.

### Container loop-restarts during boot
Tail logs: `docker compose logs --tail=200 app`. Most common causes:
- Postgres password mismatch (compare `DB_PASSWORD` in `.env` to `DATABASE_URL`).
- Migration error → fix the migration locally, redeploy.
- `JWT_ACCESS_SECRET` is a placeholder → boot validator refuses to start.
- `[config/env] Invalid environment configuration` naming `HUBSPOT_API_TOKEN` / `HUBSPOT_WEBHOOK_SECRET` → `CRM_PROVIDER` is missing, so the code default `hubspot` applies. Set `CRM_PROVIDER=monday`; do not supply HubSpot values. It can also name `HUBSPOT_API_TOKEN` when a leftover `HUBSPOT_API_TOKEN` line has a value that does not start with `pat-` (checked whatever the provider) — delete that line.
- The same message naming a `MONDAY_*` variable → `MONDAY_API_TOKEN` empty, `MONDAY_WEBHOOK_SECRET` unset or shorter than 16 chars, `MONDAY_API_BASE_URL` not exactly `https://api.monday.com/v2`, two `MONDAY_BOARD_*` ids equal, `MONDAY_BACKFILL_INTERVAL_HOURS` outside 0–168, or `MONDAY_BACKFILL_FIRST_DELAY_MINUTES` outside 1–1440 (both whole numbers).

### Chromium fails to launch (PDF render 500's)
The base image has Chromium pre-installed. If you customised the image, ensure `chromium` + `chromium-sandbox` + `fonts-liberation` packages are present.

### PDF renders show blank pages
Check `/dev/shm` size:
```bash
docker compose exec app df -h /dev/shm
```
Default 64MB is fine for offer + agreement renders. If you bump it, set `shm_size: 256m` on the `app` service in compose.

---

## 8. What's NOT in this deploy

- No SMTP / email service (invites + password resets via copy-link only; see Phase 8 spec).
- No automated backups — operator must set up the `pg_dump` cron above.
- **No paging for the CRM integration.** Webhook-queue health is logged hourly (`[monday:health]`: ERROR when events have exhausted their retries, WARN when the oldest pending event is over 10 minutes old) and reported on `/ready`, but nothing notifies anyone. (CRM note write-back itself *is* in this deploy — see §9; the 2026-05 remark here that it was not yet implemented is obsolete.)
- **TOTP 2FA (Phase 8 Stage 2):** SHIPPED end-to-end (opt-in TOTP + backup
  codes + trusted devices + super-admin force-disable; two-step login UI +
  `/me` enrolment with QR; Google Authenticator / 1Password / Authy
  compatible). **Set `TOTP_ENCRYPTION_KEY` (`openssl rand -hex 32`) in prod
  before deploy — the app refuses to boot with the all-zero dev default.**
  Migrations 0018 + 0019 auto-apply (idempotent, forward-only).
- No alerting on sustained outage — failures show only in container logs.

## 9. CRM synchronization — current state (monday.com, 2026-09-14)

monday.com is the only CRM (production since 2026-08-28). The operating manual is [CRM_INTEGRATION.md](CRM_INTEGRATION.md); the migration is recorded in [CRM_MIGRATION_RECORD.md](CRM_MIGRATION_RECORD.md). This section is the deploy-level summary.

### Inbound (monday → our DB)
1. **Webhooks** — `POST /api/v1/monday/webhooks/:secret` checks the path secret, normalises the event name, dedupes, writes one row to `monday_webhook_events` and answers 200. A processor polls the queue every 5 s. The payload is only a trigger: every item is re-read from the API with our own token. A failing event is retried with a 30 s × attempts backoff; after 5 attempts it is marked `failed` — a change that was never applied.
2. **TTL refresh on read** — reading a bound company or deal whose `last_synced_at` is older than `HUBSPOT_SYNC_TTL_SECONDS` (default 300) re-reads that one item in the background (`server/modules/monday/monday.refresh.ts`). It never acts on absence and skips unbound rows.
3. **Scheduled backfill** — every `MONDAY_BACKFILL_INTERVAL_HOURS` (default 24; first run `MONDAY_BACKFILL_FIRST_DELAY_MINUTES` = 15 minutes after boot; `0` disables it and logs a WARN). Same code as `npm run monday:backfill`.

A deal belongs to the company in its **Company (M)** link, re-applied on every sync: only a primary-bound company is accepted, an empty or unbound link leaves the deal where it is, and a deal already under any row bound to that card (including the alias half of a duplicate pair) is not moved. Every sync also advances `last_synced_at` and the "CRM updated" column (`hubspot_modified_at`, holding the monday item's `updated_at`). Both behaviours were fixed on 2026-09-14 — before that, the update path forgot fields the insert path wrote; see [CRM_INTEGRATION.md](CRM_INTEGRATION.md) §7.

### Outbound (our DB → monday updates)
- Saving a document, or the first save of a calculator, posts a note — a monday "update" — in the background once the row is committed (`AUTO_SYNC_TO_HUBSPOT=true`). It goes to the deal card when the row is pinned to a deal, otherwise to the company card. The link in the note is built from `APP_PUBLIC_URL`.
- Manual retry / re-sync: the **"Sync to CRM"** button on `/documents/:number` and `/calc/:id` (`POST /api/v1/documents/:number/sync`, `POST /api/v1/calculator-configs/:id/sync`; admin+; 10/min/IP via the legacy-named `hubspotProxyLimiter`). Each manual sync creates a NEW update; a failed one leaves the row's sync state at `failed`.
- Note body: one line with the document type and number (or `Calculator` and the calculator's title), `Company: <name>` and `Created <date> by <name> (<email>)`, then a `Link` to the document or calculator page built from `APP_PUBLIC_URL`. Re-syncing a row that is already synced asks for confirmation first; the previous update stays on the card as history. A per-row Postgres advisory lock makes a concurrent second sync of the same row fail with 409, so a double click cannot post a duplicate.
- Every note is recorded in `crm_notes` with the provider that created it. Deleting a document or calculator removes every monday update recorded for it; notes from the HubSpot era are not attempted.

### Names that still say "hubspot"
Renaming the wire contract and DB vocabulary is deliberately deferred. What the legacy names mean today:

| Name | Meaning in the monday era |
|---|---|
| `companies.hubspot_company_id` | the company natural key; `deals.hubspot_company_id` is the deal → company FK. Companies created from monday carry synthetic keys `mon:<itemId>` |
| `hubspot_modified_at` | shown as "CRM updated"; holds the monday item's `updated_at` |
| `crm_item_id` / `crm_board_id` / `crm_binding_role` (`primary` \| `alias`) | the monday binding; `deals.crm_company_item_id` is the deal's Company (M) link |
| `hubspotSyncState`, `hubspotNoteId`, `HUBSPOT_UNREACHABLE`, `synced_to_hubspot`, `/api/v1/hubspot/*` | legacy names — the UI says "CRM" |
| `HUBSPOT_SYNC_TTL_SECONDS`, `AUTO_SYNC_TO_HUBSPOT` | env vars still used by monday (see §4.2) |

### Token rotation
Replace `MONDAY_API_TOKEN` in `.env` → `docker compose up -d --no-deps app` → `/ready` should show `"monday":"ok"`. The webhook registrations do not change (events that arrive while a revoked token is still in use fail — see §7). Rotating `MONDAY_WEBHOOK_SECRET` is different: it changes the endpoint URL, so the 21 webhooks must be re-created (§5).

> **HubSpot era (retired).** Until 2026-08-28 this section described the HubSpot integration: HMAC-signed webhooks to `/api/v1/hubspot/webhooks`, `hubspot-backfill.ts`, Note write-back through the HubSpot Notes API, pipeline stages loaded at boot, and a HubSpot token-rotation playbook. The HubSpot account no longer exists and there is no rollback to it; the code is still in the repo but dormant.

## 10. Upgrading from pre-Stage-1 to Stage 1 (one-time)

If you're upgrading an existing deploy that was running before Phase 8
Stage 1 (`is_admin` boolean era), here's what happens automatically
and what (if anything) you need to do manually.

### 10.1 What auto-applies on `docker compose up -d --build app`

1. New image runs entrypoint → migration `0007_user_role_enum.sql`
   applies in the same TX:
   - ADD `role text NOT NULL DEFAULT 'user'`
   - Backfill: every row where `is_admin=true` becomes `role='admin'`
   - DROP `is_admin` column
2. Server boots with the new JWT shape. Existing logged-in users
   have stale tokens (claim `isAdmin: bool` instead of
   `role: enum`). On their next API call:
   - The access token fails `verifyAccessToken()` → 401 INVALID
   - Frontend axios interceptor triggers `/auth/refresh`
   - Refresh succeeds (the cookie is unaffected) and mints a NEW
     access token with the `role` claim
   - The original request retries transparently
3. Net effect on existing operators: **zero downtime, single ~50ms
   hiccup on the first request after deploy.**

### 10.2 Promote existing admin to super-admin (optional)

If you want to promote your existing admin (now `role='admin'` post-
migration) to `super_admin`:

**Option A — via env (recommended for repeatability):**

```bash
nano <deploy-dir>/.env
# Add the line:
BOOTSTRAP_SUPER_ADMIN_EMAIL=admin@your-domain.com
docker compose up -d app
```

Boot logs will show `[bootstrap-super-admin] promoted user to super_admin`.

**Option B — direct SQL (one-shot):**

```bash
docker compose exec postgres psql -U bsg -d bsg_calculator -c \
  "UPDATE users SET role='super_admin' WHERE email='admin@your-domain.com';"
```

Either way, on the operator's next API call they'll have super-admin
privileges (Phase 8 Stages 3+).

---

## 11. Routine redeploy (Sprint 9.W + 9.X + later) — `git pull && rebuild`

> **Current procedure (2026-09):** production is no longer updated with `git pull` on the host — follow §6.1 (pinned full SHA, rsync, sha256 manifest check, rollback tag, `docker compose build app`, `docker compose up -d --no-deps app`). What this section says about migrations applying automatically on boot still holds; the command block below is historical.

For every sprint after the initial Stage 1 deploy, the redeploy
recipe is the same regardless of whether the sprint added new
migrations:

```bash
cd <deploy-dir>
git pull
docker compose up -d --build app
docker compose logs -f app | head -30   # confirm migrations applied
```

The entrypoint runs `npm run db:migrate` BEFORE the API listens, so
any new files in `server/db/migrations/` are applied idempotently.
The Drizzle journal (`server/db/migrations/meta/_journal.json`) is
checked in — production picks up new entries automatically. No
manual `psql` step is required.

### 11.1 Sprint-specific notes

- **Sprint 9.X.B (migration `0014_admin_actions_new_types.sql`)** —
  drops + recreates the `admin_actions.action_type` CHECK to add 6
  new vocabulary values (`document.created`, `document.synced`, and
  the `calc.*` quartet). DDL-only, touches no row data; existing
  rows that pre-date the new vocabulary keep their old action_types
  and remain valid (the CHECK is only enforced on INSERT/UPDATE).
- **Sprint 9.W + 9.X.A + 9.X.C** — no DB changes. Pure FE
  restructure + additive BE JOINs / filter params. Rolling back the
  container to a pre-sprint image is safe — no schema state to
  unwind.

### 11.2 Post-redeploy smoke

After `docker compose up -d --build app`:

1. Visit `https://<APP_DOMAIN>` — should serve the SPA.
2. `/documents` listing — every row now shows "by &lt;creator&gt;"
   under the CREATED date.
3. `/calculators` listing — Company filter dropdown visible above
   the table; row "Updated" cell shows creator subline.
4. `/audit-log` (super_admin) — 4 filter widgets visible
   (action / target / company / actor). Try selecting a company,
   then the target dropdown should show user / invite / reset
   options disabled with the "(no company link)" suffix.
5. Create + delete a calc-config — audit log should record both
   `calc.created` and `calc.deleted` rows with the correct
   companyId in meta.

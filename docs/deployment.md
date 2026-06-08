# Deployment — Full-stack Production

**Date**: 2026-05-20 (Sprint 7.3)
**Target domain**: `bsg.workflo.space`
**Architecture**: single Docker image (Vite SPA + Express API + Chromium) behind Traefik, with a sibling Postgres 15 container.

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

---

## 2. Files on the server

You need exactly these files in the deploy directory (e.g. `/srv/bsg/`):

| File | Purpose |
|---|---|
| `Dockerfile` | multi-stage build (SPA + API + Chromium) |
| `docker-compose.yml` | postgres + app + Traefik labels |
| `docker/entrypoint.sh` | wait-for-postgres + migrate + start server |
| `.env` | **your secrets** — fill in from `.env.production.example` |

Everything else (source code, migrations, package.json) is pulled in by the Docker build.

---

## 3. Server prep — one-time

### 3.1 Traefik external network

The `app` service joins the existing Traefik network. If you don't have one yet:

```bash
docker network create proxy
```

Otherwise verify the name and update `TRAEFIK_NETWORK` in `.env` to match.

### 3.2 DNS

Point `bsg.workflo.space` (A or CNAME record) to the server's public IP. Traefik will request a Let's Encrypt cert via the configured resolver (env var `TRAEFIK_CERTRESOLVER`).

---

## 4. First deploy

### 4.1 Clone

```bash
git clone https://github.com/your-org/bsg-calculator.git /srv/bsg
cd /srv/bsg
git checkout main
```

### 4.2 Configure `.env`

```bash
cp .env.production.example .env
nano .env   # fill in every <REQUIRED> placeholder
```

**Generate secrets locally before pasting them in:**

```bash
# JWT access secret (32+ chars)
openssl rand -base64 48

# Postgres password (alpha-num only is simpler for URL-encoding)
openssl rand -base64 32 | tr -d '+=/'
```

**Required values you must obtain ahead of time:**

| Var | Source |
|---|---|
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` (NEW per env) |
| `DB_PASSWORD` | `openssl rand -base64 32 \| tr -d '+=/'` |
| `HUBSPOT_API_TOKEN` | HubSpot → Settings → Integrations → Private Apps → your app → Auth → "Access token" (starts with `pat-na1-…`) |
| `HUBSPOT_WEBHOOK_SECRET` | HubSpot → Private App → Webhooks → "Signing secret" (32-char hex) |
| `APP_DOMAIN` | Your public host, e.g. `bsg.workflo.space` |
| `APP_PUBLIC_URL` | `https://${APP_DOMAIN}` |

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
INFO  [hubspot:webhook] starting processor loop
```

### 4.4 Verify

```bash
# Container health (Docker's own probe):
docker compose ps         # both containers should be (healthy)

# API health from inside the host:
curl https://bsg.workflo.space/health
# → {"status":"ok","app":"bsg-calculator", ...}

# Readiness (probes DB):
curl https://bsg.workflo.space/ready
# → {"status":"ready","checks":{"db":"ok","hubspot":"ok"}, ...}

# SPA reachable (returns the React shell HTML):
curl -I https://bsg.workflo.space/
```

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

You can now log in at `https://bsg.workflo.space/login`.

#### Optional: bootstrap super-admin via env

If you'd rather promote an existing user via env (e.g. after they
were created with `--admin` initially), set
`BOOTSTRAP_SUPER_ADMIN_EMAIL=admin@your-domain.com` in `.env` and
restart the app. The script promotes that user on every boot. It
is idempotent (already-super-admin = no-op) and never demotes, so
removing the env later doesn't strip privileges.

### 4.6 First HubSpot pull

The companies table is empty. Trigger the one-time backfill:

```bash
docker compose exec app npx tsx server/scripts/hubspot-backfill.ts
```

This pulls every `direct_client` company + its deals from HubSpot. Expect ~1 minute for a few hundred merchants. Subsequent updates flow through the webhook receiver.

### 4.7 Reconciling merged / deleted companies (drift)

`company.merge` and `company.deletion` webhooks keep the cache in sync going forward (a merge re-points the merged-away company's documents/configs/deals onto the surviving company, then removes it — documents are never deleted). To repair **pre-existing drift** — a company that was merged/deleted in HubSpot while the merge handler wasn't deployed, so it lingers locally and 404s — use the reconcile script:

```bash
# 1. Review (dry-run): lists local companies that no longer exist in
#    HubSpot, with document/deal counts and the recommended action.
docker compose exec app npx tsx server/scripts/reconcile-companies.ts

# 2a. Drifted company with NO documents → prune it (safe; deals first).
docker compose exec app npx tsx server/scripts/reconcile-companies.ts --prune-empty

# 2b. Drifted company WITH documents, MERGED upstream → fold it into its
#     survivor. Find the survivor id by opening the drifted company in
#     HubSpot (a merged record redirects to the surviving company).
docker compose exec app npx tsx server/scripts/reconcile-companies.ts --repoint <driftedHubspotId> <survivorHubspotId>

# 2c. Drifted company WITH documents, DELETED upstream (no survivor — the
#     HubSpot URL shows "not found", not a redirect) → purge it together
#     with its documents. Previews first; add --yes to actually delete.
docker compose exec app npx tsx server/scripts/reconcile-companies.ts --purge <driftedHubspotId>
docker compose exec app npx tsx server/scripts/reconcile-companies.ts --purge <driftedHubspotId> --yes

# 2d. RETROACTIVELY flag all document-owning drift as "Deleted in HubSpot"
#     (= what the deletion webhook now does). Use this for PRE-FIX drift
#     whose deletion event already failed before the marker existed — after
#     it, those companies show the badge + the admin "Delete from system"
#     button, so the whole flow is visible/testable in the UI.
docker compose exec app npx tsx server/scripts/reconcile-companies.ts --mark
```

`--repoint` re-points the drifted company's documents/configs/deals onto the survivor and then removes it (the same path as a live `company.merge`). `--purge` is for a company that was DELETED upstream (so has no survivor): it permanently removes the company + its documents/configs/deals — and refuses unless HubSpot 404s the id (it never deletes the documents of a company that still exists upstream). Always run the dry-run / preview first.

> **Admin UI alternative (no SSH):** an `admin` / `super_admin` can do the equivalent of `--purge` from the app — open a company badged **"Deleted in HubSpot"** and click **"Delete from system…"** (`DELETE /api/v1/companies/:id`). It is role-gated AND refuses unless the company is flagged `hubspot_deleted_at`, and every purge is audited (`admin_actions` → `company.purged`, with the deleted document/deal counts). The reconcile script stays the tool for bulk drift discovery + the merge `--repoint` path.

> **What happens when HubSpot deletes a company that owns documents:** `documents.company_id → companies.id` is **ON DELETE RESTRICT** — a guard so a HubSpot deletion can never silently wipe offer documents (legal records). The `company.deletion` webhook therefore can't hard-delete such a company; instead it now **marks it `hubspot_deleted_at`** and keeps the row + its documents (the admin shows a red "Deleted in HubSpot" badge; Note-sync is skipped; a later HubSpot restore auto-clears the marker). The pre-fix leftovers ("test" / "(M) TEST 1 c") predate this behavior and lingered as `failed` webhook events instead — clean them up with `--purge` (they were DELETED upstream, so have no survivor to `--repoint` into).

---

## 5. HubSpot configuration

(Do this ONCE per environment.)

### 5.1 Private App

Settings → Integrations → **Private Apps** → Create.

Scopes needed:
- `crm.objects.companies.read` + `crm.objects.companies.write`
- `crm.objects.deals.read` + `crm.objects.deals.write`
- `crm.schemas.deals.read`
- `crm.objects.notes.read` + `crm.objects.notes.write`
- (Phase 9 will use `notes.write` for the Note write-back)

Copy the **Access token** → `HUBSPOT_API_TOKEN` in `.env`.

### 5.2 Webhooks

In the same Private App → **Webhooks** tab:

- **Target URL**: `https://bsg.workflo.space/api/v1/hubspot/webhooks`
- **Signing secret**: copy → `HUBSPOT_WEBHOOK_SECRET` in `.env`
- **Subscriptions**: enable
  - `company.creation`, `company.deletion`, `company.propertyChange` (subscribe to every property)
  - `deal.creation`, `deal.deletion`, `deal.propertyChange`

After saving, send a test event from the HubSpot UI. Watch `docker compose logs app` — you should see one log line per delivery + a `[hubspot:webhook] processed event`.

---

## 6. Day-2 operations

### 6.1 Apply updates

```bash
cd /srv/bsg
git pull
docker compose up -d --build app
# Postgres is not recreated; only the app image rebuilds.
```

### 6.2 Tail logs

```bash
docker compose logs -f app          # app + entrypoint
docker compose logs -f postgres     # DB
```

### 6.3 Database backup (`pg_dump` cron)

The Postgres data lives in the `bsg_postgres_data` Docker volume — survives container recreate but **NOT** `docker volume rm`. Daily snapshots are the operator's responsibility.

Sample crontab on the host:

```cron
# Daily 03:15 — dump the bsg_calculator DB to /srv/bsg/backups/
15 3 * * * cd /srv/bsg && docker compose exec -T postgres pg_dump -U bsg -Fc bsg_calculator > "backups/bsg-$(date +\%F).dump" && find backups/ -name 'bsg-*.dump' -mtime +30 -delete
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

```bash
git checkout <previous-commit>
docker compose up -d --build app
```

Postgres data is unaffected. Migrations are forward-only — rolling back the container image does NOT undo schema changes. If a migration broke production, restore the DB from backup and pin the previous image.

### 6.5 Force a re-pull from HubSpot

```bash
# Reseed companies + deals (idempotent UPSERT — safe to re-run):
docker compose exec app npx tsx server/scripts/hubspot-backfill.ts
```

### 6.6 Health endpoints

| Endpoint | Used by | Behavior |
|---|---|---|
| `GET /health` | Docker HEALTHCHECK | always 200 if Express is listening — no external deps |
| `GET /ready` | manual / load balancer | 200 only if DB ping passes; 503 otherwise |

---

## 7. Troubleshooting

### "FATAL: DATABASE_URL is not set"
`.env` is missing or the var is empty. Re-check.

### "HUBSPOT_TOKEN_INVALID" in app logs
The Private App token was revoked or rotated. Issue a new token in HubSpot → paste into `.env` → `docker compose up -d app` (restart picks up the new env).

### Container loop-restarts during boot
Tail logs: `docker compose logs --tail=200 app`. Most common causes:
- Postgres password mismatch (compare `DB_PASSWORD` in `.env` to `DATABASE_URL`).
- Migration error → fix the migration locally, redeploy.
- `JWT_ACCESS_SECRET` is a placeholder → boot validator refuses to start.

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
- **HubSpot Note write-back is NOT YET IMPLEMENTED.** `POST /api/v1/documents/:number/sync` returns `501 NOT_IMPLEMENTED`. The frontend does not surface a "Sync to HubSpot" button — only a read-only status badge on the documents list. Manual curl to the sync endpoint returns a clean 501. Phase 9 will implement `hubspot.client.createNote()` + wire the controller.
- **TOTP 2FA (Phase 8 Stage 2):** SHIPPED end-to-end (opt-in TOTP + backup
  codes + trusted devices + super-admin force-disable; two-step login UI +
  `/me` enrolment with QR; Google Authenticator / 1Password / Authy
  compatible). **Set `TOTP_ENCRYPTION_KEY` (`openssl rand -hex 32`) in prod
  before deploy — the app refuses to boot with the all-zero dev default.**
  Migrations 0018 + 0019 auto-apply (idempotent, forward-only).
- No alerting on sustained outage — failures show only in container logs.

## 9. HubSpot synchronization — current state (Phase 9 / 2026-05-21)

### Inbound (HubSpot → our DB) — ✅ WORKS
Three pull paths, all production-ready:
1. **One-time backfill** (`docker compose exec app npx tsx server/scripts/hubspot-backfill.ts`) — pulls every `direct_client` company + its deals, idempotent via UPSERT.
2. **Webhook receiver** (`POST /api/v1/hubspot/webhooks`) — HMAC-SHA-256 verified, 5-minute replay window, async queue in `hubspot_webhook_events` table, retry budget = 5, 30s × attempt backoff. Sprint 7.4 added a token-failure circuit-breaker (3 consecutive 401s → batch aborts + emits `HUBSPOT_TOKEN_INVALID` ERROR log).
3. **TTL refresh** (fire-and-forget on cache hit if `last_synced_at > 5min ago`) — refreshes single company/deal in background.

Sprint 7.4 also fixed a correctness bug where deals whose primary HubSpot company association was filtered out (`WORLDFY OY` style) would silently land as `filtered_out` instead of using the fallback company from `associations.companies.results`.

### Outbound (our DB → HubSpot Notes) — ✅ WORKS (Phase 9)

**Two surfaces sync to HubSpot Notes:**
1. `POST /api/v1/documents/:number/sync` — frozen documents (Offer/Agreement)
2. `POST /api/v1/calculator-configs/:id/sync` — saved calc-configs (Phase 9.I)

**Both flows:**

1. Loads the document by BSG number + its parent company.
2. Builds a plain-text Note body via `server/modules/documents/note-builder.ts` (BSG number, scope, key contract terms from payload, addendum if any, clickable link back to `/documents/:number`).
3. Calls HubSpot **POST /crm/v3/objects/notes** with the body.
4. Calls HubSpot **PUT /crm/v4/objects/notes/{noteId}/associations/default/{deal|company}/{id}** to attach the Note to either the document's `hubspotDealId` (preferred) or the parent company's `hubspot_company_id` (fallback).
5. Updates `documents.hubspot_note_id` + `hubspot_sync_state='synced'`.

On HubSpot failure → `hubspot_sync_state='failed'` is persisted BEFORE the error propagates, so the next GET shows the failed badge + Retry CTA in the UI.

**Operator policy**: each manual Sync click creates a NEW Note in HubSpot (audit trail). `hubspot_note_id` always points to the most recent. Older Notes from previous syncs stay in HubSpot — operator can clean them up manually if they don't want clutter.

**Auto-sync (Phase 9.G / 9.I)**: with `AUTO_SYNC_TO_HUBSPOT=true` in `.env` (renamed from `AUTO_SYNC_DOCUMENTS_TO_HUBSPOT` in Sprint 9.L; the old name is still accepted as a fallback), every successful `POST /documents` AND every first save of a calc-config schedules a fire-and-forget sync via `setImmediate` AFTER the DB transaction commits. The operator gets a clean 201/200 immediately; the badge flips `not_synced → synced` (or `failed`) in the background.

**Calculator sync (Phase 9.I; updated Cycle 2 — 2026-06-07)**: ONE operator-confirmed difference from documents:
1. Auto-saves (`PUT /calculator-configs/:id`) DO NOT touch HubSpot. The Note's `Link` always opens our SPA which renders the freshest state.

Otherwise calculators now follow the SAME create-new-each-time policy as documents: each manual Sync click on `/calc/:id` creates a **NEW** Note in HubSpot (older ones stay as an audit trail; `hubspot_note_id` points to the most recent). Re-syncing an already-synced calc shows a confirm dialog first ("creates a NEW HubSpot Note"). The earlier Phase 9.K "one Note per calc / PATCH-in-place (with a 404→CREATE self-heal)" policy was **removed** so the dialog wording is accurate. A per-row `calc-sync:` advisory lock still prevents double-click duplicates.

**Note body format (Phase 9.H)**: compact one-liner + clickable link:
```
Offer BSG-7100001-099930 // Company: (A) TEST 1 // Created 21.05.2026, 15:40 by Admin (admin@bsg.test)
Link  (href: https://bsg.workflo.space/documents/BSG-7100001-099930)
```
Plus `Calculator: <title> // …` variant for calc-configs.

**Required HubSpot scope**: `crm.objects.contacts.write` is sufficient per HubSpot Notes API docs ([developers.hubspot.com/docs/api/crm/notes](https://developers.hubspot.com/docs/api/crm/notes)). The Private App's existing scopes cover it — verified against `(A) TEST 1 c` in production 2026-05-21. No standalone `crm.objects.notes.*` scope is required by HubSpot.

**Frontend triggers**:
- `/documents/:number` → "Sync to HubSpot" button (admin+).
- `/calc/:id` → "Sync to HubSpot" button in the sticky toolbar (admin+).
Both gated by `requireRole('admin')` BE + `hasRole('admin')` FE so regular users don't see buttons that would 403.

**Rate limit**: `hubspotProxyLimiter` = 10/min/IP per sync endpoint. Comfortably under HubSpot's per-Private-App 100 req / 10s ceiling even when an operator spams Sync.

### Pipeline stages — pulled on app boot
The deal pipeline + stage labels are fetched once at server startup via `hubspot.listPipelineStages()` and cached for 1 hour in-memory. To pick up new stages added in HubSpot before the TTL expires, restart the app container (`docker compose restart app`).

### Token-rotation playbook
1. Generate new Private App access token in HubSpot.
2. `nano /srv/bsg/.env` → replace `HUBSPOT_API_TOKEN`.
3. `docker compose up -d app` (restart picks up the new env).
4. Watch logs: `docker compose logs -f app | grep -i hubspot`.
5. Verify: `curl https://bsg.workflo.space/ready` should show `"hubspot":"ok"`. If it shows `"fail"`, the new token was rejected — re-check.

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
nano /var/www/projects/bsg_calculator/.env
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

For every sprint after the initial Stage 1 deploy, the redeploy
recipe is the same regardless of whether the sprint added new
migrations:

```bash
cd /var/www/projects/bsg_calculator
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

1. Visit `https://bsg.workflo.space` — should serve the SPA.
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

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

The fresh DB has no users. Create the first admin from inside the running container:

```bash
docker compose exec app npx tsx server/scripts/create-user.ts \
  --email=admin@your-domain.com \
  --password='use-a-strong-pw' \
  --display='Admin' \
  --admin
```

You can now log in at `https://bsg.workflo.space/login`.

### 4.6 First HubSpot pull

The companies table is empty. Trigger the one-time backfill:

```bash
docker compose exec app npx tsx server/scripts/hubspot-backfill.ts
```

This pulls every `direct_client` company + its deals from HubSpot. Expect ~1 minute for a few hundred merchants. Subsequent updates flow through the webhook receiver.

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
- No HubSpot Note write-back yet (Sprint stub returns 501; Phase 9).
- No 2FA on login yet (Phase 8 Stage 2).
- No alerting on sustained outage — failures show only in container logs.

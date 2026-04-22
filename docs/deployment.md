# Deployment (Frontend Test Environment)

Date: 2026-04-23
Target domain: `bsg.workflo.space`

This project is currently deployed as a frontend SPA container behind Traefik.

## 1. Runtime model

- Build: Vite production build (`npm run build`)
- Runtime image: nginx (serves static files from `dist/`)
- Internal container port: `80`
- Health endpoint: `GET /health`
- SPA routing: nginx fallback `try_files ... /index.html`

## 2. Required environment variables

Use `.env` (copy from `.env.example`):

- `APP_NAME` - docker/traefik naming key (example: `bsg-calculator`)
- `APP_DOMAIN` - public host (must be `bsg.workflo.space` for current test target)
- `PORT` - host port mapped to container port `80` (example: `8080`)
- `TZ` - container timezone (example: `Europe/Kyiv`)
- `TRAEFIK_NETWORK` - external traefik docker network (example: `proxy`)
- `TRAEFIK_ENTRYPOINT` - traefik entrypoint (example: `websecure`)
- `TRAEFIK_TLS` - TLS on/off (`true`)
- `TRAEFIK_CERTRESOLVER` - cert resolver name (example: `cf`)

## 3. Traefik routing

`docker-compose.yml` configures labels:

- Router rule: `Host(`${APP_DOMAIN}`)`
- Service target port: `80`
- TLS/entrypoint/resolver from env vars
- Traefik network from `${TRAEFIK_NETWORK}`

## 4. Server deploy steps

1. Clone/pull project on server.
2. Create env file:

```bash
cp .env.example .env
```

3. Set test values in `.env`:

```dotenv
APP_NAME=bsg-calculator
APP_DOMAIN=bsg.workflo.space
PORT=8080
TZ=Europe/Kyiv
TRAEFIK_NETWORK=proxy
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_TLS=true
TRAEFIK_CERTRESOLVER=cf
```

4. Ensure Traefik external network exists:

```bash
docker network ls | grep -q "\bproxy\b" || docker network create proxy
```

5. Start container:

```bash
docker compose up -d --build
```

6. Validate:

```bash
docker compose ps
curl -f http://127.0.0.1:${PORT}/health
curl -I https://bsg.workflo.space
```

## 5. Operational notes

- This container serves only frontend assets and `/health`.
- No database migrations or backend bootstrap are required in current stage.
- Existing `server/` code is not used for production serving in this setup.

## 6. Rollback

1. Revert to previous git revision on server.
2. Rebuild/restart:

```bash
docker compose up -d --build
```

3. Re-validate `/health` and domain response.

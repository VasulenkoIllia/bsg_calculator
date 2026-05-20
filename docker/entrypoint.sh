#!/bin/sh
# ─────────────────────────────────────────────────────────────────
# BSG Calculator container entrypoint — Sprint 7.3.A.
#
# Single source of truth for the boot sequence:
#   1. Wait for Postgres to accept TCP connections (Coolify /
#      docker-compose `depends_on: condition: service_healthy`
#      already gates this on the postgres side, but we keep an
#      explicit retry loop so the entrypoint is self-sufficient
#      when run via `docker run` without compose).
#   2. Apply Drizzle migrations idempotently — running the same
#      migrate command against an already-current DB is a no-op
#      because Drizzle stores applied-migration hashes in the
#      `__drizzle_migrations` table.
#   3. Exec the actual server process (defaults to `tsx
#      server/index.ts` from Dockerfile CMD). Using `exec` makes
#      the server PID 1 (under tini) so SIGTERM from `docker stop`
#      reaches Node directly → graceful shutdown.
#
# Why a shell script + tsx rather than a compiled bundle:
#   See Dockerfile header comment — `tsx` is in `dependencies` and
#   the Bundler-style imports in server/* don't need .js
#   extensions, which keeps the dev/prod boundary thin.
# ─────────────────────────────────────────────────────────────────

set -eu

# ─── 1. Wait for Postgres ────────────────────────────────────────
# We parse DATABASE_URL only to extract host + port. We do not
# attempt to authenticate — the actual auth happens inside the
# migrate command. A simple TCP poke is enough.
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] FATAL: DATABASE_URL is not set" >&2
  exit 1
fi

# Strip the URL down to host + port using a portable awk pipeline:
#   postgres://user:pass@host:port/db?opts  →  host:port
DB_HOSTPORT="$(printf '%s' "$DATABASE_URL" \
  | awk -F'[/@]' '{print $4}' \
  | awk -F'?' '{print $1}')"
DB_HOST="${DB_HOSTPORT%:*}"
DB_PORT="${DB_HOSTPORT##*:}"
# Fall back to 5432 if the URL omitted the port.
if [ "$DB_HOST" = "$DB_PORT" ] || [ -z "$DB_PORT" ]; then
  DB_PORT=5432
fi

echo "[entrypoint] waiting for postgres at $DB_HOST:$DB_PORT ..."

# Up to 60 attempts × 1s = 60s. Coolify's default deploy timeout is
# generous; if Postgres needs >60s the operator should already be
# investigating the postgres container directly.
i=0
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "[entrypoint] FATAL: postgres did not become reachable in 60s" >&2
    exit 1
  fi
  sleep 1
done
echo "[entrypoint] postgres reachable (after ${i}s)"

# ─── 2. Apply migrations ─────────────────────────────────────────
# Drizzle's migrator is idempotent — already-applied migrations are
# skipped. If a migration fails, the script exits non-zero and the
# container restarts; Postgres holds an advisory lock during the
# migration so two replicas booting in parallel won't both try to
# apply the same migration twice.
echo "[entrypoint] applying migrations ..."
tsx server/db/migrate.ts
echo "[entrypoint] migrations applied"

# ─── 3. Hand off to the server ───────────────────────────────────
# `exec` replaces this shell with the server process so signals
# from `docker stop` reach Node directly (tini → node, not
# tini → sh → node).
echo "[entrypoint] starting server: $*"
exec "$@"

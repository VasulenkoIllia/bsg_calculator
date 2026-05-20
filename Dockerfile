# ─────────────────────────────────────────────────────────────────
# BSG Calculator — single-image production build
# Sprint 7.3.A (2026-05-20).
#
# One container hosts both the Vite SPA and the Express API:
#   - Express owns `/api/*` routes (auth, calc-configs, documents,
#     hubspot webhooks, PDF render, etc.)
#   - Express serves the built SPA static assets from `/srv/spa/`
#     with an SPA-history fallback (any non-`/api/*` 404 returns
#     `index.html` so React Router handles client-side routing).
#
# We use `tsx` as the runtime instead of compiling TS → JS. The
# overhead is acceptable for a single-process internal tool and
# avoids fighting Node ESM `.js`-extension rules across the
# Bundler-resolved server tree.
# ─────────────────────────────────────────────────────────────────

# ─── Stage 1: build the Vite SPA ─────────────────────────────────
FROM node:20-alpine AS spa-build

WORKDIR /app

# Install full deps for the build (we need devDependencies for Vite,
# TypeScript, Tailwind, PostCSS).
COPY package.json package-lock.json ./
RUN npm ci

# Copy only what `npm run build` (= `tsc -p tsconfig.json && vite build`)
# needs. Server-side code is NOT shipped in this stage.
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY postcss.config.cjs ./
COPY tailwind.config.cjs ./
COPY index.html ./
COPY src ./src

RUN npm run build
# Produces /app/dist/{index.html, assets/*}.


# ─── Stage 2: runtime image with Chromium for Puppeteer ─────────
# Using the official Puppeteer image variant is the simplest path to
# Chromium + matching system fonts/libs (libnss3, libatk-bridge,
# fontconfig, etc). The slim Debian variant is smaller than the full.
FROM node:20-bookworm-slim AS runtime

# Install Chromium + the libs Puppeteer needs. Pinning the package
# names from the Debian repo we get a stable Chromium that matches
# the puppeteer-core version pinned in package.json.
#
# `chromium-sandbox` provides the setuid-sandbox helper so we can
# run with the proper sandbox (Sprint 7.3.E: drops --no-sandbox).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      chromium-sandbox \
      fonts-liberation \
      fonts-noto-color-emoji \
      fonts-noto-cjk \
      ca-certificates \
      tini \
      curl \
      netcat-openbsd \
 && rm -rf /var/lib/apt/lists/*

# `tini` is our PID 1 — it forwards SIGTERM to Node correctly so
# graceful shutdown (DB pool drain, Puppeteer pool close) works
# on `docker stop`.
# `curl` is used by the docker-compose HEALTHCHECK; tiny addition.
# `netcat-openbsd` is used by docker/entrypoint.sh to probe Postgres
# reachability (`nc -z host port`) before running migrations.
# Sprint 7.4 (audit) — without this the entrypoint crashed with
# `sh: nc: not found` BEFORE migrations could even run.

# Tell Puppeteer to use the system Chromium rather than the bundled
# one (avoids re-downloading + matches the version we just apt-installed).
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Sprint 7.4 (audit B1 follow-up): expose node_modules/.bin on PATH
# so `tsx` (and any other dependency binary) resolves from a plain
# shell. Without this the entrypoint dies with `tsx: not found`
# even though the package is installed — npm only auto-adds .bin
# to PATH when running through `npm run ...`, NOT for direct
# `tsx server/...` invocations from sh.
ENV PATH="/app/node_modules/.bin:${PATH}"

# Production-only dependencies. Note that `tsx` is in `dependencies`
# (Sprint 7.3.A moved it) so it survives the `--omit=dev` prune.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
 && npm cache clean --force

# Copy the server source tree + everything `tsconfig.server.json`
# includes. We deliberately do NOT copy the `src/` React components
# that are React-only (CalculatorPage, hooks, pages, etc.) — the
# server only needs domain math + PDF builders + shared utilities,
# all already listed in tsconfig.server.json.
COPY server ./server
COPY scripts ./scripts
COPY tsconfig.json tsconfig.server.json ./

# Server uses these subsets of src/* (referenced via the
# tsconfig.server.json `include` block). Copying the whole `src/`
# is the safest path against future include-list changes — it
# doesn't bloat the image (text-only TypeScript) and keeps the
# Dockerfile resilient.
COPY src ./src

# Copy the built SPA from stage 1 into a sibling dir the Express
# static handler will read from.
COPY --from=spa-build /app/dist /srv/spa

# Entrypoint runs DB migrations then starts the server. See
# `docker/entrypoint.sh` for the full sequence (Postgres wait,
# migrate, then exec tsx).
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Sprint 7.3.E: run as non-root so Chromium's setuid sandbox can
# engage properly. The `node` user already exists in the base image
# (uid 1000). Chown the app dir so the user can read its own files
# without needing capabilities at runtime.
RUN chown -R node:node /app /srv/spa
USER node

# Express listens on PORT (default 8080). Traefik routes traffic
# here from the public HTTPS port.
EXPOSE 8080

# Container health probe: hits the Express /health endpoint inside
# the container's own network namespace. Set conservatively so a
# slow Puppeteer cold-start doesn't kill the container.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT:-8080}/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["tsx", "server/index.ts"]

# Integrations

Last updated: 2026-06-08. Describes the integrations as they work **today**.

## HubSpot CRM (live)

HubSpot is fully integrated on the backend. The SPA never talks to HubSpot
directly — all reads and writes go through `/api/v1/*` endpoints.

- **Code:** `server/modules/hubspot/**` (client, mapper, service, routes,
  webhooks), plus `server/modules/documents/sync.service.ts` for Note
  write-back.
- **Auth:** Private App token via `HUBSPOT_API_TOKEN` (`pat-...`), stored
  server-side only. Required in production (`env.ts` enforces it).
- **Field selection:** `docs/bsg_hubspot_field_mapping.md`.
- **API surface notes:** `docs/hubspot_api_reference.md`.

### Reads (companies + deals)

- TTL-driven refresh: stale data is served immediately while a background
  fetch refreshes it (`server/shared/ttl-refresh.ts`,
  `HUBSPOT_SYNC_TTL_SECONDS`).
- Optional startup backfill (`HUBSPOT_AUTO_BACKFILL`,
  `HUBSPOT_COMPANY_TYPE_FILTER`, `HUBSPOT_BACKFILL_PAGE_SIZE`); manual
  backfill via `npm run hubspot:backfill`.
- Resilience: exponential backoff on 5xx, honours `Retry-After` on 429,
  throws `HubspotUnreachableError` (→ HTTP 502) once the retry budget is
  exhausted. Response shapes are soft-validated against Zod and fall
  through to a safe cast on drift.

### Writes (document Note write-back)

- On document create (when `AUTO_SYNC_TO_HUBSPOT=true`) and on manual
  Sync, the backend writes a Note to the parent company/deal and records
  a `synced_to_hubspot` / `sync_failed` event in the document History.
- Fire-and-forget on create (`setImmediate` after the TX commits) so the
  operator gets an instant `201`; failures persist `state='failed'` and
  surface a manual Retry button. Soft-deleted documents are not syncable.

### Inbound webhooks

- `POST /api/v1/hubspot/webhooks` — HMAC v3 signature verification over the
  **raw** request body (`HUBSPOT_WEBHOOK_SECRET`). The raw-body parser is
  scoped to this exact path only (see `server/app.ts`). Unrecognised
  payload shapes are ACKed but skipped. Manual refresh:
  `POST /api/v1/hubspot/refresh`.

See `docs/client_and_hubspot_workflow.md` for the end-to-end operator flow.

## Puppeteer (server-side PDF rendering)

- **Code:** `server/modules/pdf/**` (browser pool + render service).
- OFFER (and AGREEMENT) PDFs are rendered server-side from the shared HTML
  builder (`src/components/document-wizard/buildOfferPdfHtml.ts`, included
  into the server build via `tsconfig.server.json`). Puppeteer loads the
  HTML with `setContent` (no HTTP round-trip), so the app CSP does not
  apply to PDF output.
- A pooled browser is reused across renders and recycled by count/TTL
  (`PUPPETEER_RENDERS_PER_BROWSER`, `PUPPETEER_BROWSER_TTL_MS`); render
  timeout via `PDF_RENDER_TIMEOUT_MS`. `PUPPETEER_EXECUTABLE_PATH` /
  `PUPPETEER_HEADLESS` configure the Chromium binary in the container.
- Endpoints: `POST /api/v1/pdf/preview` (live wizard preview, rate-limited)
  and `GET /api/v1/documents/:number/pdf` (persisted document).

## Traefik / Coolify (reverse proxy + TLS)

- Public routing and TLS termination for the single application container.
- The container runs Express, which serves both the `/api/v1/*` API **and**
  the built SPA (`server/app.ts`). There is no separate nginx.
- Health probe: `GET /health` (mounted at the root, no rate limit, no auth).
- Env: `APP_DOMAIN`, `TRAEFIK_NETWORK`, `TRAEFIK_ENTRYPOINT`, `TRAEFIK_TLS`,
  `TRAEFIK_CERTRESOLVER`, `TRUST_PROXY_HOPS`.

## Browser Clipboard API

- Purpose: Zone 6 "Copy to Clipboard" action (`navigator.clipboard.writeText`).
- Failure handling: UI falls back to a "copy manually from preview" message.
- Depends on the browser permission model and a secure context.

## DOCX export (out of scope)

`technical_specification_bsg.docx` §9.1 mentions DOCX export. It is **not**
implemented and not currently planned — PDF is the only generated format.

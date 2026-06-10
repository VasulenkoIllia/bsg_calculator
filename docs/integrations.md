# Integrations

Last updated: 2026-06-10. Describes the integrations as they work **today**.

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
- **Fresh Note per deliberate re-sync** (operator-approved): each manual
  Sync creates a NEW HubSpot Note (previous ones stay as history); the
  detail page confirms before a re-sync. Documents and calc-configs are
  symmetric here.
- **No duplicate Notes:** `syncDocumentToHubspot` /
  `syncCalculatorConfigToHubspot` serialise concurrent syncs for the same
  record via a Postgres advisory xact lock — a second concurrent sync gets
  `409 HUBSPOT_SYNC_IN_PROGRESS` instead of minting a duplicate Note. The
  frontend also guards against double-clicks and briefly polls a freshly
  created record so the badge flips before the operator can re-click.
- A document whose parent company was **deleted in HubSpot** cannot sync —
  it reports "Cannot sync: the parent company was deleted in HubSpot."

### Inbound webhooks

- `POST /api/v1/hubspot/webhooks` — HMAC v3 signature verification over the
  **raw** request body (`HUBSPOT_WEBHOOK_SECRET`). The raw-body parser is
  scoped to this exact path only (see `server/app.ts`). Unrecognised
  payload shapes are ACKed but skipped. Manual refresh:
  `POST /api/v1/hubspot/refresh`.
- Subscriptions cover `*.creation` / `*.propertyChange` / `*.deletion` /
  `*.merge` / `*.restore` / `*.associationChange` for companies + deals
  (see `webhooks.schemas.ts` — an unmodeled type would drop the whole
  batch, so all are listed).

### Company merge & deletion (cache reconciliation)

The local `companies` table is a cache of HubSpot. Two upstream lifecycle
events need careful handling so the cache doesn't drift:

- **Merge** (`company.merge`, `server/modules/companies/companies.merge.service.ts`):
  HubSpot folds a secondary company into a surviving primary. The handler
  re-points the secondary's **documents + calculator-configs + deals onto
  the primary** (in one transaction; order is load-bearing because
  documents/deals are `ON DELETE RESTRICT` and calc-configs are
  `ON DELETE CASCADE`), then removes the secondary row. If the primary
  isn't cached yet it's fetched + upserted on demand (bypassing the
  company-type filter — it now owns documents). **No data is lost; the
  survivor inherits everything.**
  - **Gotcha:** a merged-away company id does **not** 404 in HubSpot — a
    `GET` resolves it to the survivor (200 with the survivor's `id`). So a
    plain "404 = gone" check can't detect a stale merged alias. Two
    safeguards cover this: (1) the webhook processor **self-heals** — any
    later event whose `getCompany` returns a different `id` folds the alias
    into the survivor; (2) the reconcile script's `--fix-merged` mode
    auto-folds every merged alias (the survivor id comes from HubSpot's
    redirect, so no manual lookup).
- **Deletion** (`company.deletion`, `deleteOrMarkCompany`): a company that
  owns **zero documents** is hard-deleted (with its deals). A company that
  **owns documents** is NOT deleted — documents are legal records
  (`ON DELETE RESTRICT`). Instead its deals are dropped, it's stamped
  `hubspot_deleted_at` ("Deleted in HubSpot" badge), and the row + its
  documents are kept. Note-sync skips it; a super_admin can "Delete from
  system"; a HubSpot restore clears the flag.

### Reconcile script (drift safety net)

`server/scripts/reconcile-companies.ts` repairs cache drift that a missed
webhook left behind. Run on prod via `docker compose exec app npx tsx
server/scripts/reconcile-companies.ts [mode]`:

- (no args) — dry-run: lists drifted companies (404 = deleted upstream;
  also flags merged-away aliases) + the recommended action per row.
- `--fix-merged [--yes]` — auto-fold merged-away aliases into their
  survivors. **This is the cleanup for "HubSpot shows 1 company, our list
  shows 2."**
- `--prune-empty` — delete drifted companies that own zero documents.
- `--repoint <from> <to>` — fold a deleted-upstream company that owns
  documents into a chosen survivor.
- `--mark` — retroactively flag document-owning drift as deleted-in-HubSpot.
- `--purge <id> [--yes]` — permanently delete a deleted-upstream company
  **and its documents** (junk/test data only; refuses if it still exists
  upstream).

Going forward, the merge webhook + the self-heal keep the cache clean
automatically; the script is the operator-reviewed backlog/safety net.

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

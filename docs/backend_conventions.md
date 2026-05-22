# Backend Conventions (Phase 8+)

Date: 2026-05-15
Status: **Authoritative for all server-side code in `server/`.**

Cross-cutting rules every controller, service, and repository must
follow. If you're about to commit code that contradicts this doc, fix
the doc first — don't drift silently.

See also:
- `docs/phase_08_backend_plan.md` — DB schema, endpoints, flows.
- `docs/bsg_hubspot_field_mapping.md` — HubSpot field selection.
- `docs/decisions.md` — full decision log.

---

## 1. Folder structure

```
server/
├─ index.ts                          # entrypoint: app.listen(PORT)
├─ app.ts                            # builds Express app (also imported by tests)
├─ config/
│   ├─ env.ts                        # Zod-validated env loader (singleton)
│   └─ constants.ts                  # DOCUMENT_NUMBER_START, refresh-token grace, …
├─ db/
│   ├─ client.ts                     # drizzle pool + db instance
│   ├─ schema/
│   │   ├─ users.ts
│   │   ├─ refresh-tokens.ts
│   │   ├─ companies.ts
│   │   ├─ deals.ts
│   │   ├─ calculator-configs.ts
│   │   ├─ documents.ts
│   │   ├─ document-number-sequence.ts
│   │   ├─ hubspot-webhook-events.ts
│   │   └─ index.ts                  # re-export all
│   └─ migrations/                   # drizzle-kit output (.sql)
├─ middleware/
│   ├─ request-id.ts                 # attach reqId to req + response header
│   ├─ logger.ts                     # pino-http
│   ├─ error-handler.ts              # final 4-arg error middleware
│   ├─ require-auth.ts               # JWT verification
│   ├─ require-admin.ts              # is_admin guard
│   └─ verify-hubspot-signature.ts   # HMAC SHA-256
├─ modules/                          # vertical slices — self-contained
│   ├─ auth/
│   │   ├─ auth.routes.ts            # Express Router with route → controller
│   │   ├─ auth.controller.ts        # req/res adapters; thin
│   │   ├─ auth.service.ts           # login, refresh, logout business logic
│   │   ├─ auth.schemas.ts           # Zod request/response schemas
│   │   └─ auth.repository.ts        # queries on users + refresh_tokens
│   ├─ users/
│   ├─ companies/
│   ├─ deals/
│   ├─ calculator-configs/
│   ├─ documents/
│   │   ├─ documents.routes.ts
│   │   ├─ documents.controller.ts
│   │   ├─ documents.service.ts      # createFromCalc, createFromDoc, useAsTemplate
│   │   ├─ documents.schemas.ts
│   │   ├─ documents.repository.ts
│   │   └─ numbering.service.ts      # allocateNextNumber inside a TX
│   ├─ hubspot/
│   │   ├─ hubspot.routes.ts         # /webhooks (HMAC), /refresh (JWT)
│   │   ├─ hubspot.controller.ts
│   │   ├─ hubspot.client.ts         # HTTP wrapper around HubSpot API
│   │   ├─ hubspot.webhook-handler.ts
│   │   └─ hubspot.schemas.ts
│   ├─ pdf/
│   │   ├─ pdf.routes.ts             # GET /documents/:number/pdf
│   │   ├─ pdf.controller.ts
│   │   ├─ pdf.service.ts            # render(buildOfferPdfHtml(payload))
│   │   └─ pdf.browser-pool.ts       # singleton Browser with recycle policy
│   └─ listings/
│       ├─ listings.routes.ts
│       └─ listings.service.ts       # joined Company→Deal→Docs query
├─ shared/
│   ├─ errors.ts                     # AppError, ValidationError, NotFoundError
│   ├─ async-handler.ts              # try/catch wrapper for async controllers
│   ├─ pagination.ts                 # cursor encoder/decoder
│   └─ time.ts                       # `now()`, sleep, etc.
├─ types/
│   ├─ express.d.ts                  # req.user, req.id augmentation
│   └─ api.ts                        # shared API DTOs (re-exported to frontend via `src/lib/api/`)
├─ scripts/
│   ├─ create-user.ts                # npm run create-user
│   ├─ hubspot-backfill.ts           # npm run hubspot:backfill
│   └─ seed-dev.ts
└─ tests/
    ├─ unit/                         # pure functions: schemas, numbering, signature
    ├─ integration/                  # supertest against full Express app + Testcontainers Postgres
    └─ pdf-fixtures/                 # pixel-diff baseline + specs
```

### Module ownership rules

1. Each `modules/<name>/` owns its routes. `app.ts` only mounts them.
2. Modules can call OTHER modules' `*.service.ts` (cross-module
   service-to-service is fine — that's where business logic
   coordinates). NEVER call another module's repository directly.
3. `controller.ts` is THIN — only request/response shape adaptation.
4. `service.ts` is where business logic lives + transactional
   boundaries are set.
5. `repository.ts` is the ONLY place that touches Drizzle.
6. `schemas.ts` is Zod-only. Re-used for request validation AND for
   typing DTOs.

---

## 2. Error response envelope

All errors come out in ONE shape, set by `middleware/error-handler.ts`:

```jsonc
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Email or password is incorrect.",
    "details": null   // optional field, included only when relevant
  }
}
```

| HTTP status | When |
|---|---|
| 400 `VALIDATION_FAILED` | Zod parse failed. `details` = Zod issue array. |
| 401 `AUTH_INVALID_CREDENTIALS` / `AUTH_TOKEN_EXPIRED` / `AUTH_TOKEN_REVOKED` | Login or token issues. |
| 403 `FORBIDDEN` | Authenticated but no permission (e.g. non-admin on `/users/*`). |
| 404 `RESOURCE_NOT_FOUND` | URL refers to non-existent id/number. |
| 409 `CONFLICT_DOCUMENT_NUMBER` / `CONFLICT_RESOURCE_LOCKED` | Numbering race, duplicate webhook event, etc. |
| 422 `UNPROCESSABLE` | Valid shape, invalid semantics (e.g. `source_calculator_config_id` for a missing calc). |
| 429 `RATE_LIMITED` | Express-rate-limit triggered. |
| 500 `INTERNAL_ERROR` | Unexpected. Body has no `details`; reqId in response header. |
| 502 `HUBSPOT_UNREACHABLE` | Upstream HubSpot 5xx / timeout. |
| 503 `DB_UNAVAILABLE` | Postgres pool exhausted or down. |

Codes are stable strings; frontend can switch on them. NEVER expose
DB error messages, stack traces, or internal class names in `message`.

Each error response has header `X-Request-Id: <reqId>` for log
correlation.

---

## 3. Logging conventions

- Library: `pino` + `pino-http`. NO `console.log` in production code.
  (`scripts/*` may use `console.log` for CLI output.)
- Every log line is a single JSON object:
  ```json
  {
    "ts": "2026-05-15T10:23:51.234Z",
    "level": "info",
    "reqId": "8e2f1d3c-...",
    "userId": "uuid-or-null",
    "route": "POST /api/v1/documents",
    "msg": "document created",
    "documentNumber": "BSG-7100123-874808",
    "durationMs": 145
  }
  ```
- Required keys on every line: `ts`, `level`, `msg`. Additional
  context is encouraged.
- Level guidelines:
  - `error` — operator-facing failure: HubSpot 5xx, DB constraint
    violation, Puppeteer OOM, signature mismatch.
  - `warn` — recoverable anomaly: rate limit hit, refresh token
    grace-window used, expired token, retry attempt N.
  - `info` — high-signal lifecycle: auth login/logout, document
    created, webhook received, browser recycle.
  - `debug` — per-query, per-render, per-loop. Off by default
    in production (`LOG_LEVEL=info`).
- HTTP request logging via `pino-http`: one line per request with
  `method`, `url`, `status`, `durationMs`, `reqId`. NEVER log
  request body (might contain secrets) — log a hash if needed.

---

## 4. Configuration loading

ONE place reads env: `server/config/env.ts`. Everywhere else imports
the validated, frozen object.

```ts
// config/env.ts
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),

  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  // Sprint 9.P — refresh TTL shortened from 30d → 12h as part of the
  // session-hygiene pass (idle-timeout on FE + hard cap server-side).
  JWT_REFRESH_EXPIRES: z.string().default("12h"),  // refresh tokens are opaque, no secret needed
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),

  HUBSPOT_API_TOKEN: z.string().startsWith("pat-").optional(),
  HUBSPOT_API_BASE_URL: z.string().url().default("https://api.hubapi.com"),
  HUBSPOT_DEAL_PIPELINE_ID: z.string().optional(),
  HUBSPOT_SYNC_TTL_SECONDS: z.coerce.number().int().min(0).default(300),
  HUBSPOT_WEBHOOK_SECRET: z.string().optional(),

  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  PUPPETEER_HEADLESS: z.coerce.boolean().default(true),
  PDF_RENDER_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  PUPPETEER_RENDERS_PER_BROWSER: z.coerce.number().int().min(1).default(1000),
  PUPPETEER_BROWSER_TTL_MS: z.coerce.number().int().min(60000).default(86400000),

  DOCUMENT_NUMBER_START: z.coerce.number().int().default(7100001),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  LOG_HTTP_REQUESTS: z.coerce.boolean().default(true)
});

export const env = Env.parse(process.env);  // throws + exits on invalid
```

Rules:
- All env access goes through `env.XXX`. No `process.env.XXX` in
  modules.
- Validation runs at module-load time. Container exits with code 1
  if invalid (Docker restart loop surfaces the misconfiguration
  in logs immediately).
- Secrets (`JWT_*_SECRET`, `HUBSPOT_WEBHOOK_SECRET`,
  `HUBSPOT_API_TOKEN`) are REQUIRED in production, OPTIONAL only in
  development where their absence flips features off (e.g. webhook
  endpoint returns 503 if `HUBSPOT_WEBHOOK_SECRET` is unset).

---

## 5. Validation strategy

| Boundary | Validation | Library |
|---|---|---|
| Env on boot | Yes — fail-fast | Zod via `config/env.ts` |
| Request body | Yes — every endpoint | Zod schema in `*.schemas.ts` |
| URL params + query | Yes — coerced + bounded | Zod |
| HubSpot webhook payload | Yes — defensive parse | Zod |
| Internal service-to-service | Type-only (TS interfaces) | — |
| Response body | Type-only | — |
| `payload` JSONB on writes | Yes — full `DocumentTemplatePayload` schema | Zod re-exported from frontend |

Request validation is the FIRST thing the controller does:

```ts
// in *.controller.ts
async function createDocument(req: Request, res: Response) {
  const body = createDocumentSchema.parse(req.body);  // throws → error handler
  const result = await documentsService.create(body, req.user!.id);
  res.status(201).json(result);
}
```

Zod errors are caught by `error-handler.ts` and rendered as
`VALIDATION_FAILED` with `details = zodError.issues`.

---

## 6. Transactional boundaries

Wrap in a Drizzle TX:

- **Document creation** (`documents.service.create`): allocate
  number + INSERT documents row. If either fails, both roll back.
- **Login** (`auth.service.login`) — NO TX needed (single SELECT +
  single INSERT into refresh_tokens; failure modes are independent).
- **Refresh** (`auth.service.refresh`): UPDATE old token revoked_at
  + INSERT new token. If new INSERT fails, old token stays valid.
- **Use-as-template** (`documents.service.useAsTemplate`): single
  INSERT into `calculator_configs`. No TX needed.
- **HubSpot webhook upsert** (`hubspot.webhook-handler.processEvent`):
  delete-then-insert pattern wrapped in TX so the table is never
  in a "deleted but not yet re-inserted" state.

Single-statement reads/writes: NO TX. Don't pessimistically wrap
everything.

---

## 7. Rate limiting

- `express-rate-limit` on:
  - `POST /api/v1/auth/login` — 5/min/IP (defends against credential
    stuffing).
  - `POST /api/v1/auth/refresh` — 20/min/IP.
  - `POST /api/v1/hubspot/webhooks` — 200/min/IP (HubSpot bursts).
  - everything else — 60/min/user (token bucket).
- Outbound HubSpot rate limit (Phase 9 concern): HubSpot Private
  Apps allow 100 req per 10s. Wrap `hubspot.client.ts` in a token
  bucket. Implementation deferred to Phase 9.

---

## 8. CORS strategy

- Production: SPA served from same Express process → CORS is
  effectively a no-op. `app.use(cors({ origin: env.FRONTEND_ORIGIN }))`
  is safe.
- Development: Vite runs on 5173, Express on 8080. CORS allows
  `http://localhost:5173` with `credentials: true` so httpOnly
  refresh cookie crosses origins.
- Webhook endpoint `/api/v1/hubspot/webhooks`: **no CORS** (HubSpot
  is server-to-server). Mount the webhook route BEFORE the CORS
  middleware OR exclude it from the CORS allowlist.

---

## 9. Health + readiness

| Endpoint | Purpose | Checks |
|---|---|---|
| `GET /health` | Liveness — is the process running? | Returns 200 with `{ status, version, ts }`. No DB hit. |
| `GET /ready` | Readiness — can it serve real traffic? | DB `SELECT 1` (timeout 1s). HubSpot reachability is OPTIONAL: only checks if `HUBSPOT_API_TOKEN` set, timeout 2s. Returns 200 `{ db: 'ok', hubspot: 'ok'\|'unreachable'\|'unconfigured', ts }` or 503 if DB down. |

Use `/health` for Docker `HEALTHCHECK`. Use `/ready` for a future
load balancer when we split containers.

---

## 10. Migration tooling

- **Drizzle Kit `generate`** (NOT `push`). Generated SQL lives in
  `server/db/migrations/`. Reviewable as part of the PR.
- One migration per concern: `0001_init.sql` creates all tables in
  dependency order; `0002_seed.sql` inserts the singleton sequence
  row + seeds `document_number_sequence.next_doc_id = 7100001`.
  Subsequent migrations are numbered chronologically.
- No down-migrations (Drizzle does not auto-generate them). Rollback
  policy: restore from `pg_dump` backup.
- Migrations run on container start via `npm run db:migrate` then
  `npm start` chained in the Docker entrypoint.

### CREATE TABLE order in `0001_init.sql`

Postgres validates FKs at CREATE time, so dependent tables must come
last. Drizzle Kit infers this from the schema file imports; for our
schema the order is:

```sql
-- Extensions first
CREATE EXTENSION IF NOT EXISTS "citext";

-- Tables in dependency order:
CREATE TABLE users (...);                       -- 1
CREATE TABLE refresh_tokens (...);              -- 2 → users
CREATE TABLE companies (...);                   -- 3
CREATE TABLE deals (...);                       -- 4 → companies
CREATE TABLE calculator_configs (...);          -- 5 → users, companies, deals
CREATE TABLE document_number_sequence (...);    -- 6
CREATE TABLE documents (                        -- 7 → companies, deals, users, calc_configs
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- … all columns
  source_document_id uuid NULL,                 -- self-FK added below
  -- … all columns
);
CREATE TABLE hubspot_webhook_events (...);      -- 8 (no FKs)

-- Self-FK added AFTER documents exists:
ALTER TABLE documents
  ADD CONSTRAINT documents_source_document_id_fkey
    FOREIGN KEY (source_document_id) REFERENCES documents(id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- All CHECK constraints (separate ALTER TABLE statements for clarity):
ALTER TABLE documents
  ADD CONSTRAINT documents_document_type_check
    CHECK (document_type IN ('offer', 'agreement')),
  ADD CONSTRAINT documents_source_xor_check
    CHECK ((source_calculator_config_id IS NULL) <> (source_document_id IS NULL)),
  ADD CONSTRAINT documents_document_number_format_check
    CHECK (document_number ~ '^BSG-[0-9]{7}-[0-9]{6}$'),
  ADD CONSTRAINT documents_hubspot_sync_state_check
    CHECK (hubspot_sync_state IS NULL OR hubspot_sync_state IN ('not_synced','pending','synced','failed'));
```

Drizzle Kit emits this automatically when the TypeScript schema
files use `references(() => ...)` callbacks correctly. The
self-FK on documents is the only manual touchpoint — verify it
lands in the generated SQL.

---

## 11. Pagination

Cursor-based, opaque base64.

```ts
// shared/pagination.ts
type Cursor = { createdAt: string; id: string };
function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}
function decodeCursor(s: string | undefined): Cursor | null {
  if (!s) return null;
  return JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
}
```

All list endpoints accept `?cursor=&limit=`. `limit` is server-clamped
to `min(requested, 50)`. Response envelope:

```jsonc
{
  "items": [...],
  "nextCursor": "<opaque>" | null,
  "limit": 50
}
```

---

## 12. Testing strategy (Phase 8 acceptance)

Breakdown of the ~150 backend test cases:

| Tier | Tooling | Target tests |
|---|---|---|
| Unit | `vitest` | 60 — Zod schemas, number formatter, HubSpot signature verifier, payload mappers |
| Integration | `supertest` + Testcontainers Postgres | 80 — every endpoint × (happy, auth-fail, validation-fail) |
| E2E | Playwright + full `docker-compose up` | 10 — login → create calc → save offer → download PDF |
| PDF pixel-diff | Custom + existing fixtures | 10 — see §8 of phase plan |

Test DB: Testcontainers spins up a `postgres:15` instance per test
file (or shared across suite with truncation). Schema applied via
the production migration. Test users use `BCRYPT_COST=4` (env
override) for sub-50ms hash.

HubSpot mocked via `nock`. Webhook tests construct a valid
`X-HubSpot-Signature-v3` header from the test secret.

---

## 13. Style + tooling

- Strict TS: `noImplicitAny`, `strictNullChecks`, all on.
- ESLint: re-use the existing repo config; add server-specific
  rules (no DOM types, no `process.env` outside `config/env.ts`).
- Prettier: existing config applies.
- No barrel files (`index.ts` re-exports) except in `db/schema/`.
  Direct imports keep the dep graph readable.

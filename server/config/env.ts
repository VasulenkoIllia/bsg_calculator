/**
 * Centralised, Zod-validated environment loader.
 *
 * Imported ONCE at process startup. Throws on missing/invalid values
 * so the container crash-loops with a clear error rather than booting
 * a half-configured server.
 *
 * All other modules import the frozen `env` object — `process.env`
 * access is forbidden outside this file (enforced by code review).
 *
 * See `docs/backend_conventions.md` §4 for the full convention.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// ─── Lightweight .env loader ────────────────────────────────────────
// We avoid pulling `dotenv` just for one file. The format is `KEY=VALUE`
// per line, `#` comments allowed, empty lines ignored. Already-set
// env vars (e.g. from systemd / docker / shell) win over the file.
function loadDotenv(filePath: string): void {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    // No .env file is fine — the env may already be populated.
    return;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// Load .env relative to the process CWD. In dev we expect to be run
// from the repo root. In docker we mount/inject env directly so .env
// is absent and the env vars come from `docker compose` / Coolify.
loadDotenv(resolve(process.cwd(), ".env"));

// ─── Schema ────────────────────────────────────────────────────────
/**
 * A boolean env var that actually honours "false".
 *
 * `z.coerce.boolean()` is `Boolean(value)`, so EVERY non-empty string is
 * true — "false", "0" and "no" all parse as TRUE. Five flags were built on
 * it, including `AUTO_SYNC_TO_HUBSPOT` and `HUBSPOT_AUTO_BACKFILL`, and the
 * live production .env carries `HUBSPOT_AUTO_BACKFILL=false` believing it
 * to be off. It is not. The cutover runbook's "set AUTO_SYNC_TO_HUBSPOT=false"
 * step would likewise have done nothing at all.
 *
 * Accepts the forms an operator actually types; anything unrecognised is a
 * boot error rather than a silent default, because a typo in a kill switch
 * must not read as "on".
 */
function envBoolean(defaultValue: boolean) {
  return z.preprocess(v => {
    if (typeof v === "boolean") return v;
    if (v === undefined || v === null) return defaultValue;
    const raw = String(v).trim().toLowerCase();
    if (raw === "") return defaultValue;
    if (["true", "1", "yes", "y", "on"].includes(raw)) return true;
    if (["false", "0", "no", "n", "off"].includes(raw)) return false;
    return raw; // falls through to the boolean() validator below -> clear error
  }, z.boolean());
}

const EnvSchema = z.object({
  // App
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_NAME: z.string().default("bsg-calculator"),
  APP_DOMAIN: z.string().default("bsg.workflo.space"),
  /**
   * Public URL the SPA is served from. Used by Phase 9 HubSpot Note
   * write-back to embed a clickable link to the document
   * (e.g. https://bsg.workflo.space/documents/BSG-7100024-874808).
   * Development default points at the Vite dev server.
   * Production MUST set this to the real https origin.
   */
  APP_PUBLIC_URL: z.string().url().default("http://localhost:5173"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  TZ: z.string().default("Europe/Kyiv"),
  // Number of trusted reverse-proxy hops in front of the API.
  //   1 = Traefik directly in front of Express (default, our deploy).
  //   0 = no proxy (only safe when the API is reachable on a private
  //       network and never sees client-supplied X-Forwarded-For).
  // Express trusts the LAST N entries of X-Forwarded-For; an incorrect
  // value lets a remote client spoof their IP, bypassing per-IP rate
  // limits. If the topology ever changes (e.g. CloudFlare → Traefik →
  // app), raise this to match the true hop count and ensure each hop
  // either strips or replaces X-Forwarded-For at its trust boundary.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  // Database
  DATABASE_URL: z.string().url(),
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5433),
  DB_USER: z.string().default("bsg"),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string().default("bsg_calculator"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  /**
   * How long `pool.connect()` waits for a free client before failing.
   * `pg` defaults to 0 = wait forever, which turns pool starvation into a
   * silent hang: no error, no log, requests simply never answer.
   */
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(10_000),

  // Auth — JWT + bcrypt
  // Only JWT_ACCESS_SECRET is needed: access tokens are JWTs, refresh
  // tokens are opaque (random + SHA-256-hashed in DB). The legacy
  // JWT_REFRESH_SECRET was removed in Sprint 2.7.I — see decisions.md.
  JWT_ACCESS_SECRET: z.string().min(32, {
    message: "JWT_ACCESS_SECRET must be at least 32 chars. Generate with `openssl rand -base64 48`."
  }),
  JWT_ACCESS_EXPIRES: z
    .string()
    .regex(/^\d+[smhdw]$/, "must match format like '15m', '24h', '30d'")
    .default("15m"),
  // Refresh token TTL — opaque token (not a JWT); the value is consumed
  // by auth.service when inserting refresh_tokens.expires_at AND by
  // auth.cookies for the cookie's max-age (so they stay in sync — see
  // `refreshTokenMaxAgeMs()` in auth.tokens.ts).
  //
  // Sprint 9.P — shortened from 30d to 12h as an absolute-session cap.
  // Combined with the FE idle-timeout (30 min of no activity → forced
  // logout), this means a forgotten session can survive at most 30
  // minutes of inactivity and at most 12 hours of total elapsed time
  // from login. Anyone who needs a longer session can simply log in
  // again — the cost is minimal for a 3-5 operator internal tool, the
  // payoff is closing the "left browser open over lunch" attack
  // window.
  JWT_REFRESH_EXPIRES: z
    .string()
    .regex(/^\d+[smhdw]$/, "must match format like '15m', '24h', '30d'")
    .default("12h"),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  // TOTP 2FA — AES-256-GCM key for encrypting the per-user TOTP secret
  // at rest (Phase 8 Stage 2). 64 hex chars = 32 bytes. Defaults to an
  // all-zero DEV key; prod MUST override (the superRefine below blocks
  // the dev default in production). Generate: `openssl rand -hex 32`.
  TOTP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, {
      message: "TOTP_ENCRYPTION_KEY must be 64 hex chars (32 bytes). Generate with `openssl rand -hex 32`."
    })
    .default("0".repeat(64)),

  // CORS / frontend
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),

  /**
   * Which CRM this deployment talks to (monday migration, 2026-08-27).
   *
   * `hubspot` — the pre-migration behaviour, unchanged in every respect.
   * `monday`  — reads and note write-back go to monday.com instead.
   *
   * It is BOTH the global kill switch and the value the per-row era
   * marker is compared against: a row is only torn down in the CRM that
   * actually holds its note (`documents.crm_note_provider === CRM_PROVIDER`).
   * That is what makes 2026-08-31 a flag flip rather than a deploy — see
   * docs/monday_migration_plan.md §3.
   *
   * Defaults to `hubspot`, so adding this variable changes nothing.
   */
  CRM_PROVIDER: z.enum(["hubspot", "monday"]).default("hubspot"),

  // monday.com (added alongside HubSpot — neither replaces the other
  // until CRM_PROVIDER flips).
  MONDAY_API_TOKEN: z.preprocess(
    v => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().optional()
  ),
  MONDAY_API_BASE_URL: z.string().url().default("https://api.monday.com/v2"),
  /**
   * Pinned API version. monday releases quarterly and an unrecognised
   * value silently DOWNGRADES the request instead of failing, so the
   * client asserts at startup that the server echoes back what we asked
   * for. Never leave this blank.
   */
  MONDAY_API_VERSION: z.string().default("2026-07"),
  /**
   * Board ids in the "BlackStripe CRM" workspace. Column ids are
   * deliberately NOT env vars — they are resolved by title+type at boot
   * and verified, because four mapped columns were deleted and recreated
   * between 2026-08-22 and 2026-08-27 (docs/monday_migration_plan.md R4).
   */
  MONDAY_BOARD_COMPANIES: z.string().default("5102466967"),
  MONDAY_BOARD_AGENTS: z.string().default("5102466950"),
  MONDAY_BOARD_DEALS: z.string().default("5102466996"),
  /**
   * Unguessable path segment for POST /api/v1/monday/webhooks/:secret.
   * monday webhooks created with a personal token carry no signature, so
   * the secret path plus "the payload is only a trigger, every field is
   * re-read from the API" is the authentication (decision D6).
   */
  MONDAY_WEBHOOK_SECRET: z.string().optional(),

  // HubSpot (Phase 8 reads + Phase 9 writes)
  /**
   * An EMPTY value counts as "not set". Without the preprocess below,
   * `HUBSPOT_API_TOKEN=` in .env parses as "" — which fails
   * `.startsWith("pat-")` and crash-loops the container. That is the most
   * natural thing an operator would type to switch HubSpot off, so it
   * must mean "absent", not "invalid". Same treatment for the monday
   * token and both secrets.
   */
  HUBSPOT_API_TOKEN: z.preprocess(
    v => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().startsWith("pat-").optional()
  ),
  HUBSPOT_API_BASE_URL: z.string().url().default("https://api.hubapi.com"),
  HUBSPOT_DEAL_PIPELINE_ID: z.string().optional(),
  HUBSPOT_SYNC_TTL_SECONDS: z.coerce.number().int().min(0).default(300),
  HUBSPOT_WEBHOOK_SECRET: z.string().optional(),
  // Restrict which company_type values land in our DB. Empty = pull
  // every type. Default "direct_client" — see decisions.md ("Sprint 2
  // company-type filter") for rationale.
  HUBSPOT_COMPANY_TYPE_FILTER: z.string().default("direct_client"),
  // Page size for the `npm run hubspot:backfill` HubSpot pagination
  // calls. HubSpot max = 100. Lower if HubSpot rate-limits during a
  // large initial pull (you'll get more sleep+retry rounds but each
  // round consumes less of the per-10s budget).
  HUBSPOT_BACKFILL_PAGE_SIZE: z.coerce.number().int().min(1).max(100).default(100),
  // When true AND companies table is empty at server start, run
  // hubspot:backfill in background. Production first-deploy default.
  HUBSPOT_AUTO_BACKFILL: envBoolean(false),
  /**
   * Phase 9.G / 9.I — auto-sync new documents AND calc-configs to
   * HubSpot in background.
   *
   * When true:
   *   - Every successful `POST /documents` schedules a fire-and-forget
   *     `syncDocumentToHubspot()` via `setImmediate` AFTER the DB
   *     transaction commits.
   *   - Every successful first save of a calc-config (Phase 9.I)
   *     schedules `syncCalculatorConfigToHubspot()` the same way.
   *
   * The operator gets a clean 201/200 immediately; the row's
   * `hubspot_sync_state` flips from `not_synced` → `synced` (or
   * `failed`) in the background, surfaced via the standard listing
   * invalidation on the FE.
   *
   * In dev: default `false` so operators iterating on the wizard
   * don't spam HubSpot with notes. In prod: set to `true` in
   * `.env.production.example` for the standard CRM-write behaviour.
   *
   * On failure: the sync services persist `state='failed'` BEFORE
   * the background promise rejects; the manual "Sync to HubSpot"
   * buttons (calculator + document detail) are the operator-facing
   * retry path.
   *
   * Sprint 9.L D4 — renamed from `AUTO_SYNC_DOCUMENTS_TO_HUBSPOT`
   * to reflect that the same flag also drives calc-config auto-sync
   * (added in Phase 9.I). The old name is still accepted as a
   * fallback below so existing prod .env files don't break.
   */
  AUTO_SYNC_TO_HUBSPOT: envBoolean(false),

  // PDF rendering (Puppeteer)
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  PUPPETEER_HEADLESS: envBoolean(true),
  PDF_RENDER_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  PUPPETEER_RENDERS_PER_BROWSER: z.coerce.number().int().min(1).default(1000),
  PUPPETEER_BROWSER_TTL_MS: z.coerce.number().int().min(60000).default(86400000),
  // Sprint 7.4 escape hatch: some Docker hosts (notably default
  // Coolify installs without user-namespace remapping) cannot run
  // Chromium with its setuid sandbox. Symptom: Puppeteer launch
  // fails with `SUID sandbox helper binary was found, but is not
  // configured correctly`. Setting this to `true` reverts to the
  // pre-7.3.E behaviour (--no-sandbox) so PDF generation works.
  // SECURITY: only set this when you understand the trade-off —
  // the calculator HTML is operator-built so the XSS surface is
  // small, but a future user-input path could amplify the risk.
  PUPPETEER_NO_SANDBOX: envBoolean(false),

  // Document numbering
  DOCUMENT_NUMBER_START: z.coerce.number().int().min(1).default(7100001),

  // Sprint 7.3.A — single-container deploy. Where Express looks for
  // the built SPA. Default `/srv/spa` matches the Dockerfile that
  // copies the Vite build output to that path. Override for tests
  // or for a custom path; leave unset in dev (Vite serves the SPA).
  SPA_DIST_DIR: z.string().optional(),

  // Phase 8 Stage 1: optional email of the user to promote to
  // `super_admin` on every server start. Idempotent — won't demote
  // an existing super-admin if the env var is cleared. See
  // server/scripts/bootstrap-super-admin.ts for the runtime logic.
  // Leave unset in dev / when super-admin is already provisioned.
  // Empty string treated as "not set" for ergonomic .env templates.
  BOOTSTRAP_SUPER_ADMIN_EMAIL: z
    .string()
    .email()
    .optional()
    .or(z.literal("")),

  // Logging
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  LOG_HTTP_REQUESTS: envBoolean(true)
}).superRefine((data, ctx) => {
  // ─── Cross-field production hardening ────────────────────────────
  // In dev/test we allow loose values for fast iteration. In prod we
  // tighten the rules below so a misconfigured deploy crash-loops at
  // boot rather than silently exposing an attack surface.
  if (data.NODE_ENV !== "production") return;

  // ─── Provider-scoped gates ───────────────────────────────────────
  // Each CRM's hard requirements apply ONLY while that CRM is the active
  // one. Before this, the three HubSpot gates below were unconditional,
  // which meant production could not be de-configured from HubSpot at
  // all: blanking the token to "turn HubSpot off" crash-looped the
  // container. That made the 2026-08-31 switch-off impossible without a
  // code change — see docs/monday_migration_plan.md R3.
  const usingHubspot = data.CRM_PROVIDER === "hubspot";
  const usingMonday = data.CRM_PROVIDER === "monday";

  // SSRF guard: only the canonical HubSpot endpoint may be hit in
  // prod. If the env is ever overwritten (compromise, fat-fingered
  // deploy), refuse to boot rather than emit requests with HubSpot
  // bearer tokens to an attacker-controlled host.
  if (usingHubspot && data.HUBSPOT_API_BASE_URL !== "https://api.hubapi.com") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["HUBSPOT_API_BASE_URL"],
      message:
        'must be exactly "https://api.hubapi.com" in production (SSRF guard for HubSpot Private App tokens).'
    });
  }

  // Webhook HMAC secret is required in prod so the future Sprint 5
  // /api/v1/hubspot/webhooks endpoint can verify incoming events.
  // Operators can set a placeholder value before Sprint 5 ships —
  // having any non-empty secret is enough to satisfy this gate, and
  // the webhook handler itself will refuse mismatched signatures.
  if (usingHubspot && (!data.HUBSPOT_WEBHOOK_SECRET || data.HUBSPOT_WEBHOOK_SECRET.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["HUBSPOT_WEBHOOK_SECRET"],
      message:
        "must be set in production (HMAC SHA-256 secret for HubSpot webhook signature verification)."
    });
  }

  // Mirror image for monday: the same two things must be present when it
  // is the active CRM. The SSRF guard has the same shape — a bearer token
  // must never be sent to an arbitrary host.
  if (usingMonday && (!data.MONDAY_API_TOKEN || data.MONDAY_API_TOKEN.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["MONDAY_API_TOKEN"],
      message:
        "must be set in production when CRM_PROVIDER=monday (every read and every note write goes through it)."
    });
  }
  // Mirror of the HubSpot webhook-secret gate. Without it an operator can
  // deploy with monday active and no secret set, and every inbound webhook
  // silently 404s (the route treats "not configured" as "route does not
  // exist") — the cache then goes quietly stale with nothing to explain it.
  if (usingMonday && (!data.MONDAY_WEBHOOK_SECRET || data.MONDAY_WEBHOOK_SECRET.length < 16)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["MONDAY_WEBHOOK_SECRET"],
      message:
        "must be set in production when CRM_PROVIDER=monday, at least 16 chars (it is the webhook endpoint's only credential). Generate with `openssl rand -hex 24`."
    });
  }

  // The three board ids are how an inbound webhook is classified: the
  // controller maps boardId -> company/agent/deal and SKIPS anything it
  // does not recognise. Two ids being equal (a copy-paste in .env) would
  // therefore route one board's events to the wrong object type, silently
  // and for every event. Defaults are the real boards, so this only fires
  // on an explicit override.
  if (usingMonday) {
    const boards = [data.MONDAY_BOARD_COMPANIES, data.MONDAY_BOARD_AGENTS, data.MONDAY_BOARD_DEALS];
    if (new Set(boards).size !== boards.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONDAY_BOARD_COMPANIES"],
        message:
          "MONDAY_BOARD_COMPANIES / _AGENTS / _DEALS must be three DIFFERENT board ids — a duplicate silently routes one board's webhooks to the wrong object type."
      });
    }
  }

  if (usingMonday && data.MONDAY_API_BASE_URL !== "https://api.monday.com/v2") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["MONDAY_API_BASE_URL"],
      message:
        'must be exactly "https://api.monday.com/v2" in production (SSRF guard for the monday API token).'
    });
  }

  // APP_PUBLIC_URL drives the document-link inserted into HubSpot
  // Notes (Phase 9). The dev default points at localhost; in prod
  // it MUST be the real https origin or the Notes BSG operators see
  // in HubSpot would link to localhost from the wrong machine.
  if (
    data.APP_PUBLIC_URL.startsWith("http://localhost") ||
    data.APP_PUBLIC_URL.startsWith("http://127.")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["APP_PUBLIC_URL"],
      message:
        "must be a public https URL in production (HubSpot Notes will embed it as a clickable link)."
    });
  }

  // Sprint 7.3.C — block well-known placeholder JWT secrets that
  // happen to satisfy the `min(32)` validator. Copying .env.example
  // verbatim to .env in prod must crash the boot, not boot with a
  // public-knowledge secret.
  const wellKnownPlaceholders = [
    "replace_me_with_openssl_rand_base64_48_dev_only",
    "change_me_in_production",
    "dev_secret",
    "test_secret"
  ];
  if (wellKnownPlaceholders.includes(data.JWT_ACCESS_SECRET)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["JWT_ACCESS_SECRET"],
      message:
        "is a well-known placeholder value — refuse to boot. Generate a fresh secret with `openssl rand -base64 48`."
    });
  }

  // Sprint 7.3.C — require HUBSPOT_API_TOKEN in prod. Without it,
  // the webhook processor silently retries every event 5 times,
  // marks it failed, and operators don't notice until a sales
  // person can't find a deal. Better to fail at boot.
  if (usingHubspot && (!data.HUBSPOT_API_TOKEN || data.HUBSPOT_API_TOKEN.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["HUBSPOT_API_TOKEN"],
      message:
        "must be set in production (Private App pat- token; without it the webhook processor silently 401's every event)."
    });
  }

  // Phase 8 Stage 2 — refuse to boot in prod with the all-zero DEV TOTP
  // key. A predictable key means an attacker who reads the DB can decrypt
  // every user's TOTP secret and mint valid codes, defeating 2FA entirely.
  if (data.TOTP_ENCRYPTION_KEY === "0".repeat(64)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["TOTP_ENCRYPTION_KEY"],
      message:
        "is the all-zero DEV default — refuse to boot in production. Generate a real key with `openssl rand -hex 32`."
    });
  }
});

// Sprint 9.L D4 — back-compat shim. The flag was renamed from
// AUTO_SYNC_DOCUMENTS_TO_HUBSPOT to AUTO_SYNC_TO_HUBSPOT (it now
// gates calc-config auto-sync too). Operators whose .env still
// has the old name keep working — we mirror it to the new name
// here, before the Zod parse, only when the new one isn't already
// explicitly set.
if (
  process.env.AUTO_SYNC_TO_HUBSPOT === undefined &&
  process.env.AUTO_SYNC_DOCUMENTS_TO_HUBSPOT !== undefined
) {
  process.env.AUTO_SYNC_TO_HUBSPOT = process.env.AUTO_SYNC_DOCUMENTS_TO_HUBSPOT;
}

// Parse + freeze. Parse throws ZodError on invalid input which we
// reshape into a human-readable message before exiting.
const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map(i => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  // Print to stderr (not pino — pino isn't initialised yet) and exit.
  // eslint-disable-next-line no-console
  console.error(`[config/env] Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
export type Env = typeof env;

// Convenience flags so consumers don't repeat the `=== "..."` check.
export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

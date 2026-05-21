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
  // by auth.service when inserting refresh_tokens.expires_at.
  JWT_REFRESH_EXPIRES: z
    .string()
    .regex(/^\d+[smhdw]$/, "must match format like '15m', '24h', '30d'")
    .default("30d"),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  // CORS / frontend
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),

  // HubSpot (Phase 8 reads + Phase 9 writes)
  HUBSPOT_API_TOKEN: z.string().startsWith("pat-").optional(),
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
  HUBSPOT_AUTO_BACKFILL: z.coerce.boolean().default(false),
  /**
   * Phase 9.G — auto-sync new documents to HubSpot in background.
   *
   * When true, every successful `POST /documents` schedules a
   * fire-and-forget `syncDocumentToHubspot()` via `setImmediate`
   * AFTER the DB transaction commits. The operator gets a clean
   * 201 immediately; the document's `hubspot_sync_state` flips
   * from `not_synced` → `synced` (or `failed`) in the background.
   *
   * In dev: default `false` so operators iterating on the wizard
   * don't spam HubSpot with notes. In prod: set to `true` in
   * `.env.production.example` for the standard CRM-write behaviour.
   *
   * On failure: the sync service persists `state='failed'` BEFORE
   * the background promise rejects; the manual "Sync to HubSpot"
   * button on /documents/:number is the operator-facing retry.
   */
  AUTO_SYNC_DOCUMENTS_TO_HUBSPOT: z.coerce.boolean().default(false),

  // PDF rendering (Puppeteer)
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  PUPPETEER_HEADLESS: z.coerce.boolean().default(true),
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
  PUPPETEER_NO_SANDBOX: z.coerce.boolean().default(false),

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
  LOG_HTTP_REQUESTS: z.coerce.boolean().default(true)
}).superRefine((data, ctx) => {
  // ─── Cross-field production hardening ────────────────────────────
  // In dev/test we allow loose values for fast iteration. In prod we
  // tighten the rules below so a misconfigured deploy crash-loops at
  // boot rather than silently exposing an attack surface.
  if (data.NODE_ENV !== "production") return;

  // SSRF guard: only the canonical HubSpot endpoint may be hit in
  // prod. If the env is ever overwritten (compromise, fat-fingered
  // deploy), refuse to boot rather than emit requests with HubSpot
  // bearer tokens to an attacker-controlled host.
  if (data.HUBSPOT_API_BASE_URL !== "https://api.hubapi.com") {
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
  if (!data.HUBSPOT_WEBHOOK_SECRET || data.HUBSPOT_WEBHOOK_SECRET.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["HUBSPOT_WEBHOOK_SECRET"],
      message:
        "must be set in production (HMAC SHA-256 secret for HubSpot webhook signature verification)."
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
  if (!data.HUBSPOT_API_TOKEN || data.HUBSPOT_API_TOKEN.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["HUBSPOT_API_TOKEN"],
      message:
        "must be set in production (Private App pat- token; without it the webhook processor silently 401's every event)."
    });
  }
});

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

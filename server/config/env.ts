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
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  TZ: z.string().default("Europe/Kyiv"),

  // Database
  DATABASE_URL: z.string().url(),
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5433),
  DB_USER: z.string().default("bsg"),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string().default("bsg_calculator"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  // Auth — JWT + bcrypt
  JWT_ACCESS_SECRET: z.string().min(32, {
    message: "JWT_ACCESS_SECRET must be at least 32 chars. Generate with `openssl rand -base64 48`."
  }),
  JWT_REFRESH_SECRET: z.string().min(32, {
    message: "JWT_REFRESH_SECRET must be at least 32 chars. Generate with `openssl rand -base64 48`."
  }),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("30d"),
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

  // PDF rendering (Puppeteer)
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  PUPPETEER_HEADLESS: z.coerce.boolean().default(true),
  PDF_RENDER_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  PUPPETEER_RENDERS_PER_BROWSER: z.coerce.number().int().min(1).default(1000),
  PUPPETEER_BROWSER_TTL_MS: z.coerce.number().int().min(60000).default(86400000),

  // Document numbering
  DOCUMENT_NUMBER_START: z.coerce.number().int().min(1).default(7100001),

  // Logging
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  LOG_HTTP_REQUESTS: z.coerce.boolean().default(true)
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

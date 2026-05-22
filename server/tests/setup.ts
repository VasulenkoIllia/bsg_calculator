/**
 * Vitest global setup for the backend test suite.
 *
 * Responsibilities:
 *   1. Force test env vars BEFORE any module reads env.
 *   2. Ensure the `bsg_calculator_test` database exists.
 *   3. Run Drizzle migrations on the test DB.
 *   4. Expose a `truncateAll()` helper called by each test file's
 *      beforeEach so tables start clean.
 *
 * Single-fork execution (configured in vitest.server.config.ts) keeps
 * tests sequential — we can introduce per-test transactions later if
 * throughput becomes an issue.
 */

import { afterAll, beforeAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import pg from "pg";

// ─── 1. Force test env BEFORE any other module imports ─────────────
// These overrides must happen before `import './db/client'` triggers
// the env loader. Vitest evaluates setupFiles before test files.
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "warn";
process.env.LOG_HTTP_REQUESTS = "false";
process.env.BCRYPT_COST = "4"; // ~4ms per hash vs ~250ms at cost 12

const ADMIN_DB_URL =
  process.env.DATABASE_URL_ADMIN ??
  "postgres://bsg:bsg_dev_password@localhost:5433/postgres";

const TEST_DB_NAME = "bsg_calculator_test";
const TEST_DB_URL = `postgres://bsg:bsg_dev_password@localhost:5433/${TEST_DB_NAME}`;
process.env.DATABASE_URL = TEST_DB_URL;
process.env.DB_NAME = TEST_DB_NAME;

// Generate a fixed JWT access secret for tests so signed tokens are
// stable across runs (NEVER reuse this in production). Refresh tokens
// are opaque random strings — no secret required.
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? "test_access_secret_at_least_32_chars_long_xxxx";

// Stable HubSpot webhook HMAC secret so the Sprint 5 signature-
// verification middleware accepts requests signed with this same value
// from the test helper. Production must set a real secret via env.
process.env.HUBSPOT_WEBHOOK_SECRET =
  process.env.HUBSPOT_WEBHOOK_SECRET ?? "test_hubspot_webhook_secret";

// ─── 2. Ensure test database exists ───────────────────────────────
async function ensureTestDatabase(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_DB_URL });
  await admin.connect();
  try {
    const { rowCount } = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [TEST_DB_NAME]
    );
    if (rowCount === 0) {
      // Cannot parameterise the DB name — must interpolate. Safe
      // because TEST_DB_NAME is a hard-coded constant above.
      await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
    }
  } finally {
    await admin.end();
  }
}

// ─── 3 + 4. Apply migrations + expose truncate helper ─────────────
// These are dynamic-imported AFTER ensureTestDatabase so the env
// override above is already in place when `db/client` evaluates.

let dbModule: typeof import("../db/client");

beforeAll(async () => {
  await ensureTestDatabase();
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  dbModule = await import("../db/client");
  await migrate(dbModule.db, { migrationsFolder: "./server/db/migrations" });
});

beforeEach(async () => {
  // TRUNCATE in dependency order; CASCADE handles any FKs we don't
  // explicitly list. RESTART IDENTITY resets serials (not used by
  // our UUID-PK schema but harmless). Add new tables here as the
  // schema grows.
  await dbModule.db.execute(
    sql`TRUNCATE TABLE hubspot_webhook_events, admin_actions, documents, calculator_configs, deals, companies, refresh_tokens, users RESTART IDENTITY CASCADE`
  );
  // Reset numbering sequence — TRUNCATE on documents doesn't touch
  // the sequence row. Set to the seed value so each test file starts
  // from BSG-7100001.
  await dbModule.db.execute(
    sql`UPDATE document_number_sequence SET next_value = 7100001 WHERE id = '00000000-0000-0000-0000-000000000001'`
  );
});

afterAll(async () => {
  await dbModule.pool.end();
});

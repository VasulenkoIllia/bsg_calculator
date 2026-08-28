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

import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import {
  pendingBackgroundWorkCount,
  settleBackgroundWork
} from "../shared/background-work";
import { sql } from "drizzle-orm";
import pg from "pg";

// ─── 1. Force test env BEFORE any other module imports ─────────────
// These overrides must happen before `import './db/client'` triggers
// the env loader. Vitest evaluates setupFiles before test files.
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "warn";
process.env.LOG_HTTP_REQUESTS = "false";
process.env.BCRYPT_COST = "4"; // ~4ms per hash vs ~250ms at cost 12
// Pin the refresh-token lifetime so auth.tokens.test.ts asserts the
// intended Sprint 9.P default (12h) deterministically. Without this a
// developer's local `.env` carrying an operational override (e.g. 30d)
// leaks in and breaks the unit assertion even though prod config is
// fine. Matches the committed `.env.example` / `.env.production.example`.
process.env.JWT_REFRESH_EXPIRES = "12h";

// ─── 1b. No test may talk to a real CRM ───────────────────────────
// A full run was observed making NINE live requests to
// https://api.hubapi.com. reconcile-companies.integration.test.ts stubs
// `getCompany` and states in its header that "no real HTTP fires", but a
// list endpoint on the same path was never stubbed. The real API answered
// 503, the client retried with 1s/2s/4s backoff, and that work outlived
// the test that started it — which is what an unrelated test three files
// later saw as a 503, a phantom row, or a missing one.
//
// Beyond flakiness this is simply wrong: the suite reached a third-party
// production service, and HubSpot is switched off on 2026-08-31, after
// which those calls change behaviour again.
//
// Fail LOUDLY and INSTANTLY instead. A stub that stops working then
// breaks its own test by name, rather than a different test at random.
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: Parameters<typeof realFetch>[0], init?: Parameters<typeof realFetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);
  if (!isLocal) {
    return Promise.reject(
      new Error(
        `[test-setup] BLOCKED outbound request to ${url} — the test suite must never reach a real CRM. Stub the client method this test calls.`
      )
    );
  }
  return realFetch(input, init);
}) as typeof realFetch;

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

// Unguessable path segment for the monday receiver. monday does not sign
// personal-token webhooks, so this plus "the payload is only a trigger"
// is the authentication — see monday/webhooks/webhooks.routes.ts.
process.env.MONDAY_WEBHOOK_SECRET =
  process.env.MONDAY_WEBHOOK_SECRET ?? "test_monday_webhook_secret";

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

/**
 * Drain fire-and-forget work before the next test wipes the tables.
 *
 * Several code paths deliberately do not await their side effects —
 * `scheduleTtlRefresh` and the auto-sync hook both use `setImmediate`, and
 * best-effort event writes are intentionally detached. Between tests that
 * work was still in flight: the callback would run AFTER the next test's
 * TRUNCATE and insert a row into a table that test believed to be empty.
 *
 * That is the shape of the intermittent failures this suite has had for a
 * while — a different, unrelated test failing roughly one run in four,
 * always by seeing data it never created. Draining a fixed number of macrotask ticks was the first
 * attempt and was never sound — an await chain spanning a DB round-trip
 * is not bounded by any tick count. The schedulers now register their
 * detached promise in `shared/background-work`, so this awaits the real
 * thing.
 */
async function flushPendingBackgroundWork(): Promise<void> {
  // One tick first, so work scheduled with `setImmediate` has actually
  // been HANDED to the registry before we look at it — `track()` runs
  // inside the setImmediate callback, not at schedule time.
  await new Promise(resolve => setImmediate(resolve));
  await settleBackgroundWork();
  // Second pass: settling one promise can schedule another setImmediate,
  // which is not in the registry until its tick runs.
  await new Promise(resolve => setImmediate(resolve));
  await settleBackgroundWork();

  if (pendingBackgroundWorkCount() > 0) {
    // Never silently give up: leftover work is exactly what corrupts the
    // NEXT test, and a warning here names the cause instead of leaving
    // an unrelated assertion to fail three files later.
    // eslint-disable-next-line no-console
    console.warn(
      `[test-setup] ${pendingBackgroundWorkCount()} background task(s) still pending after draining — the next test may see their writes`
    );
  }
}

afterEach(async () => {
  await flushPendingBackgroundWork();
});

beforeEach(async () => {
  await flushPendingBackgroundWork();
  // TRUNCATE in dependency order; CASCADE handles any FKs we don't
  // explicitly list. RESTART IDENTITY resets serials (not used by
  // our UUID-PK schema but harmless). Add new tables here as the
  // schema grows.
  await dbModule.db.execute(
    sql`TRUNCATE TABLE monday_webhook_events, hubspot_webhook_events, admin_actions, documents, calculator_configs, deals, companies, refresh_tokens, users RESTART IDENTITY CASCADE`
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

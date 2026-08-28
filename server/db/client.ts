/**
 * Drizzle ORM client — single Postgres pool + db instance.
 *
 * Module-level singleton: every module that needs DB access imports
 * `db` from here. The pool is created lazily on first import, sized
 * by `DB_POOL_MAX` env var (default 10 — comfortable for a single
 * VPS with 2–5 concurrent operators).
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../config/env";
import { logger } from "../middleware/logger";
import * as schema from "./schema";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  // Default 30s idle timeout; pg's docs recommend this to recycle
  // idle connections against Postgres' default `idle_in_transaction_session_timeout`.
  idleTimeoutMillis: 30_000,
  // Without this, `pool.connect()` waits FOREVER for a free client. All
  // DB_POOL_MAX clients being busy is then indistinguishable from the
  // database being down: requests pile up holding their HTTP connections,
  // nothing is logged, and the only symptom is that the app stops
  // answering. Failing after 10s turns pool starvation into an error with
  // a stack trace pointing at the query that could not get a client.
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS
  // No `statement_timeout` here, deliberately. It would cap a single
  // query, which is attractive — but `server/db/migrate.ts` runs through
  // this same pool, so a future migration that rewrites a large table
  // would be killed halfway, and a half-applied migration is a far worse
  // failure than a slow one. Revisit if the migrator ever gets its own
  // connection.
});

// Errors on idle connections crash the process if we don't handle.
// In practice the most common cause is network blips against a
// remote Postgres; the next acquire will reconnect.
pool.on("error", err => {
  logger.error({ err: err.message, stack: err.stack }, "[db] idle client error");
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
export type Schema = typeof schema;

/**
 * Generic "database OR open transaction" — repositories that can run
 * inside either context type their `tx` argument as this. Drizzle's
 * `Database` and `PgTransaction<...>` share the same Select/Insert/
 * Update/Delete/execute surface so the runtime is identical; we just
 * need a type that accepts both. `Parameters<...>[0]` extracts the
 * transaction callback's first arg type, which is the TX handle.
 */
export type DbOrTx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

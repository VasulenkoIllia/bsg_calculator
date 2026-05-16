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
import * as schema from "./schema";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  // Default 30s idle timeout; pg's docs recommend this to recycle
  // idle connections against Postgres' default `idle_in_transaction_session_timeout`.
  idleTimeoutMillis: 30_000
});

// Errors on idle connections crash the process if we don't handle.
// In practice the most common cause is network blips against a
// remote Postgres; the next acquire will reconnect.
pool.on("error", err => {
  // eslint-disable-next-line no-console
  console.error("[db] idle client error:", err);
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
export type Schema = typeof schema;

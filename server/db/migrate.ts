/**
 * Apply pending migrations to the database.
 *
 * Run on container start (Docker entrypoint) AND ad-hoc during dev:
 *
 *   npm run db:migrate
 *
 * Drizzle's `migrate()` consults the `__drizzle_migrations` table to
 * know which `.sql` files have already been applied; it's idempotent.
 */

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client";

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[db:migrate] applying migrations from ./server/db/migrations");

  await migrate(db, { migrationsFolder: "./server/db/migrations" });

  // eslint-disable-next-line no-console
  console.log("[db:migrate] done.");
  await pool.end();
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error("[db:migrate] failed:", err);
  process.exit(1);
});

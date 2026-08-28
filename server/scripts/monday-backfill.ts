/**
 * Load / refresh monday data into our cache.
 *
 *   npm run monday:backfill
 *
 * Counterpart of `npm run hubspot:backfill`. Without a trigger like this
 * `runMondayBackfill` was unreachable code: after the flip there would
 * have been no way to load monday data at all, and no way to recover from
 * a missed webhook. Safe to run repeatedly — the pass only inserts and
 * updates, and it NEVER deletes (see monday.backfill.ts for why).
 */

import { pool } from "../db/client";
import { env } from "../config/env";
import { logger } from "../middleware/logger";
import { runMondayBackfill } from "../modules/monday/monday.backfill";

async function main(): Promise<void> {
  if (!env.MONDAY_API_TOKEN) {
    console.error("MONDAY_API_TOKEN is not set — nothing to do.");
    process.exitCode = 1;
    return;
  }
  const stats = await runMondayBackfill();
  console.log("\ncompanies:", JSON.stringify(stats.companies));
  console.log("deals:    ", JSON.stringify(stats.deals));
  if (stats.aborted) {
    console.error("\nABORTED:", stats.aborted);
    process.exitCode = 1;
  }
}

main()
  .catch(err => {
    logger.error({ err: (err as Error).message }, "[monday:backfill] failed");
    console.error("failed:", (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

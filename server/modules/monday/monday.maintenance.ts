/**
 * Periodic maintenance for the monday integration: a scheduled backfill,
 * and a queue-health heartbeat.
 *
 * WHY A SCHEDULED BACKFILL EXISTS
 *
 * TTL-refresh-on-read only heals rows somebody LOOKS AT. A client nobody
 * opens for three months can sit wrong for three months — and the way it
 * goes wrong is silent: a webhook deleted on a board, or an event that
 * burned its five retries, leaves no trace on the row itself.
 *
 * The backfill re-reads all three boards, so it heals rows regardless of
 * whether anyone read them. It is also the only path allowed to conclude
 * "this item is gone", because it sees a whole board at once and aborts
 * if a suspicious share went missing together.
 *
 * A second, quieter benefit: it exercises the monday API every day. A
 * token that was revoked at 02:00 is discovered by the 03:00 backfill,
 * not by the first operator who tries to save a document.
 *
 * NO PERSISTENCE, ON PURPOSE
 *
 * The schedule is a plain interval from boot rather than "at 03:00, once
 * per day", because the latter needs a durable last-run marker to survive
 * restarts, and that means a table and a migration. It is not worth it:
 * the backfill is IDEMPOTENT (it upserts) and cheap (~3,000 complexity
 * against a 1,000,000/minute ceiling), so running it twice costs
 * essentially nothing. Restart-drift is the price, and it buys a design
 * with no shared state to get wrong.
 */

import { env } from "../../config/env";
import { logger } from "../../middleware/logger";
import { db } from "../../db/client";
import { sql } from "drizzle-orm";
import { runMondayBackfill } from "./monday.backfill";

let backfillTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let backfillRunning = false;
let stopRequested = false;

const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Queue health, logged on a heartbeat.
 *
 * `/ready` already reports these numbers, but only to whoever asks. The
 * failure this guards against is nobody asking: a `failed` event is a
 * permanently lost change, and an empty-but-stale queue is what a
 * silently-deleted webhook looks like. Putting it in the log on a timer
 * means the condition reaches the place operators actually read — and any
 * log scraper — without needing a human to poll an endpoint.
 *
 * This is VISIBILITY, not paging. Nobody gets woken up.
 */
async function logQueueHealth(): Promise<void> {
  const { rows } = await db.execute<{
    pending: number;
    failed: number;
    oldest_pending_age_s: number | null;
    last_processed_age_s: number | null;
  }>(sql`
    SELECT
      count(*) FILTER (WHERE status = 'pending')::int AS pending,
      count(*) FILTER (WHERE status = 'failed')::int  AS failed,
      EXTRACT(EPOCH FROM now() - min(received_at) FILTER (WHERE status = 'pending'))::int
        AS oldest_pending_age_s,
      EXTRACT(EPOCH FROM now() - max(processed_at))::int AS last_processed_age_s
    FROM monday_webhook_events
  `);
  const r = rows[0];
  const failed = Number(r?.failed ?? 0);
  const pending = Number(r?.pending ?? 0);
  const oldestPendingAgeSeconds = r?.oldest_pending_age_s ?? null;
  const lastProcessedAgeSeconds = r?.last_processed_age_s ?? null;

  const stuck = oldestPendingAgeSeconds !== null && oldestPendingAgeSeconds > 600;
  const context = { pending, failed, oldestPendingAgeSeconds, lastProcessedAgeSeconds };

  if (failed > 0) {
    logger.error(
      context,
      "[monday:health] events have EXHAUSTED their retries — each one is a change from monday that was never applied. Inspect monday_webhook_events WHERE status = 'failed'"
    );
  } else if (stuck) {
    logger.warn(
      context,
      "[monday:health] the oldest pending event is over 10 minutes old — the processor is not draining"
    );
  } else {
    logger.info(context, "[monday:health] webhook queue");
  }
}

async function backfillTick(): Promise<void> {
  if (stopRequested) return;
  if (backfillRunning) {
    scheduleBackfill(env.MONDAY_BACKFILL_INTERVAL_HOURS * 3600_000);
    return;
  }
  backfillRunning = true;
  try {
    logger.info("[monday:maintenance] scheduled backfill starting");
    const stats = await runMondayBackfill();
    logger.info({ stats }, "[monday:maintenance] scheduled backfill complete");
  } catch (err) {
    // Never fatal. The next run tries again, and a failure here is itself
    // the signal that something upstream is wrong.
    logger.error(
      { err: (err as Error).message },
      "[monday:maintenance] scheduled backfill FAILED — will retry on the next interval"
    );
  } finally {
    backfillRunning = false;
    scheduleBackfill(env.MONDAY_BACKFILL_INTERVAL_HOURS * 3600_000);
  }
}

function scheduleBackfill(delayMs: number): void {
  if (stopRequested) return;
  backfillTimer = setTimeout(() => void backfillTick(), delayMs);
  backfillTimer.unref?.();
}

function scheduleHeartbeat(): void {
  if (stopRequested) return;
  heartbeatTimer = setTimeout(() => {
    void logQueueHealth()
      .catch(err =>
        logger.warn({ err: (err as Error).message }, "[monday:health] heartbeat query failed")
      )
      .finally(() => scheduleHeartbeat());
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();
}

export function startMondayMaintenance(): void {
  if (env.NODE_ENV === "test") return;
  if (env.CRM_PROVIDER !== "monday") return;
  stopRequested = false;

  scheduleHeartbeat();

  const hours = env.MONDAY_BACKFILL_INTERVAL_HOURS;
  if (hours <= 0) {
    logger.warn(
      "[monday:maintenance] scheduled backfill is DISABLED (MONDAY_BACKFILL_INTERVAL_HOURS=0). Rows nobody opens will not self-heal — only TTL-refresh-on-read is active"
    );
    return;
  }

  // The first run is delayed rather than immediate: a restart loop would
  // otherwise hammer monday with a full three-board read every boot.
  const firstDelayMs = env.MONDAY_BACKFILL_FIRST_DELAY_MINUTES * 60_000;
  logger.info(
    { everyHours: hours, firstRunInMinutes: env.MONDAY_BACKFILL_FIRST_DELAY_MINUTES },
    "[monday:maintenance] scheduled backfill armed"
  );
  scheduleBackfill(firstDelayMs);
}

export function stopMondayMaintenance(): void {
  stopRequested = true;
  if (backfillTimer) clearTimeout(backfillTimer);
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  backfillTimer = null;
  heartbeatTimer = null;
}

/** Test seam. */
export const __test = { logQueueHealth, backfillTick };

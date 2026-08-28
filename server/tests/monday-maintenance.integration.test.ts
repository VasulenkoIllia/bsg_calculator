/**
 * Scheduled backfill + queue-health heartbeat.
 *
 * These close the two gaps the post-cutover audit found: rows nobody
 * opens never self-heal (TTL-refresh only fires on read), and a `failed`
 * event — a change from monday that was never applied — was visible only
 * to whoever thought to curl /ready.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../config/env", async importOriginal => {
  const actual = await importOriginal<typeof import("../config/env")>();
  return {
    ...actual,
    env: { ...actual.env, CRM_PROVIDER: "monday", MONDAY_API_TOKEN: "test-token" }
  };
});

const { db } = await import("../db/client");
const { sql } = await import("drizzle-orm");
const { logger } = await import("../middleware/logger");
const { __test } = await import("../modules/monday/monday.maintenance");

async function seedEvent(status: string, opts: { receivedAgoS?: number; processedAgoS?: number } = {}) {
  const recv = opts.receivedAgoS ?? 5;
  const proc = opts.processedAgoS;
  await db.execute(sql`
    INSERT INTO monday_webhook_events
      (event_key, event_type, board_id, item_id, object_type, occurred_at,
       received_at, status, processed_at, raw)
    VALUES (
      ${"k-" + Math.floor(Math.random() * 1e9) + "-" + status},
      'create_item', '5102466967', '1', 'company', now(),
      now() - (${recv} * interval '1 second'),
      ${status},
      ${proc === undefined ? null : sql`now() - (${proc} * interval '1 second')`},
      '{}'::jsonb
    )
  `);
}

beforeEach(async () => {
  await db.execute(sql`DELETE FROM monday_webhook_events`);
  vi.restoreAllMocks();
});
afterEach(async () => {
  await db.execute(sql`DELETE FROM monday_webhook_events`);
});

describe("queue-health heartbeat", () => {
  it("logs at ERROR when an event has exhausted its retries", async () => {
    // A `failed` row is a permanently lost change. It must not be
    // reported at the same level as a healthy queue, or it reads as
    // routine noise in the log.
    const err = vi.spyOn(logger, "error").mockImplementation(() => logger);
    await seedEvent("failed", { processedAgoS: 30 });

    await __test.logQueueHealth();

    expect(err).toHaveBeenCalledTimes(1);
    expect(err.mock.calls[0][0]).toMatchObject({ failed: 1 });
    expect(String(err.mock.calls[0][1])).toContain("EXHAUSTED");
  });

  it("logs at WARN when the oldest pending event is stuck", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    await seedEvent("pending", { receivedAgoS: 900 });

    await __test.logQueueHealth();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({ pending: 1 });
    expect(String(warn.mock.calls[0][1])).toContain("not draining");
  });

  it("logs at INFO when the queue is healthy", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => logger);
    const err = vi.spyOn(logger, "error").mockImplementation(() => logger);
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    await seedEvent("processed", { processedAgoS: 10 });

    await __test.logQueueHealth();

    expect(err).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toMatchObject({ pending: 0, failed: 0 });
  });

  it("reports zeroes on an empty queue rather than throwing", async () => {
    // An empty table makes every aggregate NULL. Before this was pinned,
    // the shape depended on Postgres returning a row at all.
    const info = vi.spyOn(logger, "info").mockImplementation(() => logger);

    await __test.logQueueHealth();

    expect(info.mock.calls[0][0]).toMatchObject({
      pending: 0,
      failed: 0,
      oldestPendingAgeSeconds: null,
      lastProcessedAgeSeconds: null
    });
  });
});

describe("scheduled backfill", () => {
  it("a failing backfill is logged and swallowed, never fatal", async () => {
    // It runs on a timer in the background. An unhandled rejection here
    // would take the whole process down over a transient monday outage.
    const backfill = await import("../modules/monday/monday.backfill");
    vi.spyOn(backfill, "runMondayBackfill").mockRejectedValue(new Error("monday is down"));
    const err = vi.spyOn(logger, "error").mockImplementation(() => logger);

    await expect(__test.backfillTick()).resolves.toBeUndefined();

    expect(err).toHaveBeenCalled();
    expect(String(err.mock.calls[0][1])).toContain("will retry");
  });
});

/**
 * monday webhook receiver — the half that CAN be verified locally.
 *
 * What is covered here: the registration handshake, the secret in the
 * path, queueing, deduplication of monday's 30 retries, and the skip
 * paths. What is NOT — and cannot be — covered locally is monday actually
 * DELIVERING to our endpoint: that needs a public URL, so it is verified
 * once after the deploy.
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { app } from "./test-helpers";

const SECRET = "test_monday_webhook_secret";
const PATH = `/api/v1/monday/webhooks/${SECRET}`;
const COMPANIES_BOARD = "5102466967";

function eventBody(overrides: Record<string, unknown> = {}) {
  return {
    event: {
      type: "change_column_value",
      boardId: COMPANIES_BOARD,
      pulseId: "3170219470",
      triggerTime: "2026-08-27T10:00:00.000Z",
      userId: "113545778",
      ...overrides
    }
  };
}

async function queued(): Promise<Array<{ event_type: string; item_id: string; object_type: string }>> {
  const res = await db.execute<{ event_type: string; item_id: string; object_type: string }>(
    sql`SELECT event_type, item_id, object_type FROM monday_webhook_events ORDER BY received_at`
  );
  return res.rows;
}

beforeEach(async () => {
  await db.execute(sql`DELETE FROM monday_webhook_events`);
});

describe("POST /api/v1/monday/webhooks/:secret — handshake", () => {
  it("echoes the challenge verbatim", async () => {
    // monday refuses to register an endpoint that fails this, so it must
    // be answered BEFORE any event parsing or the webhook can never be
    // created in the first place.
    const res = await request(app).post(PATH).send({ challenge: "abc-123-xyz" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ challenge: "abc-123-xyz" });
    expect(await queued()).toHaveLength(0);
  });
});

describe("POST /api/v1/monday/webhooks/:secret — path secret", () => {
  it("rejects a wrong secret with 403", async () => {
    const res = await request(app)
      .post("/api/v1/monday/webhooks/definitely-not-the-secret")
      .send(eventBody());
    expect(res.status).toBe(403);
    expect(await queued()).toHaveLength(0);
  });

  it("rejects an empty secret segment", async () => {
    const res = await request(app).post("/api/v1/monday/webhooks/").send(eventBody());
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("POST /api/v1/monday/webhooks/:secret — queueing", () => {
  it("queues a supported event and ACKs 200", async () => {
    const res = await request(app).post(PATH).send(eventBody());
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);

    const rows = await queued();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event_type: "change_column_value",
      item_id: "3170219470",
      object_type: "company"
    });
  });

  it("deduplicates an identical redelivery", async () => {
    // monday retries the SAME payload every minute for 30 minutes and
    // sends no delivery-unique id, so without the synthesised key one
    // change would queue thirty rows.
    const body = eventBody();
    const first = await request(app).post(PATH).send(body);
    const second = await request(app).post(PATH).send(body);

    expect(first.body.accepted).toBe(1);
    expect(second.status).toBe(200);
    expect(second.body.accepted).toBe(0);
    expect(second.body.deduped).toBe(true);
    expect(await queued()).toHaveLength(1);
  });

  it("treats a different trigger time as a different event", async () => {
    await request(app).post(PATH).send(eventBody());
    await request(app)
      .post(PATH)
      .send(eventBody({ triggerTime: "2026-08-27T10:05:00.000Z" }));
    expect(await queued()).toHaveLength(2);
  });

  it("skips an event from a board we do not sync", async () => {
    const res = await request(app).post(PATH).send(eventBody({ boardId: "9999999999" }));
    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(true);
    expect(await queued()).toHaveLength(0);
  });

  it("skips an event type we did not subscribe to", async () => {
    // We deliberately do NOT subscribe to update events: we author those
    // ourselves, so subscribing would echo our own writes back at us.
    const res = await request(app).post(PATH).send(eventBody({ type: "create_update" }));
    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(true);
    expect(await queued()).toHaveLength(0);
  });

  it("ACKs an unparseable body instead of 4xx-ing it", async () => {
    // A non-2xx would make monday retry the same broken payload thirty
    // times. Better to ACK, log, and move on.
    const res = await request(app).post(PATH).send({ nonsense: true });
    expect(res.status).toBe(200);
    expect(res.body.malformed).toBe(true);
    expect(await queued()).toHaveLength(0);
  });

  it("routes a deals-board event to object_type=deal", async () => {
    const res = await request(app)
      .post(PATH)
      .send(eventBody({ boardId: "5102466996", type: "create_item", pulseId: "3170249119" }));
    expect(res.body.accepted).toBe(1);
    expect((await queued())[0].object_type).toBe("deal");
  });
});

/**
 * Integration tests for Sprint 5 — HubSpot webhooks.
 *
 * Three surfaces under test:
 *   1. POST /api/v1/hubspot/webhooks  — signature-verified receiver
 *   2. processWebhookBatch()           — async event processor
 *   3. POST /api/v1/hubspot/refresh    — operator manual resync
 *
 * Strategy:
 *   - Receiver tests issue signed and unsigned requests via supertest.
 *     Body is sent as Buffer because the route uses `express.raw`.
 *   - Processor tests stub `hubspot.getCompany` / `hubspot.getDeal`
 *     via `vi.spyOn` so no real HTTP fires. We then call
 *     `processWebhookBatch()` directly (the startWebhookProcessor
 *     timer is skipped in NODE_ENV=test).
 *   - Refresh tests assert auth gating + happy-path upsert behaviour.
 */

import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  companies,
  deals,
  hubspotWebhookEvents,
  type NewCompany
} from "../db/schema";
import { env } from "../config/env";
import { hubspot } from "../modules/hubspot/hubspot.client";
import { HubspotUnreachableError, NotFoundError } from "../shared/errors";
import { processWebhookBatch } from "../modules/hubspot/webhooks/webhooks.processor";
import type { HubspotObject } from "../modules/hubspot/hubspot.types";
import { app, createTestUser } from "./test-helpers";

// ─── Helpers ──────────────────────────────────────────────────────

const WEBHOOK_PATH = "/api/v1/hubspot/webhooks";

async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status}`);
  return res.body.accessToken;
}

function companyFixture(overrides: Partial<NewCompany> = {}): NewCompany {
  return {
    hubspotCompanyId: `hubspot-${Math.random().toString(36).slice(2)}`,
    name: "Acme Holdings",
    companyType: "direct_client",
    hubspotCreatedAt: new Date("2026-01-01"),
    hubspotModifiedAt: new Date("2026-01-01"),
    hubspotRaw: {},
    ...overrides
  };
}

/**
 * Sign a body identically to HubSpot v3:
 *   sourceString = METHOD + URI + RAW BODY + TIMESTAMP
 *
 * Two subtleties:
 *
 *   1. supertest auto-encodes a Buffer to JSON when Content-Type is
 *      application/json — `{"type":"Buffer","data":[…]}`. So we send
 *      the body as a plain string and bypass any re-encoding.
 *      Express.raw then captures the exact bytes we shipped.
 *   2. The middleware computes the URI as
 *      `${req.protocol}://${req.get("host")}${req.originalUrl}`.
 *      supertest binds to an ephemeral 127.0.0.1 port — overriding
 *      the Host header gives us a stable, signable hostname.
 */
function signWebhook(
  body: unknown,
  opts: { host: string; ts?: number; path?: string } = { host: "test.local" }
): {
  bodyString: string;
  signature: string;
  timestamp: string;
  host: string;
} {
  const bodyString = JSON.stringify(body);
  const ts = opts.ts ?? Date.now();
  const path = opts.path ?? WEBHOOK_PATH;
  const uri = `http://${opts.host}${path}`;
  const sourceString = `POST${uri}${bodyString}${ts}`;
  const signature = crypto
    .createHmac("sha256", env.HUBSPOT_WEBHOOK_SECRET ?? "")
    .update(sourceString)
    .digest("base64");
  return { bodyString, signature, timestamp: String(ts), host: opts.host };
}

/**
 * Issue a fully-signed webhook POST. Encapsulates the supertest dance
 * for content-type + Host header consistency with the signature.
 */
async function postSignedWebhook(body: unknown, host = "test.local") {
  const { bodyString, signature, timestamp } = signWebhook(body, { host });
  return request(app)
    .post(WEBHOOK_PATH)
    .set("Host", host)
    .set("Content-Type", "application/json")
    .set("X-HubSpot-Signature-v3", signature)
    .set("X-HubSpot-Request-Timestamp", timestamp)
    .send(bodyString);
}

/** Minimal HubSpot company object used to stub `hubspot.getCompany`. */
function hubspotCompanyObject(
  id: string,
  overrides: Partial<HubspotObject["properties"]> = {}
): HubspotObject {
  return {
    id,
    properties: {
      hs_object_id: id,
      name: "Acme",
      company_type: "direct_client",
      createdate: "2026-01-01T00:00:00.000Z",
      hs_lastmodifieddate: "2026-02-01T00:00:00.000Z",
      ...overrides
    }
  } as HubspotObject;
}

function hubspotDealObject(
  id: string,
  parentCompanyId: string,
  overrides: Partial<HubspotObject["properties"]> = {}
): HubspotObject {
  return {
    id,
    properties: {
      hs_object_id: id,
      hs_primary_associated_company: parentCompanyId,
      dealname: "Test Deal",
      dealstage: "appointmentscheduled",
      pipeline: "default",
      createdate: "2026-01-10T00:00:00.000Z",
      hs_lastmodifieddate: "2026-02-10T00:00:00.000Z",
      ...overrides
    }
  } as HubspotObject;
}

// ─── 1. Receiver ──────────────────────────────────────────────────

describe("POST /api/v1/hubspot/webhooks — receiver", () => {
  it("rejects requests missing the signature header (403)", async () => {
    const res = await request(app)
      .post(WEBHOOK_PATH)
      .set("Content-Type", "application/json")
      .send("[]");
    expect(res.status).toBe(403);
  });

  it("rejects a tampered signature (403)", async () => {
    const body = [
      {
        eventId: "evt-1",
        subscriptionType: "company.creation",
        objectId: "111",
        occurredAt: Date.now()
      }
    ];
    const { bodyString, timestamp } = signWebhook(body);
    const tampered = crypto.randomBytes(32).toString("base64"); // unrelated 32B
    const res = await request(app)
      .post(WEBHOOK_PATH)
      .set("Host", "test.local")
      .set("Content-Type", "application/json")
      .set("X-HubSpot-Signature-v3", tampered)
      .set("X-HubSpot-Request-Timestamp", timestamp)
      .send(bodyString);
    expect(res.status).toBe(403);
  });

  it("rejects a stale timestamp older than 5 minutes (403)", async () => {
    const body = [
      {
        eventId: "evt-stale",
        subscriptionType: "company.creation",
        objectId: "222",
        occurredAt: Date.now()
      }
    ];
    const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
    const { bodyString, signature, timestamp } = signWebhook(body, {
      host: "test.local",
      ts: sixMinutesAgo
    });
    const res = await request(app)
      .post(WEBHOOK_PATH)
      .set("Host", "test.local")
      .set("Content-Type", "application/json")
      .set("X-HubSpot-Signature-v3", signature)
      .set("X-HubSpot-Request-Timestamp", timestamp)
      .send(bodyString);
    expect(res.status).toBe(403);
  });

  it("accepts a valid signed payload and inserts pending rows (200)", async () => {
    const body = [
      {
        eventId: "evt-creation",
        subscriptionType: "company.creation",
        objectId: "555",
        occurredAt: Date.now()
      },
      {
        eventId: "evt-update",
        subscriptionType: "company.propertyChange",
        objectId: "555",
        occurredAt: Date.now()
      }
    ];
    const res = await postSignedWebhook(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: 2, deduped: 0 });

    const rows = await db.select().from(hubspotWebhookEvents);
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.status === "pending")).toBe(true);
  });

  it("dedupes a redelivered event (same hubspotEventId) — accepted=0, deduped=1", async () => {
    const evt = {
      eventId: "evt-dup",
      subscriptionType: "company.creation",
      objectId: "777",
      occurredAt: Date.now()
    };
    const first = await postSignedWebhook([evt]);
    expect(first.status).toBe(200);
    expect(first.body.accepted).toBe(1);

    const second = await postSignedWebhook([evt]);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ accepted: 0, deduped: 1 });

    const rows = await db.select().from(hubspotWebhookEvents);
    expect(rows).toHaveLength(1);
  });

  it("acks-and-drops a malformed payload shape (200 with malformed=true)", async () => {
    // HubSpot would never normally send this; if they ever change the
    // schema the receiver should LOG and ack so we don't fall into a
    // redelivery storm.
    const body = [{ wrong: "shape" }];
    const res = await postSignedWebhook(body);
    expect(res.status).toBe(200);
    expect(res.body.malformed).toBe(true);
    const rows = await db.select().from(hubspotWebhookEvents);
    expect(rows).toHaveLength(0);
  });

  it("acks-and-drops an unsupported subscription type (200 with malformed=true)", async () => {
    // Zod enum rejects anything outside SUPPORTED_SUBSCRIPTION_TYPES.
    // We log but don't 4xx — see receiver controller for rationale.
    const body = [
      {
        eventId: "evt-contact",
        subscriptionType: "contact.creation",
        objectId: "999",
        occurredAt: Date.now()
      }
    ];
    const res = await postSignedWebhook(body);
    expect(res.status).toBe(200);
    expect(res.body.malformed).toBe(true);
  });
});

// ─── 2. Processor ─────────────────────────────────────────────────

describe("processWebhookBatch() — async event processing", () => {
  let getCompanySpy: ReturnType<typeof vi.spyOn>;
  let getDealSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getCompanySpy = vi.spyOn(hubspot, "getCompany");
    getDealSpy = vi.spyOn(hubspot, "getDeal");
  });

  afterEach(() => {
    getCompanySpy.mockRestore();
    getDealSpy.mockRestore();
  });

  it("creation: fetches from HubSpot, upserts company, marks 'upserted'", async () => {
    getCompanySpy.mockResolvedValue(
      hubspotCompanyObject("HS-1001", { name: "Direct Client A" })
    );

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-c-1",
      subscriptionType: "company.creation",
      objectType: "company",
      hubspotObjectId: "HS-1001",
      occurredAt: new Date(),
      raw: {}
    });

    const result = await processWebhookBatch();
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);

    const cos = await db.select().from(companies);
    expect(cos).toHaveLength(1);
    expect(cos[0].name).toBe("Direct Client A");

    const [evt] = await db.select().from(hubspotWebhookEvents);
    expect(evt.status).toBe("processed");
    expect(evt.outcome).toBe("upserted");
  });

  it("propertyChange: refetches + upserts existing company", async () => {
    // Seed the row first; propertyChange should refresh `name`.
    const [existing] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "HS-2001", name: "Old name" }))
      .returning();
    expect(existing.name).toBe("Old name");

    getCompanySpy.mockResolvedValue(
      hubspotCompanyObject("HS-2001", { name: "Renamed Inc" })
    );

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-c-2",
      subscriptionType: "company.propertyChange",
      objectType: "company",
      hubspotObjectId: "HS-2001",
      occurredAt: new Date(),
      raw: {}
    });

    await processWebhookBatch();
    const [updated] = await db
      .select()
      .from(companies)
      .where(eq(companies.hubspotCompanyId, "HS-2001"));
    expect(updated.name).toBe("Renamed Inc");
  });

  it("filtered_out: non-direct_client company → no upsert, outcome=filtered_out", async () => {
    getCompanySpy.mockResolvedValue(
      hubspotCompanyObject("HS-3001", { company_type: "agent" })
    );

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-c-3",
      subscriptionType: "company.creation",
      objectType: "company",
      hubspotObjectId: "HS-3001",
      occurredAt: new Date(),
      raw: {}
    });

    await processWebhookBatch();

    const cos = await db.select().from(companies);
    expect(cos).toHaveLength(0);

    const [evt] = await db.select().from(hubspotWebhookEvents);
    expect(evt.status).toBe("processed");
    expect(evt.outcome).toBe("filtered_out");
  });

  it("deletion: deletes company AND its deals without fetching from HubSpot", async () => {
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "HS-4001" }))
      .returning();
    await db.insert(deals).values({
      hubspotDealId: "DEAL-4001",
      hubspotCompanyId: company.hubspotCompanyId,
      name: "Doomed Deal",
      hubspotCreatedAt: new Date(),
      hubspotModifiedAt: new Date(),
      hubspotRaw: {}
    });

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-c-del",
      subscriptionType: "company.deletion",
      objectType: "company",
      hubspotObjectId: "HS-4001",
      occurredAt: new Date(),
      raw: {}
    });

    await processWebhookBatch();
    expect(getCompanySpy).not.toHaveBeenCalled();

    expect((await db.select().from(companies)).length).toBe(0);
    expect((await db.select().from(deals)).length).toBe(0);

    const [evt] = await db.select().from(hubspotWebhookEvents);
    expect(evt.outcome).toBe("deleted");
  });

  it("HubSpot 404 on creation → treats it as a delete (race protection)", async () => {
    // HubSpot returns a NotFoundError-shaped response when the object
    // has been removed between the event and our fetch.
    getCompanySpy.mockRejectedValue(new NotFoundError("gone"));

    // Pre-seed a row so we can verify the deletion path actually runs.
    await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "HS-5001" }));

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-c-race",
      subscriptionType: "company.creation",
      objectType: "company",
      hubspotObjectId: "HS-5001",
      occurredAt: new Date(),
      raw: {}
    });

    await processWebhookBatch();

    expect((await db.select().from(companies)).length).toBe(0);
    const [evt] = await db.select().from(hubspotWebhookEvents);
    expect(evt.outcome).toBe("deleted");
  });

  it("transient HubSpot failure → recordFailure → attempts++, status stays pending", async () => {
    getCompanySpy.mockRejectedValue(
      new HubspotUnreachableError("connection refused")
    );

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-c-fail",
      subscriptionType: "company.creation",
      objectType: "company",
      hubspotObjectId: "HS-6001",
      occurredAt: new Date(),
      raw: {}
    });

    await processWebhookBatch();
    const [evt] = await db.select().from(hubspotWebhookEvents);
    expect(evt.status).toBe("pending");
    expect(evt.attempts).toBe(1);
    expect(evt.lastError).toMatch(/connection refused/);
  });

  it("after MAX_ATTEMPTS failures → status flips to 'failed'", async () => {
    getCompanySpy.mockRejectedValue(
      new HubspotUnreachableError("upstream 500")
    );

    // Seed with attempts=4 so the next failure (the 5th) exhausts.
    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-c-burn",
      subscriptionType: "company.creation",
      objectType: "company",
      hubspotObjectId: "HS-7001",
      occurredAt: new Date(),
      attempts: 4,
      raw: {}
    });

    await processWebhookBatch();
    const [evt] = await db.select().from(hubspotWebhookEvents);
    expect(evt.status).toBe("failed");
    expect(evt.lastError).toMatch(/upstream 500/);
  });

  it("deal event: skips when parent company isn't in our cache (filtered_out)", async () => {
    // Parent company NOT seeded → deal upsert would fail FK; processor
    // should skip cleanly instead of throwing.
    getDealSpy.mockResolvedValue(
      hubspotDealObject("DEAL-8001", "HS-8001")
    );

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-d-orphan",
      subscriptionType: "deal.creation",
      objectType: "deal",
      hubspotObjectId: "DEAL-8001",
      occurredAt: new Date(),
      raw: {}
    });

    await processWebhookBatch();
    const [evt] = await db.select().from(hubspotWebhookEvents);
    expect(evt.status).toBe("processed");
    expect(evt.outcome).toBe("filtered_out");
    expect((await db.select().from(deals)).length).toBe(0);
  });

  it("deal event: upserts when parent company exists", async () => {
    await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "HS-9001" }));
    getDealSpy.mockResolvedValue(hubspotDealObject("DEAL-9001", "HS-9001"));

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-d-ok",
      subscriptionType: "deal.creation",
      objectType: "deal",
      hubspotObjectId: "DEAL-9001",
      occurredAt: new Date(),
      raw: {}
    });

    await processWebhookBatch();
    const [evt] = await db.select().from(hubspotWebhookEvents);
    expect(evt.outcome).toBe("upserted");
    expect((await db.select().from(deals)).length).toBe(1);
  });

  it("processes batch in occurredAt ASC order (oldest first)", async () => {
    getCompanySpy.mockImplementation(async (id: string) =>
      hubspotCompanyObject(id, { name: `co-${id}` })
    );

    const t0 = new Date("2026-05-01T10:00:00Z");
    const t1 = new Date("2026-05-01T11:00:00Z");
    const t2 = new Date("2026-05-01T12:00:00Z");

    await db.insert(hubspotWebhookEvents).values([
      {
        hubspotEventId: "evt-mid",
        subscriptionType: "company.creation",
        objectType: "company",
        hubspotObjectId: "HS-MID",
        occurredAt: t1,
        raw: {}
      },
      {
        hubspotEventId: "evt-old",
        subscriptionType: "company.creation",
        objectType: "company",
        hubspotObjectId: "HS-OLD",
        occurredAt: t0,
        raw: {}
      },
      {
        hubspotEventId: "evt-new",
        subscriptionType: "company.creation",
        objectType: "company",
        hubspotObjectId: "HS-NEW",
        occurredAt: t2,
        raw: {}
      }
    ]);

    await processWebhookBatch();

    const order = getCompanySpy.mock.calls.map(c => c[0]);
    expect(order).toEqual(["HS-OLD", "HS-MID", "HS-NEW"]);
  });
});

// ─── 3. Refresh endpoint ──────────────────────────────────────────

describe("POST /api/v1/hubspot/refresh — manual operator resync", () => {
  it("requires auth (401)", async () => {
    const res = await request(app).post("/api/v1/hubspot/refresh").send({});
    expect(res.status).toBe(401);
  });

  it("400 on companyIds > 100", async () => {
    await createTestUser({ email: "op@bsg.test", password: "password12345" });
    const token = await loginAs("op@bsg.test", "password12345");
    const tooMany = Array.from({ length: 101 }, () =>
      "00000000-0000-4000-8000-000000000000"
    );
    const res = await request(app)
      .post("/api/v1/hubspot/refresh")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyIds: tooMany });
    expect(res.status).toBe(400);
  });

  it("400 on a non-UUID id (Zod rejects before any HubSpot call)", async () => {
    await createTestUser({ email: "op@bsg.test", password: "password12345" });
    const token = await loginAs("op@bsg.test", "password12345");
    const res = await request(app)
      .post("/api/v1/hubspot/refresh")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyIds: ["not-a-uuid"] });
    expect(res.status).toBe(400);
  });

  it("happy path: refetches each company from HubSpot and upserts", async () => {
    await createTestUser({ email: "op@bsg.test", password: "password12345" });
    const token = await loginAs("op@bsg.test", "password12345");

    const [c1] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "HS-R1", name: "old-1" }))
      .returning();
    const [c2] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "HS-R2", name: "old-2" }))
      .returning();

    const spy = vi
      .spyOn(hubspot, "getCompany")
      .mockImplementation(async (id: string) =>
        hubspotCompanyObject(id, { name: `fresh-${id}` })
      );

    try {
      const res = await request(app)
        .post("/api/v1/hubspot/refresh")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyIds: [c1.id, c2.id] });
      expect(res.status).toBe(200);
      expect(res.body.refreshed).toBe(2);
      expect(res.body.failed).toBe(0);

      const updated1 = await db
        .select()
        .from(companies)
        .where(eq(companies.id, c1.id));
      const updated2 = await db
        .select()
        .from(companies)
        .where(eq(companies.id, c2.id));
      expect(updated1[0].name).toBe("fresh-HS-R1");
      expect(updated2[0].name).toBe("fresh-HS-R2");
    } finally {
      spy.mockRestore();
    }
  });

  it("counts a missing company id as failed (lookup returned no row)", async () => {
    await createTestUser({ email: "op@bsg.test", password: "password12345" });
    const token = await loginAs("op@bsg.test", "password12345");

    const res = await request(app)
      .post("/api/v1/hubspot/refresh")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyIds: ["00000000-0000-4000-8000-000000000000"] });
    expect(res.status).toBe(200);
    expect(res.body.refreshed).toBe(0);
    expect(res.body.failed).toBe(1);
  });
});

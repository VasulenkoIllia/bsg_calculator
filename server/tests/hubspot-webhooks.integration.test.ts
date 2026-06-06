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
  calculatorConfigs,
  companies,
  deals,
  documents,
  hubspotWebhookEvents
} from "../db/schema";
import { env } from "../config/env";
import { hubspot } from "../modules/hubspot/hubspot.client";
import { HubspotUnreachableError } from "../shared/errors";
import { processWebhookBatch } from "../modules/hubspot/webhooks/webhooks.processor";
import type { HubspotObject } from "../modules/hubspot/hubspot.types";
import { companyFixture } from "./fixtures/company";
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
 *   2. Sprint 5.F.1 hardened the URI in the middleware: it is now
 *      computed from `env.APP_PUBLIC_URL` (a server-trusted constant)
 *      instead of proxy-controlled `req.protocol` / `req.get("host")`.
 *      The test helper therefore signs against the same constant.
 *      In production the operator must register exactly the same URL
 *      in the HubSpot Private App webhook settings.
 */
function signWebhook(
  body: unknown,
  opts: { ts?: number; path?: string } = {}
): {
  bodyString: string;
  signature: string;
  timestamp: string;
} {
  const bodyString = JSON.stringify(body);
  const ts = opts.ts ?? Date.now();
  const path = opts.path ?? WEBHOOK_PATH;
  const uri = `${env.APP_PUBLIC_URL.replace(/\/$/, "")}${path}`;
  const sourceString = `POST${uri}${bodyString}${ts}`;
  const signature = crypto
    .createHmac("sha256", env.HUBSPOT_WEBHOOK_SECRET ?? "")
    .update(sourceString)
    .digest("base64");
  return { bodyString, signature, timestamp: String(ts) };
}

/**
 * Issue a fully-signed webhook POST. Encapsulates the supertest dance
 * for content-type consistency with the signature.
 */
async function postSignedWebhook(body: unknown) {
  const { bodyString, signature, timestamp } = signWebhook(body);
  return request(app)
    .post(WEBHOOK_PATH)
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
        eventId: "10000001",
        subscriptionType: "company.creation",
        objectId: "111",
        occurredAt: Date.now()
      }
    ];
    const { bodyString, timestamp } = signWebhook(body);
    const tampered = crypto.randomBytes(32).toString("base64"); // unrelated 32B
    const res = await request(app)
      .post(WEBHOOK_PATH)
      .set("Content-Type", "application/json")
      .set("X-HubSpot-Signature-v3", tampered)
      .set("X-HubSpot-Request-Timestamp", timestamp)
      .send(bodyString);
    expect(res.status).toBe(403);
  });

  it("rejects a stale timestamp older than 5 minutes (403)", async () => {
    const body = [
      {
        eventId: "10000002",
        subscriptionType: "company.creation",
        objectId: "222",
        occurredAt: Date.now()
      }
    ];
    const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
    const { bodyString, signature, timestamp } = signWebhook(body, { ts: sixMinutesAgo });
    const res = await request(app)
      .post(WEBHOOK_PATH)
      .set("Content-Type", "application/json")
      .set("X-HubSpot-Signature-v3", signature)
      .set("X-HubSpot-Request-Timestamp", timestamp)
      .send(bodyString);
    expect(res.status).toBe(403);
  });

  it("accepts a valid signed payload and inserts pending rows (200)", async () => {
    const body = [
      {
        eventId: "10000003",
        subscriptionType: "company.creation",
        objectId: "555",
        occurredAt: Date.now()
      },
      {
        eventId: "10000004",
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
      eventId: "10000005",
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

  it("acks-and-drops a malformed payload shape (200 with malformed=true + dropped count)", async () => {
    // HubSpot would never normally send this; if they ever change the
    // schema the receiver should LOG and ack so we don't fall into a
    // redelivery storm.
    const body = [{ wrong: "shape" }, { also: "wrong" }];
    const res = await postSignedWebhook(body);
    expect(res.status).toBe(200);
    expect(res.body.malformed).toBe(true);
    // Sprint 5.F.2.b: `dropped` now reflects the real array length
    // instead of being hard-coded to 0.
    expect(res.body.dropped).toBe(2);
    expect(res.body.accepted).toBe(0);
    const rows = await db.select().from(hubspotWebhookEvents);
    expect(rows).toHaveLength(0);
  });

  it("acks-and-drops events with non-numeric objectId/eventId (Sprint 5.F.2 SSRF defence)", async () => {
    // HubSpot ids are ALWAYS numeric. A non-numeric value reaching
    // the processor would be passed into a URL path segment for
    // hubspot.getCompany; the numericIdField regex catches it at
    // the Zod boundary so the processor never sees it.
    const body = [
      {
        eventId: "10000099",
        subscriptionType: "company.creation",
        objectId: "../injected/path",
        occurredAt: Date.now()
      }
    ];
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
        eventId: "10000006",
        subscriptionType: "contact.creation",
        objectId: "999",
        occurredAt: Date.now()
      }
    ];
    const res = await postSignedWebhook(body);
    expect(res.status).toBe(200);
    expect(res.body.malformed).toBe(true);
    expect(res.body.dropped).toBe(1);
  });

  it("does NOT drop a batch containing merge / associationChange events (modeled types)", async () => {
    // Regression: company.merge + company.associationChange used to be
    // outside SUPPORTED_SUBSCRIPTION_TYPES. Because webhookBodySchema
    // validates the WHOLE array, ONE such event failed the parse and
    // the receiver dropped EVERY event in the batch — including the
    // creation/propertyChange events that shared it. Now they're
    // modeled, so a mixed batch queues all of them.
    const body = [
      {
        eventId: "10000201",
        subscriptionType: "company.associationChange",
        objectId: "1201",
        occurredAt: Date.now()
      },
      {
        eventId: "10000202",
        subscriptionType: "company.merge",
        objectId: "1202",
        primaryObjectId: "1202",
        mergedObjectIds: ["1203"],
        occurredAt: Date.now()
      },
      {
        eventId: "10000203",
        subscriptionType: "company.creation",
        objectId: "1204",
        occurredAt: Date.now()
      }
    ];
    const res = await postSignedWebhook(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: 3, deduped: 0 });
    const rows = await db.select().from(hubspotWebhookEvents);
    expect(rows).toHaveLength(3);
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

  it("deletion: company WITH documents → marks hubspot_deleted_at (keeps company + docs, drops deals, no FK-fail loop)", async () => {
    const user = await createTestUser({ email: "del-docs@test.dev", password: "password123" });
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "HS-DEL-DOCS" }))
      .returning();
    await db.insert(deals).values({
      hubspotDealId: "DEAL-DEL-DOCS",
      hubspotCompanyId: company.hubspotCompanyId,
      name: "Doomed Deal",
      hubspotCreatedAt: new Date(),
      hubspotModifiedAt: new Date(),
      hubspotRaw: {}
    });
    const [doc] = await db
      .insert(documents)
      .values({
        number: "BSG-9100001-DEL001",
        companyId: company.id,
        scope: "offer",
        payload: {},
        createdByUserId: user.id
      })
      .returning();

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-del-docs",
      subscriptionType: "company.deletion",
      objectType: "company",
      hubspotObjectId: company.hubspotCompanyId,
      occurredAt: new Date(),
      raw: {}
    });

    const result = await processWebhookBatch();
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0); // no more FK-fail retry loop

    // Company RETAINED + flagged; document retained; deal dropped.
    const [kept] = await db
      .select()
      .from(companies)
      .where(eq(companies.hubspotCompanyId, company.hubspotCompanyId));
    expect(kept).toBeDefined();
    expect(kept.hubspotDeletedAt).not.toBeNull();
    const [keptDoc] = await db.select().from(documents).where(eq(documents.id, doc.id));
    expect(keptDoc).toBeDefined();
    expect((await db.select().from(deals)).length).toBe(0);

    const [evt] = await db.select().from(hubspotWebhookEvents);
    expect(evt.status).toBe("processed");
    expect(evt.outcome).toBe("deleted");
  });

  it("upsert (restore / propertyChange) clears the hubspot_deleted_at marker", async () => {
    const user = await createTestUser({ email: "del-restore@test.dev", password: "password123" });
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "HS-RESTORE", hubspotDeletedAt: new Date() }))
      .returning();
    expect(company.hubspotDeletedAt).not.toBeNull();
    await db.insert(documents).values({
      number: "BSG-9100002-RES001",
      companyId: company.id,
      scope: "offer",
      payload: {},
      createdByUserId: user.id
    });

    getCompanySpy.mockResolvedValue(hubspotCompanyObject("HS-RESTORE", { name: "Back Alive" }));
    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-restore",
      subscriptionType: "company.restore",
      objectType: "company",
      hubspotObjectId: "HS-RESTORE",
      occurredAt: new Date(),
      raw: {}
    });
    await processWebhookBatch();

    const [healed] = await db
      .select()
      .from(companies)
      .where(eq(companies.hubspotCompanyId, "HS-RESTORE"));
    expect(healed.hubspotDeletedAt).toBeNull();
    expect(healed.name).toBe("Back Alive");
  });

  it("HubSpot 404 on creation → treats it as a delete (race protection)", async () => {
    // The client surfaces a 404 as HubspotUnreachableError(status=404)
    // (NOT NotFoundError) when the object was removed between the event
    // and our fetch — the processor detects it by status.
    getCompanySpy.mockRejectedValue(
      new HubspotUnreachableError("HubSpot returned 404: gone", { status: 404, url: "x" })
    );

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
    // receivedAt is backdated 10 minutes so the Sprint 5.F.1 backoff
    // window (attempts × 30s = 2 min) has already passed and
    // listPendingEvents picks this row up. Without the backdate the
    // row would not be eligible on this tick and the test would see
    // status='pending' (correct under the new backoff, but not what
    // this test wants to assert).
    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-c-burn",
      subscriptionType: "company.creation",
      objectType: "company",
      hubspotObjectId: "HS-7001",
      occurredAt: new Date(Date.now() - 10 * 60 * 1000),
      receivedAt: new Date(Date.now() - 10 * 60 * 1000),
      attempts: 4,
      raw: {}
    });

    await processWebhookBatch();
    const [evt] = await db.select().from(hubspotWebhookEvents);
    expect(evt.status).toBe("failed");
    expect(evt.lastError).toMatch(/upstream 500/);
  });

  it("retry backoff: a row that just failed isn't re-picked on the next tick", async () => {
    // Sprint 5.F.1: a row with attempts=1 + recent receivedAt should
    // NOT be eligible because (1 × 30s) hasn't elapsed yet.
    getCompanySpy.mockResolvedValue(
      hubspotCompanyObject("HS-BO-1", { name: "shouldnotmatter" })
    );

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-backoff",
      subscriptionType: "company.creation",
      objectType: "company",
      hubspotObjectId: "HS-BO-1",
      occurredAt: new Date(),
      receivedAt: new Date(), // just received
      attempts: 1, // first retry pending — needs 30s wait
      raw: {}
    });

    const result = await processWebhookBatch();
    expect(result.processed).toBe(0);
    expect(getCompanySpy).not.toHaveBeenCalled();

    const [evt] = await db.select().from(hubspotWebhookEvents);
    expect(evt.status).toBe("pending");
    expect(evt.attempts).toBe(1);
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

  it("deal.propertyChange: refetches + upserts existing deal", async () => {
    // Sprint 5.F.2.b: deal.propertyChange has the same fetch/map/upsert
    // path as deal.creation but a different subscription string. This
    // test guards against a future regression where a `subType`-switched
    // branch starts treating propertyChange differently.
    const [parent] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "HS-PC-1" }))
      .returning();
    await db.insert(deals).values({
      hubspotDealId: "DEAL-PC-1",
      hubspotCompanyId: parent.hubspotCompanyId,
      name: "old-name",
      hubspotCreatedAt: new Date(),
      hubspotModifiedAt: new Date(),
      hubspotRaw: {}
    });
    getDealSpy.mockResolvedValue(
      hubspotDealObject("DEAL-PC-1", "HS-PC-1", { dealname: "new-name" })
    );

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-d-pc",
      subscriptionType: "deal.propertyChange",
      objectType: "deal",
      hubspotObjectId: "DEAL-PC-1",
      occurredAt: new Date(),
      raw: {}
    });

    await processWebhookBatch();
    const updated = await db
      .select()
      .from(deals)
      .where(eq(deals.hubspotDealId, "DEAL-PC-1"));
    expect(updated[0].name).toBe("new-name");
    const [evt] = await db.select().from(hubspotWebhookEvents);
    expect(evt.outcome).toBe("upserted");
  });

  it("deal.deletion: deletes the deal without touching the parent company", async () => {
    // Sprint 5.F.2.b: deal.deletion was the only one of the 6
    // subscription types with no processor coverage. This test asserts
    // (a) the deal row is removed, (b) the parent company row is left
    // alone, and (c) HubSpot is NOT contacted.
    const [parent] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "HS-DD-1" }))
      .returning();
    await db.insert(deals).values({
      hubspotDealId: "DEAL-DD-1",
      hubspotCompanyId: parent.hubspotCompanyId,
      name: "Doomed Deal",
      hubspotCreatedAt: new Date(),
      hubspotModifiedAt: new Date(),
      hubspotRaw: {}
    });

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-d-del",
      subscriptionType: "deal.deletion",
      objectType: "deal",
      hubspotObjectId: "DEAL-DD-1",
      occurredAt: new Date(),
      raw: {}
    });

    await processWebhookBatch();

    expect(getDealSpy).not.toHaveBeenCalled();
    expect((await db.select().from(deals)).length).toBe(0);
    expect((await db.select().from(companies)).length).toBe(1);

    const [evt] = await db.select().from(hubspotWebhookEvents);
    expect(evt.status).toBe("processed");
    expect(evt.outcome).toBe("deleted");
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

  // ─── company.merge / deal.merge (Option A — re-point) ───────────────
  // NOTE: merge ids flow through readMergeIds, which enforces the
  // numeric HubSpot-id shape — so these fixtures use numeric ids (as
  // real HubSpot does), NOT companyFixture's default `hubspot-<rand>`.

  it("company.merge: re-points documents/configs/deals to the surviving primary, removes the secondary", async () => {
    const user = await createTestUser({ email: "merge1@test.dev", password: "password123" });
    const [primary] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "9100000001", name: "Survivor" }))
      .returning();
    const [secondary] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "9100000002", name: "Merged Away" }))
      .returning();

    await db.insert(deals).values({
      hubspotDealId: "9100000003",
      hubspotCompanyId: secondary.hubspotCompanyId,
      name: "Secondary Deal",
      hubspotCreatedAt: new Date(),
      hubspotModifiedAt: new Date(),
      hubspotRaw: {}
    });
    const [doc] = await db
      .insert(documents)
      .values({
        number: "BSG-9000001-000001",
        companyId: secondary.id,
        scope: "offer",
        payload: {},
        createdByUserId: user.id
      })
      .returning();
    // A SOFT-DELETED document must ALSO follow the merge — it still
    // references the company (FK ignores deleted_at) and is part of the
    // survivor's history. Guards against a future "alive-only" filter.
    const [softDeletedDoc] = await db
      .insert(documents)
      .values({
        number: "BSG-9000001-000099",
        companyId: secondary.id,
        scope: "offer",
        payload: {},
        createdByUserId: user.id,
        deletedAt: new Date(),
        deletedByUserId: user.id,
        deletionReason: "other"
      })
      .returning();
    const [cfg] = await db
      .insert(calculatorConfigs)
      .values({ companyId: secondary.id, payload: {}, createdByUserId: user.id })
      .returning();

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-merge-1",
      subscriptionType: "company.merge",
      objectType: "company",
      hubspotObjectId: primary.hubspotCompanyId,
      occurredAt: new Date(),
      raw: {
        primaryObjectId: primary.hubspotCompanyId,
        mergedObjectIds: [secondary.hubspotCompanyId]
      }
    });

    const result = await processWebhookBatch();
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    // Primary already cached → no HubSpot fetch.
    expect(getCompanySpy).not.toHaveBeenCalled();

    // Secondary company gone; primary survives.
    const cos = await db.select().from(companies);
    expect(cos.map(c => c.hubspotCompanyId)).toEqual(["9100000001"]);

    // Owned rows now point at the primary.
    const [movedDoc] = await db.select().from(documents).where(eq(documents.id, doc.id));
    expect(movedDoc.companyId).toBe(primary.id);
    const [movedSoftDeleted] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, softDeletedDoc.id));
    expect(movedSoftDeleted.companyId).toBe(primary.id);
    const [movedCfg] = await db
      .select()
      .from(calculatorConfigs)
      .where(eq(calculatorConfigs.id, cfg.id));
    expect(movedCfg.companyId).toBe(primary.id);
    const [movedDeal] = await db
      .select()
      .from(deals)
      .where(eq(deals.hubspotDealId, "9100000003"));
    expect(movedDeal.hubspotCompanyId).toBe(primary.hubspotCompanyId);

    const [evt] = await db.select().from(hubspotWebhookEvents);
    expect(evt.status).toBe("processed");
    expect(evt.outcome).toBe("deleted");
  });

  it("company.merge: idempotent — re-delivering after the secondary is gone is a no-op", async () => {
    const user = await createTestUser({ email: "merge2@test.dev", password: "password123" });
    const [primary] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "9100000011" }))
      .returning();
    const [secondary] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "9100000012" }))
      .returning();
    const [doc] = await db
      .insert(documents)
      .values({
        number: "BSG-9000002-000002",
        companyId: secondary.id,
        scope: "offer",
        payload: {},
        createdByUserId: user.id
      })
      .returning();

    const raw = {
      primaryObjectId: primary.hubspotCompanyId,
      mergedObjectIds: [secondary.hubspotCompanyId]
    };
    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-merge-2a",
      subscriptionType: "company.merge",
      objectType: "company",
      hubspotObjectId: primary.hubspotCompanyId,
      occurredAt: new Date(),
      raw
    });
    await processWebhookBatch();

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-merge-2b",
      subscriptionType: "company.merge",
      objectType: "company",
      hubspotObjectId: primary.hubspotCompanyId,
      occurredAt: new Date(),
      raw
    });
    const result = await processWebhookBatch();
    expect(result.failed).toBe(0);

    expect(await db.select().from(companies)).toHaveLength(1);
    const [movedDoc] = await db.select().from(documents).where(eq(documents.id, doc.id));
    expect(movedDoc.companyId).toBe(primary.id);
  });

  it("company.merge: fetches + upserts the surviving primary when it isn't cached yet", async () => {
    const user = await createTestUser({ email: "merge3@test.dev", password: "password123" });
    const [secondary] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "9100000022" }))
      .returning();
    const [doc] = await db
      .insert(documents)
      .values({
        number: "BSG-9000003-000003",
        companyId: secondary.id,
        scope: "offer",
        payload: {},
        createdByUserId: user.id
      })
      .returning();

    getCompanySpy.mockResolvedValue(
      hubspotCompanyObject("9100000021", { name: "Fetched Survivor" })
    );

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-merge-3",
      subscriptionType: "company.merge",
      objectType: "company",
      hubspotObjectId: "9100000021",
      occurredAt: new Date(),
      raw: { primaryObjectId: "9100000021", mergedObjectIds: [secondary.hubspotCompanyId] }
    });
    const result = await processWebhookBatch();
    expect(result.processed).toBe(1);
    expect(getCompanySpy).toHaveBeenCalledWith("9100000021");

    const [primary] = await db
      .select()
      .from(companies)
      .where(eq(companies.hubspotCompanyId, "9100000021"));
    expect(primary).toBeDefined();
    expect(primary.name).toBe("Fetched Survivor");
    const [movedDoc] = await db.select().from(documents).where(eq(documents.id, doc.id));
    expect(movedDoc.companyId).toBe(primary.id);
    // Secondary removed.
    const remaining = await db
      .select()
      .from(companies)
      .where(eq(companies.hubspotCompanyId, secondary.hubspotCompanyId));
    expect(remaining).toHaveLength(0);
  });

  it("deal.merge: removes the merged-away secondary deal without fetching", async () => {
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "9100000040" }))
      .returning();
    await db.insert(deals).values([
      {
        hubspotDealId: "9100000031",
        hubspotCompanyId: company.hubspotCompanyId,
        name: "Primary Deal",
        hubspotCreatedAt: new Date(),
        hubspotModifiedAt: new Date(),
        hubspotRaw: {}
      },
      {
        hubspotDealId: "9100000032",
        hubspotCompanyId: company.hubspotCompanyId,
        name: "Secondary Deal",
        hubspotCreatedAt: new Date(),
        hubspotModifiedAt: new Date(),
        hubspotRaw: {}
      }
    ]);

    await db.insert(hubspotWebhookEvents).values({
      hubspotEventId: "evt-merge-deal",
      subscriptionType: "deal.merge",
      objectType: "deal",
      hubspotObjectId: "9100000031",
      occurredAt: new Date(),
      raw: { primaryObjectId: "9100000031", mergedObjectIds: ["9100000032"] }
    });
    const result = await processWebhookBatch();
    expect(result.processed).toBe(1);
    expect(getDealSpy).not.toHaveBeenCalled();

    const remaining = (await db.select().from(deals)).map(d => d.hubspotDealId);
    expect(remaining).toEqual(["9100000031"]);
  });
});

// ─── 3. Refresh endpoint ──────────────────────────────────────────

describe("POST /api/v1/hubspot/refresh — manual operator resync", () => {
  it("requires auth (401)", async () => {
    const res = await request(app).post("/api/v1/hubspot/refresh").send({});
    expect(res.status).toBe(401);
  });

  it("400 on companyIds > 20 (Sprint 5.F.1 cap)", async () => {
    await createTestUser({ email: "op@bsg.test", password: "password12345" });
    const token = await loginAs("op@bsg.test", "password12345");
    const tooMany = Array.from({ length: 21 }, () =>
      "00000000-0000-4000-8000-000000000000"
    );
    const res = await request(app)
      .post("/api/v1/hubspot/refresh")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyIds: tooMany });
    expect(res.status).toBe(400);
  });

  it("400 on empty / missing companyIds (cap requires min 1)", async () => {
    await createTestUser({ email: "op@bsg.test", password: "password12345" });
    const token = await loginAs("op@bsg.test", "password12345");
    const empty = await request(app)
      .post("/api/v1/hubspot/refresh")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyIds: [] });
    expect(empty.status).toBe(400);
    const missing = await request(app)
      .post("/api/v1/hubspot/refresh")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(missing.status).toBe(400);
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

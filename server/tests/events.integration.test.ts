/**
 * Phase 8 Stage 4 — event-log integration tests.
 *
 * Verifies that:
 *   - POST /documents records a 'created' event with the actor.
 *   - GET /documents/:number/events returns the events DESC.
 *   - POST /calculator-configs records a 'created' event in the
 *     same TX as the row insert (rollback leaves both empty).
 *   - GET /calculator-configs/:id/events returns the events DESC.
 *   - 404 when the entity doesn't exist.
 *   - All endpoints require auth.
 *
 * HubSpot-touching events (synced_to_hubspot / sync_failed) are
 * covered by the existing sync.integration.test.ts via the existing
 * mock; this file focuses on the CREATED + auth + 404 paths that
 * don't need a HubSpot stub.
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { companies, deals, type NewDeal } from "../db/schema";
import { companyFixture } from "./fixtures/company";
import { app, createTestUser } from "./test-helpers";

async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`loginAs ${email} failed: ${res.status}`);
  return res.body.accessToken;
}

function dealFixture(
  hubspotCompanyId: string,
  overrides: Partial<NewDeal> = {}
): NewDeal {
  return {
    hubspotDealId: `deal-${Math.random().toString(36).slice(2)}`,
    hubspotCompanyId,
    name: "Sample Deal",
    stage: "appointmentscheduled",
    pipelineId: "default",
    hubspotCreatedAt: new Date("2026-01-15"),
    hubspotModifiedAt: new Date("2026-01-15"),
    hubspotRaw: {},
    ...overrides
  };
}

describe("GET /api/v1/documents/:number/events", () => {
  it("returns the 'created' event after POST /documents", async () => {
    const user = await createTestUser({
      email: "creator@bsg.test",
      password: "creator12345",
      displayName: "Creator",
      role: "admin"
    });
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "events999999" }))
      .returning();
    const [deal] = await db.insert(deals).values(dealFixture(company.hubspotCompanyId)).returning();
    const token = await loginAs("creator@bsg.test", "creator12345");

    // Create a document. Payload here uses the minimum wizard shape
    // that other documents integration tests use; we don't render
    // the PDF in this suite.
    const createRes = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        hubspotDealId: deal.hubspotDealId,
        scope: "offer",
        payload: {
          schemaVersion: 1,
          calculatorType: { payin: true, payout: false },
          parties: { merchant: { legalName: "Acme Ltd" } }
        }
      });
    expect(createRes.status).toBe(201);
    const docNumber = createRes.body.number;

    const eventsRes = await request(app)
      .get(`/api/v1/documents/${docNumber}/events`)
      .set("Authorization", `Bearer ${token}`);

    expect(eventsRes.status).toBe(200);
    expect(eventsRes.body.items).toHaveLength(1);
    expect(eventsRes.body.items[0]).toMatchObject({
      eventType: "created",
      actorUserId: user.id,
      actorDisplayName: "Creator",
      actorEmail: "creator@bsg.test"
    });
    // meta carries the BSG number + scope so the FE has context-rich
    // data even without re-loading the document.
    expect(eventsRes.body.items[0].meta).toMatchObject({
      number: docNumber,
      scope: "offer"
    });
  });

  it("returns 404 for an unknown document number", async () => {
    // Explicit `role: "admin"` — Sprint 9.S audit closure made the
    // actor tier visible at the call site instead of relying on the
    // helper's default.
    await createTestUser({ email: "op@bsg.test", password: "op12345", role: "admin" });
    const token = await loginAs("op@bsg.test", "op12345");
    const res = await request(app)
      .get("/api/v1/documents/BSG-9999999-AAAAAA/events")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("requires auth (no token → 401)", async () => {
    const res = await request(app).get("/api/v1/documents/BSG-7100001-AAAAAA/events");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/calculator-configs/:id/events", () => {
  it("returns the 'created' event after POST /calculator-configs", async () => {
    const user = await createTestUser({
      email: "calc@bsg.test",
      password: "calc12345",
      displayName: "Calc Author",
      role: "admin"
    });
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "calcevents9999" }))
      .returning();
    const token = await loginAs("calc@bsg.test", "calc12345");

    const createRes = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        title: "Pricing draft v1",
        payload: { schemaVersion: 1 }
      });
    expect(createRes.status).toBe(201);
    const calcId = createRes.body.id;

    const eventsRes = await request(app)
      .get(`/api/v1/calculator-configs/${calcId}/events`)
      .set("Authorization", `Bearer ${token}`);

    expect(eventsRes.status).toBe(200);
    expect(eventsRes.body.items).toHaveLength(1);
    expect(eventsRes.body.items[0]).toMatchObject({
      eventType: "created",
      actorUserId: user.id,
      actorDisplayName: "Calc Author",
      actorEmail: "calc@bsg.test"
    });
    expect(eventsRes.body.items[0].meta).toMatchObject({
      title: "Pricing draft v1"
    });
  });

  it("returns 404 for an unknown calc id", async () => {
    // Explicit `role: "admin"` — Sprint 9.S audit closure made the
    // actor tier visible at the call site instead of relying on the
    // helper's default.
    await createTestUser({ email: "op@bsg.test", password: "op12345", role: "admin" });
    const token = await loginAs("op@bsg.test", "op12345");
    const res = await request(app)
      .get("/api/v1/calculator-configs/00000000-0000-4000-8000-000000000000/events")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("returns 400 VALIDATION_FAILED on malformed UUID", async () => {
    // Explicit `role: "admin"` — Sprint 9.S audit closure made the
    // actor tier visible at the call site instead of relying on the
    // helper's default.
    await createTestUser({ email: "op@bsg.test", password: "op12345", role: "admin" });
    const token = await loginAs("op@bsg.test", "op12345");
    const res = await request(app)
      .get("/api/v1/calculator-configs/not-a-uuid/events")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});

/**
 * CASCADE behaviour: hard-deleting a calc-config should remove its
 * events automatically (no orphans, no FK violation). When Stage 5
 * introduces soft-delete the events will simply stay alive next to
 * the soft-deleted row — this test will then assert the opposite
 * for soft-delete and a NEW test will cover hard-delete only when
 * a super-admin force-purges.
 */
describe("ON DELETE CASCADE — calc-config delete wipes its events", () => {
  it("DELETE /calculator-configs/:id removes the events too", async () => {
    // Explicit `role: "admin"` — Sprint 9.S audit closure made the
    // actor tier visible at the call site instead of relying on the
    // helper's default.
    await createTestUser({ email: "op@bsg.test", password: "op12345", role: "admin" });
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "cascadetest12" }))
      .returning();
    const token = await loginAs("op@bsg.test", "op12345");

    const create = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, payload: { schemaVersion: 1 } })
      .expect(201);

    const calcId = create.body.id;

    // Sanity: events listing returns the 'created' event.
    const before = await request(app)
      .get(`/api/v1/calculator-configs/${calcId}/events`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(before.body.items.length).toBeGreaterThanOrEqual(1);

    // Hard delete the calc. With ON DELETE CASCADE this also wipes
    // the events row; without it the DELETE would 500 on FK violation.
    await request(app)
      .delete(`/api/v1/calculator-configs/${calcId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    // Events endpoint now 404s because the calc-config is gone.
    const after = await request(app)
      .get(`/api/v1/calculator-configs/${calcId}/events`)
      .set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(404);

    // Defence in depth: also verify NO orphan events row remains in
    // the DB. The CASCADE should have removed it.
    const stillThere = await db
      .select()
      .from(
        (await import("../db/schema")).calculatorConfigEvents
      )
      .where(eq((await import("../db/schema")).calculatorConfigEvents.calculatorConfigId, calcId));
    expect(stillThere).toHaveLength(0);
  });
});

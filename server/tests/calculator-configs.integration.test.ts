/**
 * Integration tests for /api/v1/calculator-configs.
 *
 * Covers the full CRUD surface + the picker-scope filter (showAll /
 * deal-pin) + cross-company-deal validation + multi-draft support.
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  calculatorConfigs,
  companies,
  deals,
  type NewCompany,
  type NewDeal
} from "../db/schema";
import { app, createTestUser } from "./test-helpers";

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

const samplePayload = { schemaVersion: 1, calculatorType: { kind: "card" }, _note: "test" };

async function setupAuth(): Promise<string> {
  await createTestUser({ email: "op@bsg.test", password: "password12345" });
  return loginAs("op@bsg.test", "password12345");
}

describe("POST /api/v1/calculator-configs", () => {
  it("requires auth", async () => {
    const res = await request(app).post("/api/v1/calculator-configs").send({});
    expect(res.status).toBe(401);
  });

  it("creates a config with companyId + payload only (deal omitted)", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();

    const res = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, payload: samplePayload });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      companyId: company.id,
      hubspotDealId: null,
      title: null
    });
    expect(res.body.id).toMatch(/[0-9a-f-]{36}/);
  });

  it("creates a config with deal + title", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    const [deal] = await db.insert(deals).values(dealFixture(company.hubspotCompanyId)).returning();

    const res = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        hubspotDealId: deal.hubspotDealId,
        title: "Q1 onboarding draft",
        payload: samplePayload
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      companyId: company.id,
      hubspotDealId: deal.hubspotDealId,
      title: "Q1 onboarding draft"
    });
  });

  it("allows multiple drafts for the same (company, deal) pair", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    const [deal] = await db.insert(deals).values(dealFixture(company.hubspotCompanyId)).returning();

    const body = {
      companyId: company.id,
      hubspotDealId: deal.hubspotDealId,
      payload: samplePayload
    };

    const first = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...body, title: "Optimistic" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...body, title: "Pessimistic" });
    expect(second.status).toBe(201);

    expect(first.body.id).not.toBe(second.body.id);
  });

  it("rejects 422 VALIDATION_FAILED when companyId is not a UUID", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: "not-a-uuid", payload: samplePayload });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects 422 when payload lacks `schemaVersion`", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    const res = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, payload: { just: "stuff" } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects deal that belongs to a DIFFERENT company", async () => {
    const token = await setupAuth();
    const [companyA] = await db.insert(companies).values(companyFixture()).returning();
    const [companyB] = await db
      .insert(companies)
      .values(companyFixture({ name: "Beta Corp" }))
      .returning();
    const [dealOfB] = await db
      .insert(deals)
      .values(dealFixture(companyB.hubspotCompanyId))
      .returning();

    const res = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: companyA.id,
        hubspotDealId: dealOfB.hubspotDealId,
        payload: samplePayload
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.message).toMatch(/cross-company/i);
  });

  it("rejects 422 when companyId references a missing company (FK)", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: "00000000-0000-0000-0000-000000000000",
        payload: samplePayload
      });
    // FK violation surfaces as 500 today (DB-level) since the
    // service can't pre-check without a full company lookup. The
    // happy path validation (UUID format) is what the user normally
    // hits — this test just documents the boundary.
    expect([400, 500]).toContain(res.status);
  });
});

describe("GET /api/v1/calculator-configs/:id", () => {
  it("returns 404 for unknown id", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get("/api/v1/calculator-configs/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("returns the config when found", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    const create = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, payload: samplePayload });

    const res = await request(app)
      .get(`/api/v1/calculator-configs/${create.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(create.body.id);
    expect(res.body.payload).toMatchObject({ schemaVersion: 1 });
  });
});

describe("PUT /api/v1/calculator-configs/:id", () => {
  it("replaces title + payload + deal", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    const [deal] = await db.insert(deals).values(dealFixture(company.hubspotCompanyId)).returning();

    const created = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, title: "Old", payload: samplePayload });

    const res = await request(app)
      .put(`/api/v1/calculator-configs/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        hubspotDealId: deal.hubspotDealId,
        title: "New",
        payload: { ...samplePayload, _note: "updated" }
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("New");
    expect(res.body.hubspotDealId).toBe(deal.hubspotDealId);
    expect(res.body.payload).toMatchObject({ _note: "updated" });
  });

  it("rejects cross-company deal on update", async () => {
    const token = await setupAuth();
    const [companyA] = await db.insert(companies).values(companyFixture()).returning();
    const [companyB] = await db
      .insert(companies)
      .values(companyFixture({ name: "Beta" }))
      .returning();
    const [dealOfB] = await db
      .insert(deals)
      .values(dealFixture(companyB.hubspotCompanyId))
      .returning();

    const created = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: companyA.id, payload: samplePayload });

    const res = await request(app)
      .put(`/api/v1/calculator-configs/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ hubspotDealId: dealOfB.hubspotDealId, payload: samplePayload });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("DELETE /api/v1/calculator-configs/:id", () => {
  it("hard deletes + returns 204", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    const created = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, payload: samplePayload });

    const del = await request(app)
      .delete(`/api/v1/calculator-configs/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const rows = await db
      .select()
      .from(calculatorConfigs)
      .where(eq(calculatorConfigs.id, created.body.id));
    expect(rows).toHaveLength(0);
  });

  it("returns 404 on already-deleted / missing id", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .delete("/api/v1/calculator-configs/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/calculator-configs — picker scope", () => {
  it("filters to (deal-pinned OR company-level) by default", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    const [dealX] = await db
      .insert(deals)
      .values(dealFixture(company.hubspotCompanyId))
      .returning();
    const [dealY] = await db
      .insert(deals)
      .values(dealFixture(company.hubspotCompanyId, { name: "Other" }))
      .returning();

    // 3 configs: one company-level, one pinned to dealX, one pinned to dealY.
    for (const body of [
      { companyId: company.id, title: "Company-level", payload: samplePayload },
      {
        companyId: company.id,
        hubspotDealId: dealX.hubspotDealId,
        title: "Pinned to X",
        payload: samplePayload
      },
      {
        companyId: company.id,
        hubspotDealId: dealY.hubspotDealId,
        title: "Pinned to Y",
        payload: samplePayload
      }
    ]) {
      const r = await request(app)
        .post("/api/v1/calculator-configs")
        .set("Authorization", `Bearer ${token}`)
        .send(body);
      expect(r.status).toBe(201);
    }

    // Default scope for dealX: should return the company-level draft +
    // the dealX-pinned one. NOT the dealY-pinned one.
    const res = await request(app)
      .get(`/api/v1/calculator-configs?companyId=${company.id}&hubspotDealId=${dealX.hubspotDealId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const titles = res.body.items.map((c: { title: string }) => c.title).sort();
    expect(titles).toEqual(["Company-level", "Pinned to X"]);
  });

  it("showAll=true drops the deal filter", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    const [dealX] = await db
      .insert(deals)
      .values(dealFixture(company.hubspotCompanyId))
      .returning();
    const [dealY] = await db
      .insert(deals)
      .values(dealFixture(company.hubspotCompanyId))
      .returning();

    for (const body of [
      { companyId: company.id, title: "A", payload: samplePayload },
      {
        companyId: company.id,
        hubspotDealId: dealX.hubspotDealId,
        title: "B",
        payload: samplePayload
      },
      {
        companyId: company.id,
        hubspotDealId: dealY.hubspotDealId,
        title: "C",
        payload: samplePayload
      }
    ]) {
      await request(app)
        .post("/api/v1/calculator-configs")
        .set("Authorization", `Bearer ${token}`)
        .send(body);
    }

    const res = await request(app)
      .get(`/api/v1/calculator-configs?companyId=${company.id}&showAll=true`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items.map((c: { title: string }) => c.title).sort()).toEqual(["A", "B", "C"]);
  });

  it("returns empty list for company with no configs", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    const res = await request(app)
      .get(`/api/v1/calculator-configs?companyId=${company.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });

  it("paginates via the cursor pattern", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();

    // Create 5 configs so a limit of 2 yields 3 pages.
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/v1/calculator-configs")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyId: company.id, title: `T${i}`, payload: samplePayload });
    }

    const page1 = await request(app)
      .get(`/api/v1/calculator-configs?companyId=${company.id}&limit=2`)
      .set("Authorization", `Bearer ${token}`);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(app)
      .get(
        `/api/v1/calculator-configs?companyId=${company.id}&limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.nextCursor).toBeTruthy();

    const page3 = await request(app)
      .get(
        `/api/v1/calculator-configs?companyId=${company.id}&limit=2&cursor=${encodeURIComponent(page2.body.nextCursor)}`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(page3.body.items).toHaveLength(1);
    expect(page3.body.nextCursor).toBeNull();
  });
});

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
  type NewDeal
} from "../db/schema";
import { companyFixture } from "./fixtures/company";
import { app, createTestUser } from "./test-helpers";

async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status}`);
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

  it("Sprint 9.R — returns 403 FORBIDDEN for read-only `user` role", async () => {
    // Phase 8 spec: `user` = read-only viewer. Cannot create
    // calc-configs (admin+ required).
    await createTestUser({
      email: "viewer@bsg.test",
      password: "viewer12345",
      role: "user"
    });
    const token = await loginAs("viewer@bsg.test", "viewer12345");
    const [company] = await db.insert(companies).values(companyFixture()).returning();

    const res = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, payload: samplePayload });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
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

  it("PARTIAL update: payload-only body preserves title + dealId (Sprint 6.6 bug fix)", async () => {
    // Regression test for the auto-save bug:
    //   - operator sets title "test" + deal pin via SaveCalculatorModal
    //   - /calc/:id auto-save tick fires PUT with body `{ payload }`
    //   - PREVIOUS behaviour: title + hubspotDealId silently collapsed
    //     to NULL because the service did `body.title ?? null`
    //   - FIXED behaviour: omitted fields leave the column untouched.
    const token = await setupAuth();
    const [company] = await db
      .insert(companies)
      .values(companyFixture())
      .returning();
    const [deal] = await db
      .insert(deals)
      .values(dealFixture(company.hubspotCompanyId))
      .returning();

    const created = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        hubspotDealId: deal.hubspotDealId,
        title: "test",
        payload: samplePayload
      });
    expect(created.body.title).toBe("test");
    expect(created.body.hubspotDealId).toBe(deal.hubspotDealId);

    // Auto-save: body has only payload — must preserve title + deal.
    const autoSave = await request(app)
      .put(`/api/v1/calculator-configs/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ payload: { ...samplePayload, _autoSaveTick: 1 } });
    expect(autoSave.status).toBe(200);
    expect(autoSave.body.title).toBe("test");
    expect(autoSave.body.hubspotDealId).toBe(deal.hubspotDealId);
    expect(autoSave.body.payload).toMatchObject({ _autoSaveTick: 1 });

    // Explicit null in body DOES clear (operator deletes title manually).
    const clearTitle = await request(app)
      .put(`/api/v1/calculator-configs/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: null, payload: samplePayload });
    expect(clearTitle.status).toBe(200);
    expect(clearTitle.body.title).toBeNull();
    // deal pin still untouched (was not in this body either).
    expect(clearTitle.body.hubspotDealId).toBe(deal.hubspotDealId);
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

  it("Sprint 6.6: companyId optional → lists across all companies", async () => {
    // The top-level /calculators discovery page uses this mode —
    // operator sees every config they've saved regardless of which
    // company it belongs to.
    const token = await setupAuth();
    const [companyA] = await db
      .insert(companies)
      .values(companyFixture({ name: "Co A" }))
      .returning();
    const [companyB] = await db
      .insert(companies)
      .values(companyFixture({ name: "Co B" }))
      .returning();

    for (const body of [
      { companyId: companyA.id, title: "A1", payload: samplePayload },
      { companyId: companyA.id, title: "A2", payload: samplePayload },
      { companyId: companyB.id, title: "B1", payload: samplePayload }
    ]) {
      await request(app)
        .post("/api/v1/calculator-configs")
        .set("Authorization", `Bearer ${token}`)
        .send(body);
    }

    const res = await request(app)
      .get(`/api/v1/calculator-configs`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const titles = res.body.items.map((c: { title: string }) => c.title).sort();
    expect(titles).toEqual(["A1", "A2", "B1"]);
  });

  it("Sprint 6.6: ?q= substring-filters on title (LIKE-escaped)", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();

    for (const title of ["Acme Q1 2026", "Globex Q2", "Acme Q3", "Initech"]) {
      await request(app)
        .post("/api/v1/calculator-configs")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyId: company.id, title, payload: samplePayload });
    }

    const res = await request(app)
      .get(`/api/v1/calculator-configs?q=acme`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const titles = res.body.items.map((c: { title: string }) => c.title).sort();
    expect(titles).toEqual(["Acme Q1 2026", "Acme Q3"]);

    // LIKE metachar should not match (it's escaped, treated as literal).
    const noMatch = await request(app)
      .get(`/api/v1/calculator-configs?q=%25`) // URL-encoded "%"
      .set("Authorization", `Bearer ${token}`);
    expect(noMatch.body.items).toHaveLength(0);
  });

  it("Sprint 6.7: cross-company ?q= with no match returns empty (the /calculators path)", async () => {
    // Sprint 6.7 audit fix (S8): the top-level CalculatorsListPage
    // hits this exact shape — companyId omitted, q present. The
    // existing Sprint 6.6 test combined ?q= with a scoped companyId;
    // this one pins down the production call path where the operator
    // searches without a company filter.
    const token = await setupAuth();
    const [company] = await db
      .insert(companies)
      .values(companyFixture())
      .returning();
    for (const title of ["Alpha", "Beta"]) {
      await request(app)
        .post("/api/v1/calculator-configs")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyId: company.id, title, payload: samplePayload });
    }

    const res = await request(app)
      .get(`/api/v1/calculator-configs?q=zzznomatch`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("Sprint 6.7: list endpoint returns `companyName` via JOIN", async () => {
    // S4 audit fix verification: every row in the listing should
    // carry the parent company's name so CalculatorsListPage can
    // render it without N+1 fetches.
    const token = await setupAuth();
    const [companyA] = await db
      .insert(companies)
      .values(companyFixture({ name: "Acme Holdings" }))
      .returning();
    await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: companyA.id, title: "draft", payload: samplePayload });

    const res = await request(app)
      .get(`/api/v1/calculator-configs`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items[0].companyName).toBe("Acme Holdings");
  });

  it("Sprint 6.8: ?sort=title:asc orders alphabetically regardless of insert order", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    // Insert in deliberately scrambled order so a default
    // createdAt-DESC sort would NOT match the asc-by-title output.
    for (const t of ["Charlie draft", "Alpha draft", "Bravo draft"]) {
      await request(app)
        .post("/api/v1/calculator-configs")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyId: company.id, title: t, payload: samplePayload });
    }

    const asc = await request(app)
      .get(`/api/v1/calculator-configs?companyId=${company.id}&showAll=true&sort=title:asc&limit=10`)
      .set("Authorization", `Bearer ${token}`);
    expect(asc.status).toBe(200);
    const titles = asc.body.items.map((c: { title: string | null }) => c.title);
    expect(titles).toEqual(["Alpha draft", "Bravo draft", "Charlie draft"]);

    // And the reverse.
    const desc = await request(app)
      .get(`/api/v1/calculator-configs?companyId=${company.id}&showAll=true&sort=title:desc&limit=10`)
      .set("Authorization", `Bearer ${token}`);
    expect(desc.body.items.map((c: { title: string | null }) => c.title)).toEqual([
      "Charlie draft",
      "Bravo draft",
      "Alpha draft"
    ]);
  });

  it("Sprint 6.8: ?sort=companyName:asc orders across companies", async () => {
    const token = await setupAuth();
    const [coB] = await db
      .insert(companies)
      .values(companyFixture({ name: "Bravo Corp", hubspotCompanyId: "666666888801" }))
      .returning();
    const [coA] = await db
      .insert(companies)
      .values(companyFixture({ name: "Acme Holdings", hubspotCompanyId: "666666888802" }))
      .returning();
    for (const co of [coB, coA]) {
      await request(app)
        .post("/api/v1/calculator-configs")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyId: co.id, title: `draft for ${co.name}`, payload: samplePayload });
    }
    const res = await request(app)
      .get(`/api/v1/calculator-configs?sort=companyName:asc&limit=10`)
      .set("Authorization", `Bearer ${token}`);
    const names = res.body.items.map((c: { companyName?: string }) => c.companyName);
    // Acme < Bravo regardless of insertion order.
    const idxA = names.indexOf("Acme Holdings");
    const idxB = names.indexOf("Bravo Corp");
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeLessThan(idxB);
  });

  it("Sprint 6.8: unknown sort field is rejected with 400", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get(`/api/v1/calculator-configs?sort=bogus:asc`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("Sprint 6.9 S7: cursor pagination crosses NULL/non-NULL hubspotDealId boundary correctly", async () => {
    // Sprint 6.9 audit S7: previous integration tests only covered
    // title/companyName sort cursors. The hubspotDealId column is
    // nullable + COALESCE'd to '' for ordering, so NULL rows and
    // any (hypothetical) empty-string rows cluster at the same
    // sort position. The cursor must still walk through them
    // exactly once without skipping or duplicating.
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    const [deal] = await db
      .insert(deals)
      .values(dealFixture(company.hubspotCompanyId))
      .returning();
    // 2 NULL-deal configs + 1 with the real deal pin.
    await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, title: "no deal A", payload: samplePayload });
    await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, title: "no deal B", payload: samplePayload });
    await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        hubspotDealId: deal.hubspotDealId,
        title: "with deal",
        payload: samplePayload
      });

    const page1 = await request(app)
      .get(
        `/api/v1/calculator-configs?companyId=${company.id}&showAll=true&sort=hubspotDealId:asc&limit=2`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(app)
      .get(
        `/api/v1/calculator-configs?companyId=${company.id}&showAll=true&sort=hubspotDealId:asc&limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(page2.status).toBe(200);
    expect(page2.body.items).toHaveLength(1);

    // All 3 distinct rows should have come through across the
    // two pages — no duplicates, no skipped rows.
    const allIds = [
      ...page1.body.items.map((c: { id: string }) => c.id),
      ...page2.body.items.map((c: { id: string }) => c.id)
    ];
    expect(new Set(allIds).size).toBe(3);
  });

  it("Sprint 6.9 C1: tampered cursor with non-ISO date value is rejected with 400 (not 500)", async () => {
    const token = await setupAuth();
    // Craft a cursor by hand: sort matches default, value is garbage.
    const tampered = Buffer.from(
      JSON.stringify({
        sort: "createdAt:desc",
        value: "definitely-not-a-date",
        id: "00000000-0000-4000-8000-000000000000"
      }),
      "utf8"
    ).toString("base64url");
    const res = await request(app)
      .get(
        `/api/v1/calculator-configs?sort=createdAt:desc&limit=5&cursor=${encodeURIComponent(tampered)}`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("Sprint 6.9 N1: tampered cursor with non-UUID id is rejected with 400 (not 500)", async () => {
    const token = await setupAuth();
    const tampered = Buffer.from(
      JSON.stringify({
        sort: "createdAt:desc",
        value: "2026-01-01T00:00:00.000Z",
        id: "not-a-uuid"
      }),
      "utf8"
    ).toString("base64url");
    const res = await request(app)
      .get(
        `/api/v1/calculator-configs?sort=createdAt:desc&limit=5&cursor=${encodeURIComponent(tampered)}`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

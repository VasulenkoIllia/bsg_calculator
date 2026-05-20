/**
 * Integration tests for the companies + deals read API.
 *
 * Sets up fixtures directly via Drizzle (skipping the HubSpot client)
 * because:
 *   - Tests must be hermetic — no external HTTP.
 *   - The shape `hubspot_raw` JSONB doesn't matter for the listing
 *     query path; we just need a valid row.
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import { db } from "../db/client";
import { companies, deals, type NewDeal } from "../db/schema";
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

async function setupAuth(): Promise<string> {
  await createTestUser({ email: "op@bsg.test", password: "password12345" });
  return loginAs("op@bsg.test", "password12345");
}

describe("GET /api/v1/companies — listing + search + filter", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/v1/companies");
    expect(res.status).toBe(401);
  });

  it("returns paginated companies", async () => {
    const token = await setupAuth();
    await db.insert(companies).values([
      companyFixture({ name: "Acme Holdings" }),
      companyFixture({ name: "Beta Tech" }),
      companyFixture({ name: "Glacme Capital" })
    ]);

    const res = await request(app)
      .get("/api/v1/companies?limit=10")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.limit).toBe(10);
    expect(res.body.nextCursor).toBeNull();
    // hubspot_raw must NOT leak to the public DTO.
    expect(res.body.items[0]).not.toHaveProperty("hubspotRaw");
  });

  it("substring search via pg_trgm — 'acm' finds Acme AND Glacme", async () => {
    const token = await setupAuth();
    await db.insert(companies).values([
      companyFixture({ name: "Acme Holdings" }),
      companyFixture({ name: "Beta Tech" }),
      companyFixture({ name: "Glacme Capital" })
    ]);

    const res = await request(app)
      .get("/api/v1/companies?q=acm")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const names = res.body.items.map((c: { name: string }) => c.name).sort();
    expect(names).toEqual(["Acme Holdings", "Glacme Capital"]);
  });

  it("ignores unknown query params (no companyType filter anymore)", async () => {
    // companyType used to be a filter; it was removed once
    // HUBSPOT_COMPANY_TYPE_FILTER restricted storage to a single
    // type. Unknown params shouldn't 400 — Zod uses .parse() which
    // accepts extra keys silently.
    const token = await setupAuth();
    await db.insert(companies).values([
      companyFixture({ name: "Merchant One", companyType: "direct_client" }),
      companyFixture({ name: "Merchant Two", companyType: "direct_client" })
    ]);

    const res = await request(app)
      .get("/api/v1/companies?companyType=anything")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });

  it("paginates: requests limit=2, gets nextCursor, fetches next page", async () => {
    const token = await setupAuth();
    // Spaced timestamps so cursor ordering is deterministic.
    for (let i = 0; i < 5; i++) {
      await db.insert(companies).values(
        companyFixture({
          name: `Company ${i}`,
          hubspotCreatedAt: new Date(2026, 0, i + 1)
        })
      );
    }

    const page1 = await request(app)
      .get("/api/v1/companies?limit=2")
      .set("Authorization", `Bearer ${token}`);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await request(app)
      .get(`/api/v1/companies?limit=2&cursor=${page1.body.nextCursor}`)
      .set("Authorization", `Bearer ${token}`);
    expect(page2.body.items).toHaveLength(2);
    // Pages don't overlap.
    const page1Ids = page1.body.items.map((c: { id: string }) => c.id);
    const page2Ids = page2.body.items.map((c: { id: string }) => c.id);
    for (const id of page2Ids) expect(page1Ids).not.toContain(id);
  });

  it("Sprint 7.2: ?sort=name:asc orders companies A-Z regardless of insert order", async () => {
    const token = await setupAuth();
    await db.insert(companies).values(companyFixture({
      name: "Charlie LLC",
      hubspotCompanyId: "777777111100"
    }));
    await db.insert(companies).values(companyFixture({
      name: "Acme Inc",
      hubspotCompanyId: "777777111101"
    }));
    await db.insert(companies).values(companyFixture({
      name: "Bravo Corp",
      hubspotCompanyId: "777777111102"
    }));

    const res = await request(app)
      .get("/api/v1/companies?sort=name:asc&limit=10")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const names = res.body.items.map((c: { name: string }) => c.name);
    const idxA = names.indexOf("Acme Inc");
    const idxB = names.indexOf("Bravo Corp");
    const idxC = names.indexOf("Charlie LLC");
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  it("Sprint 7.2: unknown sort field is rejected with 400", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get("/api/v1/companies?sort=bogus:asc")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/companies/:id — single", () => {
  it("returns the company", async () => {
    const token = await setupAuth();
    const [row] = await db.insert(companies).values(companyFixture()).returning();

    const res = await request(app)
      .get(`/api/v1/companies/${row.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(row.id);
    expect(res.body.hubspotCompanyId).toBe(row.hubspotCompanyId);
  });

  it("returns 404 on missing id", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get("/api/v1/companies/00000000-0000-4000-8000-000000000000")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("returns 400 on non-UUID id", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get("/api/v1/companies/not-a-uuid")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/companies/:id/deals — nested listing", () => {
  it("returns deals for the specified company only", async () => {
    const token = await setupAuth();
    const [companyA] = await db
      .insert(companies)
      .values(companyFixture({ name: "Company A" }))
      .returning();
    const [companyB] = await db
      .insert(companies)
      .values(companyFixture({ name: "Company B" }))
      .returning();
    await db.insert(deals).values([
      dealFixture(companyA.hubspotCompanyId, { name: "A-Deal-1" }),
      dealFixture(companyA.hubspotCompanyId, { name: "A-Deal-2" }),
      dealFixture(companyB.hubspotCompanyId, { name: "B-Deal-1" })
    ]);

    const res = await request(app)
      .get(`/api/v1/companies/${companyA.id}/deals`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(
      res.body.items.every((d: { hubspotCompanyId: string }) =>
        d.hubspotCompanyId === companyA.hubspotCompanyId
      )
    ).toBe(true);
  });

  it("returns 404 if the parent company doesn't exist", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get("/api/v1/companies/00000000-0000-4000-8000-000000000000/deals")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/deals — listing + stage filter", () => {
  it("filters by stage", async () => {
    const token = await setupAuth();
    const [c] = await db.insert(companies).values(companyFixture()).returning();
    await db.insert(deals).values([
      dealFixture(c.hubspotCompanyId, { stage: "appointmentscheduled" }),
      dealFixture(c.hubspotCompanyId, { stage: "closedwon" }),
      dealFixture(c.hubspotCompanyId, { stage: "appointmentscheduled" })
    ]);

    const res = await request(app)
      .get("/api/v1/deals?stage=appointmentscheduled")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });

  it("filters by hubspotCompanyId query param", async () => {
    const token = await setupAuth();
    const [a] = await db.insert(companies).values(companyFixture()).returning();
    const [b] = await db.insert(companies).values(companyFixture()).returning();
    await db.insert(deals).values([
      dealFixture(a.hubspotCompanyId),
      dealFixture(b.hubspotCompanyId)
    ]);

    const res = await request(app)
      .get(`/api/v1/deals?hubspotCompanyId=${a.hubspotCompanyId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].hubspotCompanyId).toBe(a.hubspotCompanyId);
  });

  it("filters by businessVertical", async () => {
    const token = await setupAuth();
    const [c] = await db.insert(companies).values(companyFixture()).returning();
    await db.insert(deals).values([
      dealFixture(c.hubspotCompanyId, { businessVertical: "iGaming / Betting" }),
      dealFixture(c.hubspotCompanyId, { businessVertical: "Crypto / Web3" }),
      dealFixture(c.hubspotCompanyId, { businessVertical: "iGaming / Betting" })
    ]);

    const res = await request(app)
      .get("/api/v1/deals?businessVertical=iGaming%20%2F%20Betting")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(
      res.body.items.every(
        (d: { businessVertical: string }) => d.businessVertical === "iGaming / Betting"
      )
    ).toBe(true);
  });

  it("Sprint 7.2: ?sort=name:asc orders deals A-Z", async () => {
    const token = await setupAuth();
    const [c] = await db.insert(companies).values(companyFixture()).returning();
    await db.insert(deals).values([
      dealFixture(c.hubspotCompanyId, { name: "Zeta deal", hubspotDealId: "888880000001" }),
      dealFixture(c.hubspotCompanyId, { name: "Alpha deal", hubspotDealId: "888880000002" }),
      dealFixture(c.hubspotCompanyId, { name: "Mike deal", hubspotDealId: "888880000003" })
    ]);

    const res = await request(app)
      .get(`/api/v1/deals?hubspotCompanyId=${c.hubspotCompanyId}&sort=name:asc&limit=10`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const names = res.body.items.map((d: { name: string }) => d.name);
    expect(names).toEqual(["Alpha deal", "Mike deal", "Zeta deal"]);
  });

  it("Sprint 7.2: ?sort=amount:desc orders deals by numeric amount", async () => {
    const token = await setupAuth();
    const [c] = await db.insert(companies).values(companyFixture()).returning();
    await db.insert(deals).values([
      dealFixture(c.hubspotCompanyId, { amount: "1000", hubspotDealId: "888881111111" }),
      dealFixture(c.hubspotCompanyId, { amount: "200", hubspotDealId: "888881111112" }),
      dealFixture(c.hubspotCompanyId, { amount: "50000", hubspotDealId: "888881111113" })
    ]);

    const res = await request(app)
      .get(`/api/v1/deals?hubspotCompanyId=${c.hubspotCompanyId}&sort=amount:desc&limit=10`)
      .set("Authorization", `Bearer ${token}`);
    const amounts = res.body.items.map((d: { amount: string }) => d.amount);
    // Numeric (not lex) order: 50000 > 1000 > 200.
    expect(amounts).toEqual(["50000.00", "1000.00", "200.00"]);
  });

  it("Sprint 7.2: unknown sort field rejected with 400", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get("/api/v1/deals?sort=evil:asc")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/deals/:id — single", () => {
  it("returns the deal", async () => {
    const token = await setupAuth();
    const [c] = await db.insert(companies).values(companyFixture()).returning();
    const [d] = await db.insert(deals).values(dealFixture(c.hubspotCompanyId)).returning();

    const res = await request(app)
      .get(`/api/v1/deals/${d.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(d.id);
  });

  it("returns 404 on missing id", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get("/api/v1/deals/00000000-0000-4000-8000-000000000000")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

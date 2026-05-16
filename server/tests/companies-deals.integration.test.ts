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
import { companies, deals, type NewCompany, type NewDeal } from "../db/schema";
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

  it("filters by company_type", async () => {
    const token = await setupAuth();
    await db.insert(companies).values([
      companyFixture({ name: "Agent One", companyType: "referring_partner" }),
      companyFixture({ name: "Merchant One", companyType: "direct_client" }),
      companyFixture({ name: "Merchant Two", companyType: "direct_client" })
    ]);

    const res = await request(app)
      .get("/api/v1/companies?companyType=direct_client")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(
      res.body.items.every((c: { companyType: string }) => c.companyType === "direct_client")
    ).toBe(true);
  });

  it("returns 400 on invalid companyType enum", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get("/api/v1/companies?companyType=bogus")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
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

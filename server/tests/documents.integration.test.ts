/**
 * Integration tests for /api/v1/documents + numbering.
 *
 * Covers:
 *   - Atomic number allocation under concurrent POSTs (the critical
 *     invariant — two parallel saves MUST get distinct numbers).
 *   - Cross-company validation (deal + calc references).
 *   - GET by number / list with filters / cursor pagination.
 *   - use-as-template flow → new calculator_config.
 *   - Sync stub → 501.
 *   - Number peek doesn't advance the sequence.
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  calculatorConfigs,
  companies,
  deals,
  documents,
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

const samplePayload = {
  schemaVersion: 1,
  calculatorType: { payin: true, payout: false },
  parties: { merchant: { legalName: "Acme Ltd" } }
};

async function setupAuth(): Promise<string> {
  await createTestUser({ email: "doc@bsg.test", password: "password12345" });
  return loginAs("doc@bsg.test", "password12345");
}

describe("GET /api/v1/numbering/peek", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/v1/numbering/peek");
    expect(res.status).toBe(401);
  });

  it("returns the seed value (BSG-7100001) before any documents are saved", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get("/api/v1/numbering/peek")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ next: "BSG-7100001" });
  });

  it("two consecutive peeks return the same number (peek doesn't advance)", async () => {
    const token = await setupAuth();
    const peek1 = await request(app)
      .get("/api/v1/numbering/peek")
      .set("Authorization", `Bearer ${token}`);
    const peek2 = await request(app)
      .get("/api/v1/numbering/peek")
      .set("Authorization", `Bearer ${token}`);
    expect(peek1.body.next).toBe(peek2.body.next);
  });
});

describe("POST /api/v1/documents", () => {
  it("requires auth", async () => {
    const res = await request(app).post("/api/v1/documents").send({});
    expect(res.status).toBe(401);
  });

  it("allocates the next BSG-XXXXX number and persists the doc", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();

    const res = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        scope: "offer",
        payload: samplePayload
      });

    expect(res.status).toBe(201);
    expect(res.body.number).toBe("BSG-7100001");
    expect(res.body.companyId).toBe(company.id);
    expect(res.body.scope).toBe("offer");
    expect(res.body.hubspotSyncState).toBe("not_synced");
    expect(res.body.hubspotNoteId).toBeNull();
    expect(res.body.addendum).toBeNull();
    expect(res.body.calculatorConfigId).toBeNull();
  });

  it("persists the addendum text + scope=offer_and_agreement", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();

    const res = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        scope: "offer_and_agreement",
        payload: samplePayload,
        addendum: "Special terms applicable only to this offer"
      });

    expect(res.status).toBe(201);
    expect(res.body.scope).toBe("offer_and_agreement");
    expect(res.body.addendum).toBe("Special terms applicable only to this offer");
  });

  it("allocates SEQUENTIAL numbers across 3 consecutive saves", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();

    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/api/v1/documents")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyId: company.id, scope: "offer", payload: samplePayload });
      numbers.push(res.body.number);
    }
    expect(numbers).toEqual(["BSG-7100001", "BSG-7100002", "BSG-7100003"]);
  });

  it("allocates DISTINCT numbers under concurrent saves (atomicity invariant)", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();

    // Fire 5 POSTs in parallel. Without the row-lock in the
    // numbering service, two of them would receive the same number
    // and one INSERT would fail with UNIQUE violation.
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post("/api/v1/documents")
          .set("Authorization", `Bearer ${token}`)
          .send({ companyId: company.id, scope: "offer", payload: samplePayload })
      )
    );
    expect(results.every(r => r.status === 201)).toBe(true);
    const numbers = results.map(r => r.body.number);
    const unique = new Set(numbers);
    expect(unique.size).toBe(5);
  });

  it("rejects cross-company deal references (422 VALIDATION_FAILED)", async () => {
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

    const res = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: companyA.id,
        hubspotDealId: dealOfB.hubspotDealId,
        scope: "offer",
        payload: samplePayload
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.message).toMatch(/cross-company/i);
  });

  it("rejects calc-config from a different company", async () => {
    const token = await setupAuth();
    const [companyA] = await db.insert(companies).values(companyFixture()).returning();
    const [companyB] = await db
      .insert(companies)
      .values(companyFixture({ name: "Beta" }))
      .returning();

    // Create a calc for companyB, then try to attach it to a doc for companyA.
    const calcRes = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: companyB.id, payload: samplePayload });
    expect(calcRes.status).toBe(201);

    const docRes = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: companyA.id,
        calculatorConfigId: calcRes.body.id,
        scope: "offer",
        payload: samplePayload
      });

    expect(docRes.status).toBe(400);
    expect(docRes.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects invalid scope value (Zod CHECK constraint backing)", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    const res = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "nonsense", payload: samplePayload });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("GET /api/v1/documents/:number", () => {
  it("returns 404 for an unknown number", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get("/api/v1/documents/BSG-9999999")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("returns the doc + full payload on hit", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    const create = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "offer", payload: samplePayload });

    const res = await request(app)
      .get(`/api/v1/documents/${create.body.number}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.number).toBe(create.body.number);
    expect(res.body.payload).toMatchObject({ schemaVersion: 1 });
  });
});

describe("GET /api/v1/documents — list + filters", () => {
  it("filters by companyId + scope, paginates by cursor", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();

    // 3 offers + 2 agreements.
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/v1/documents")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyId: company.id, scope: "offer", payload: samplePayload });
    }
    for (let i = 0; i < 2; i++) {
      await request(app)
        .post("/api/v1/documents")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyId: company.id, scope: "agreement", payload: samplePayload });
    }

    const offers = await request(app)
      .get(`/api/v1/documents?companyId=${company.id}&scope=offer`)
      .set("Authorization", `Bearer ${token}`);
    expect(offers.body.items).toHaveLength(3);
    expect(offers.body.items.every((d: { scope: string }) => d.scope === "offer")).toBe(true);

    const limited = await request(app)
      .get(`/api/v1/documents?companyId=${company.id}&limit=2`)
      .set("Authorization", `Bearer ${token}`);
    expect(limited.body.items).toHaveLength(2);
    expect(limited.body.nextCursor).toBeTruthy();
  });

  it("substring-search on number via ?q", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "offer", payload: samplePayload });

    const res = await request(app)
      .get("/api/v1/documents?q=7100001")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].number).toBe("BSG-7100001");
  });
});

describe("POST /api/v1/documents/:number/use-as-template", () => {
  it("creates a new calculator_config with the doc's payload", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    const [deal] = await db.insert(deals).values(dealFixture(company.hubspotCompanyId)).returning();

    const docRes = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        hubspotDealId: deal.hubspotDealId,
        scope: "offer",
        payload: samplePayload
      });
    expect(docRes.status).toBe(201);

    const tplRes = await request(app)
      .post(`/api/v1/documents/${docRes.body.number}/use-as-template`)
      .set("Authorization", `Bearer ${token}`);

    expect(tplRes.status).toBe(201);
    expect(tplRes.body.configId).toMatch(/[0-9a-f-]{36}/);
    expect(tplRes.body.redirectUrl).toBe(`/calc/${tplRes.body.configId}`);

    // Verify the new config inherited company + deal.
    const newConfig = await db
      .select()
      .from(calculatorConfigs)
      .where(eq(calculatorConfigs.id, tplRes.body.configId));
    expect(newConfig).toHaveLength(1);
    expect(newConfig[0].companyId).toBe(company.id);
    expect(newConfig[0].hubspotDealId).toBe(deal.hubspotDealId);
    expect(newConfig[0].title).toBe(`Template of ${docRes.body.number}`);
  });

  it("returns 404 on missing source doc", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .post("/api/v1/documents/BSG-9999999/use-as-template")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/documents/:number/sync — Phase 9 stub", () => {
  it("returns 501 NOT_IMPLEMENTED", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .post("/api/v1/documents/BSG-7100001/sync")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe("NOT_IMPLEMENTED");
  });
});

describe("number allocation — TX rollback returns the number", () => {
  it("a failed INSERT rolls back the number, next save reuses it", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();

    // First save grabs BSG-7100001.
    const first = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "offer", payload: samplePayload });
    expect(first.body.number).toBe("BSG-7100001");

    // A save with a bad calc reference triggers TX rollback BEFORE
    // the document INSERT — the number should NOT be consumed.
    const failed = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        calculatorConfigId: "00000000-0000-0000-0000-000000000000",
        scope: "offer",
        payload: samplePayload
      });
    expect(failed.status).toBe(400);

    // Next legitimate save should get BSG-7100002 (not 7100003).
    const second = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "offer", payload: samplePayload });
    expect(second.body.number).toBe("BSG-7100002");

    // Sanity: only 2 documents in the DB.
    const rows = await db.select().from(documents);
    expect(rows).toHaveLength(2);
  });
});

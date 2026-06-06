/**
 * Integration tests for /api/v1/documents + numbering.
 *
 * Covers:
 *   - Atomic number allocation under concurrent POSTs (the critical
 *     invariant — two parallel saves MUST get distinct numbers).
 *   - Cross-company validation (deal + calc references).
 *   - GET by number / list with filters / cursor pagination.
 *   - use-as-template flow → new calculator_config.
 *   - Number peek doesn't advance the sequence.
 *
 * Sprint 9.M N7 — the original "Sync stub → 501" coverage point was
 * retired in Sprint 9.L (Phase 9.A wired the endpoint to a real
 * service). The realistic sync coverage lives in
 * `server/tests/documents-delete.integration.test.ts` (delete + sync
 * after delete → 404) and the wider Phase 9 integration suite.
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

  it("returns BSG-7100001-XXXXXX placeholder before any documents are saved", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get("/api/v1/numbering/peek")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ next: "BSG-7100001-XXXXXX" });
  });

  it("includes the company suffix when hubspotCompanyId query is provided", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get("/api/v1/numbering/peek?hubspotCompanyId=426487875793")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.next).toBe("BSG-7100001-875793");
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

  it("Sprint 9.R — returns 403 FORBIDDEN for read-only `user` role", async () => {
    // user is now the read-only viewer tier (Phase 8 spec). POST
    // /documents is admin+. This regression test pins the gate.
    await createTestUser({
      email: "viewer@bsg.test",
      password: "viewer12345",
      role: "user"
    });
    const token = await loginAs("viewer@bsg.test", "viewer12345");
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "9999ROUSER001" }))
      .returning();

    const res = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "offer", payload: samplePayload });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("allocates the next BSG-<seq>-<suffix> number and persists the doc", async () => {
    const token = await setupAuth();
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "111122223333" }))
      .returning();

    const res = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        scope: "offer",
        payload: samplePayload
      });

    expect(res.status).toBe(201);
    // Suffix = last 6 chars of hubspotCompanyId.
    expect(res.body.number).toBe("BSG-7100001-223333");
    expect(res.body.companyId).toBe(company.id);
    expect(res.body.scope).toBe("offer");
    expect(res.body.hubspotSyncState).toBe("not_synced");
    expect(res.body.hubspotNoteId).toBeNull();
    expect(res.body.addendum).toBeNull();
    expect(res.body.calculatorConfigId).toBeNull();
  });

  it("stamps the allocated number + authoritative scope into the saved payload (overrides template/divergent values)", async () => {
    const token = await setupAuth();
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "111122223333" }))
      .returning();

    // Simulates "Use as Template" / a non-wizard client: the payload carries a
    // STALE number AND a documentScope that DIVERGES from the request scope.
    const res = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        scope: "offer_and_agreement",
        payload: {
          ...samplePayload,
          documentScope: "offer",
          header: { documentNumber: "BSG-7100015-999999", documentDateIso: "2026-01-01" }
        }
      });

    expect(res.status).toBe(201);
    expect(res.body.number).toBe("BSG-7100001-223333");
    // The PDF renders from the payload, so the authoritative row values MUST be
    // stamped into it — number AND scope — or row/payload/PDF/Note disagree.
    expect(res.body.payload.header.documentNumber).toBe(res.body.number);
    expect(res.body.payload.documentScope).toBe("offerAndAgreement");
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
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "999999000000" }))
      .returning();

    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/api/v1/documents")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyId: company.id, scope: "offer", payload: samplePayload });
      numbers.push(res.body.number);
    }
    expect(numbers).toEqual([
      "BSG-7100001-000000",
      "BSG-7100002-000000",
      "BSG-7100003-000000"
    ]);
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

    // Actually follow the cursor — earlier the test stopped at
    // "nextCursor is truthy" which would mask a cursor-encoding bug.
    // Walk page 2 + page 3 and verify all 5 documents come through.
    const seen = new Set<string>(
      limited.body.items.map((d: { id: string }) => d.id)
    );
    const page2 = await request(app)
      .get(
        `/api/v1/documents?companyId=${company.id}&limit=2&cursor=${encodeURIComponent(limited.body.nextCursor)}`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(page2.body.items).toHaveLength(2);
    page2.body.items.forEach((d: { id: string }) => seen.add(d.id));
    expect(seen.size).toBe(4);

    const page3 = await request(app)
      .get(
        `/api/v1/documents?companyId=${company.id}&limit=2&cursor=${encodeURIComponent(page2.body.nextCursor)}`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(page3.body.items).toHaveLength(1);
    page3.body.items.forEach((d: { id: string }) => seen.add(d.id));
    expect(seen.size).toBe(5);
    expect(page3.body.nextCursor).toBeNull();
  });

  it("escapes LIKE metacharacters in the q search parameter", async () => {
    const token = await setupAuth();
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "555555888888" }))
      .returning();
    // Save 2 documents so `q=%` would normally match both via wildcard.
    await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "offer", payload: samplePayload });
    await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "agreement", payload: samplePayload });

    // q = literal "%" should NOT match any document number (the
    // numbers contain no percent signs), proving the metachar
    // was escaped instead of being interpreted as wildcard.
    const res = await request(app)
      .get("/api/v1/documents?q=%25") // URL-encoded "%"
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("substring-search on number via ?q", async () => {
    const token = await setupAuth();
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "555555111111" }))
      .returning();
    await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "offer", payload: samplePayload });

    const res = await request(app)
      .get("/api/v1/documents?q=7100001")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].number).toBe("BSG-7100001-111111");
  });

  it("filters by calculatorConfigId (Sprint 6.4: docs-from-this-calc history)", async () => {
    // Sprint 6.F.3 audit-fill: the Sprint 6.4 ?calculatorConfigId=
    // filter is the core invariant powering the "Documents from
    // this calculator" section on /calc/:id. Without this test, a
    // typo in the repository WHERE clause or a missed wiring in the
    // controller would silently break the calc-page history view
    // with no failure signal.
    const token = await setupAuth();
    const [company] = await db
      .insert(companies)
      .values(companyFixture())
      .returning();

    // Create TWO calculator configs for the same company.
    const calcA = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, payload: { schemaVersion: 1, _calc: "A" } });
    const calcB = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, payload: { schemaVersion: 1, _calc: "B" } });

    // 2 documents from calcA, 1 from calcB, 1 with no calc link.
    for (let i = 0; i < 2; i++) {
      await request(app)
        .post("/api/v1/documents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          companyId: company.id,
          calculatorConfigId: calcA.body.id,
          scope: "offer",
          payload: samplePayload
        });
    }
    await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        calculatorConfigId: calcB.body.id,
        scope: "offer",
        payload: samplePayload
      });
    await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "offer", payload: samplePayload });

    // Filter by calcA — exactly 2 documents.
    const fromA = await request(app)
      .get(`/api/v1/documents?calculatorConfigId=${calcA.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(fromA.status).toBe(200);
    expect(fromA.body.items).toHaveLength(2);
    expect(
      fromA.body.items.every(
        (d: { calculatorConfigId: string }) => d.calculatorConfigId === calcA.body.id
      )
    ).toBe(true);

    // Filter by calcB — exactly 1 document.
    const fromB = await request(app)
      .get(`/api/v1/documents?calculatorConfigId=${calcB.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(fromB.body.items).toHaveLength(1);
    expect(fromB.body.items[0].calculatorConfigId).toBe(calcB.body.id);

    // Filter by a non-existent UUID — empty page, NOT an error.
    const fromNone = await request(app)
      .get("/api/v1/documents?calculatorConfigId=00000000-0000-4000-8000-000000000000")
      .set("Authorization", `Bearer ${token}`);
    expect(fromNone.status).toBe(200);
    expect(fromNone.body.items).toHaveLength(0);
  });

  it("rejects a non-UUID calculatorConfigId with 400", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get("/api/v1/documents?calculatorConfigId=not-a-uuid")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("Sprint 6.8: list returns companyName via JOIN", async () => {
    const token = await setupAuth();
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ name: "Sprint 6.8 Docs Co", hubspotCompanyId: "555555111100" }))
      .returning();
    await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "offer", payload: samplePayload });

    const res = await request(app)
      .get(`/api/v1/documents?companyId=${company.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].companyName).toBe("Sprint 6.8 Docs Co");
  });

  it("Sprint 6.8: ?sort=companyName:asc orders rows A-Z regardless of insert order", async () => {
    const token = await setupAuth();
    // Insert THREE companies whose names sort A→C in alphabetical
    // order; the insert order below is deliberately scrambled so a
    // naive "ORDER BY createdAt DESC" default would NOT match the
    // expected A→B→C output.
    const [companyC] = await db
      .insert(companies)
      .values(companyFixture({ name: "Charlie LLC", hubspotCompanyId: "555555222200" }))
      .returning();
    const [companyA] = await db
      .insert(companies)
      .values(companyFixture({ name: "Acme Inc", hubspotCompanyId: "555555222201" }))
      .returning();
    const [companyB] = await db
      .insert(companies)
      .values(companyFixture({ name: "Bravo Corp", hubspotCompanyId: "555555222202" }))
      .returning();
    for (const co of [companyC, companyA, companyB]) {
      await request(app)
        .post("/api/v1/documents")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyId: co.id, scope: "offer", payload: samplePayload });
    }

    const asc = await request(app)
      .get("/api/v1/documents?sort=companyName:asc&limit=10")
      .set("Authorization", `Bearer ${token}`);
    expect(asc.status).toBe(200);
    const names = asc.body.items.map((d: { companyName?: string }) => d.companyName);
    // Sprint 6.8 ?sort=companyName:asc must put Acme first, Bravo
    // second, Charlie third — independent of insertion order.
    const idxAcme = names.indexOf("Acme Inc");
    const idxBravo = names.indexOf("Bravo Corp");
    const idxCharlie = names.indexOf("Charlie LLC");
    expect(idxAcme).toBeGreaterThanOrEqual(0);
    expect(idxAcme).toBeLessThan(idxBravo);
    expect(idxBravo).toBeLessThan(idxCharlie);

    // Flip to desc → order reverses.
    const desc = await request(app)
      .get("/api/v1/documents?sort=companyName:desc&limit=10")
      .set("Authorization", `Bearer ${token}`);
    const descNames = desc.body.items.map((d: { companyName?: string }) => d.companyName);
    const dIdxAcme = descNames.indexOf("Acme Inc");
    const dIdxCharlie = descNames.indexOf("Charlie LLC");
    expect(dIdxCharlie).toBeLessThan(dIdxAcme);
  });

  it("Sprint 6.8: rejects unknown sort field with 400", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .get("/api/v1/documents?sort=bogusField:asc")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("Sprint 6.9 S8: ?sort=hubspotSyncState:asc orders by enum string (failed → not_synced → synced)", async () => {
    const token = await setupAuth();
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "555555444400" }))
      .returning();
    // All new documents default to hubspotSyncState='not_synced'.
    // We don't have a wired sync flow yet (Phase 9), so we INSERT
    // direct UPDATE to test the sort path on an enum column.
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/v1/documents")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyId: company.id, scope: "offer", payload: samplePayload });
    }
    const all = await request(app)
      .get(`/api/v1/documents?companyId=${company.id}&sort=createdAt:asc`)
      .set("Authorization", `Bearer ${token}`);
    const ids: string[] = all.body.items.map((d: { id: string }) => d.id);
    // Force the 3 rows into distinct sync states.
    await db
      .update(documents)
      .set({ hubspotSyncState: "failed" })
      .where(eq(documents.id, ids[0]));
    await db
      .update(documents)
      .set({ hubspotSyncState: "synced" })
      .where(eq(documents.id, ids[2]));
    // ids[1] stays 'not_synced'.

    const sorted = await request(app)
      .get(
        `/api/v1/documents?companyId=${company.id}&sort=hubspotSyncState:asc&limit=10`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(sorted.status).toBe(200);
    const states = sorted.body.items.map((d: { hubspotSyncState: string }) =>
      d.hubspotSyncState
    );
    // LOWER() alphabetical: failed < not_synced < synced.
    expect(states).toEqual(["failed", "not_synced", "synced"]);
  });

  it("Sprint 6.9 C1: tampered cursor with non-ISO date value yields 400 (not 500)", async () => {
    const token = await setupAuth();
    const tampered = Buffer.from(
      JSON.stringify({
        sort: "createdAt:desc",
        value: "garbage-not-a-date",
        id: "00000000-0000-4000-8000-000000000000"
      }),
      "utf8"
    ).toString("base64url");
    const res = await request(app)
      .get(
        `/api/v1/documents?sort=createdAt:desc&limit=5&cursor=${encodeURIComponent(tampered)}`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("Sprint 6.8: cursor minted under one sort is rejected by another (mismatch 400)", async () => {
    const token = await setupAuth();
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "555555333300" }))
      .returning();
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/v1/documents")
        .set("Authorization", `Bearer ${token}`)
        .send({ companyId: company.id, scope: "offer", payload: samplePayload });
    }
    const page1 = await request(app)
      .get(`/api/v1/documents?companyId=${company.id}&sort=createdAt:desc&limit=2`)
      .set("Authorization", `Bearer ${token}`);
    expect(page1.body.nextCursor).toBeTruthy();
    // Now reuse that cursor with a DIFFERENT sort — must surface as 400.
    const mismatch = await request(app)
      .get(
        `/api/v1/documents?companyId=${company.id}&sort=companyName:asc&limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(mismatch.status).toBe(400);
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

  it("is idempotent — a second use-as-template on the same doc reuses the draft (no duplicate)", async () => {
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

    const first = await request(app)
      .post(`/api/v1/documents/${docRes.body.number}/use-as-template`)
      .set("Authorization", `Bearer ${token}`);
    const second = await request(app)
      .post(`/api/v1/documents/${docRes.body.number}/use-as-template`)
      .set("Authorization", `Bearer ${token}`);

    expect(first.body.configId).toBe(second.body.configId); // same draft reused
    const configs = await db
      .select()
      .from(calculatorConfigs)
      .where(eq(calculatorConfigs.title, `Template of ${docRes.body.number}`));
    expect(configs).toHaveLength(1); // no duplicate
  });

  it("makes a fresh draft once the existing one has been edited (payload diverged)", async () => {
    const token = await setupAuth();
    const [company] = await db.insert(companies).values(companyFixture()).returning();
    const docRes = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "offer", payload: samplePayload });
    expect(docRes.status).toBe(201);

    const first = await request(app)
      .post(`/api/v1/documents/${docRes.body.number}/use-as-template`)
      .set("Authorization", `Bearer ${token}`);
    // Operator edits the draft → its payload diverges from the document.
    await db
      .update(calculatorConfigs)
      .set({ payload: { ...samplePayload, _edited: true } })
      .where(eq(calculatorConfigs.id, first.body.configId));

    const second = await request(app)
      .post(`/api/v1/documents/${docRes.body.number}/use-as-template`)
      .set("Authorization", `Bearer ${token}`);

    expect(second.body.configId).not.toBe(first.body.configId); // fresh pristine copy
    const configs = await db
      .select()
      .from(calculatorConfigs)
      .where(eq(calculatorConfigs.title, `Template of ${docRes.body.number}`));
    expect(configs).toHaveLength(2);
  });

  it("returns 404 on missing source doc", async () => {
    const token = await setupAuth();
    const res = await request(app)
      .post("/api/v1/documents/BSG-9999999/use-as-template")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// Sprint 9.L cleanup — the "returns 501 NOT_IMPLEMENTED" placeholder
// test was retired because Phase 9.A wired the endpoint to a real
// sync.service and Phase 9.K renamed the policy from "create-only"
// to "PATCH-then-CREATE-on-404". The realistic auth/integration
// coverage now lives in:
//   - server/tests/calculator-configs.integration.test.ts (sync endpoint)
//   - server/shared/hubspot/note-builder.test.ts          (body shape)
//   - server/modules/hubspot/hubspot.client.test.ts       (HTTP layer)
//
// A non-admin caller would hit 403 (require-role guard) before ever
// reaching the controller, which is what the stale assertion was
// catching — kept here as a documentation breadcrumb in case a
// future audit wonders where the 501 went.

describe("number allocation — TX rollback returns the number", () => {
  it("pre-allocation validation doesn't consume the sequence value", async () => {
    // The failing request below trips the calc-ref check BEFORE
    // allocateNextNumber runs, so the counter never advances.
    // We document this case separately from the deeper "rollback
    // AFTER allocation" test below.
    const token = await setupAuth();
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "777777222222" }))
      .returning();

    const first = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "offer", payload: samplePayload });
    expect(first.body.number).toBe("BSG-7100001-222222");

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

    const second = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "offer", payload: samplePayload });
    expect(second.body.number).toBe("BSG-7100002-222222");

    const rows = await db.select().from(documents);
    expect(rows).toHaveLength(2);
  });

  it("an INSIDE-TX failure AFTER number allocation rolls back the counter", async () => {
    // This scenario is the one that ACTUALLY tests the
    // UPDATE document_number_sequence RETURNING / TX semantics:
    //   - companyId passes the Zod UUID check (well-formed)
    //   - the in-TX `SELECT hubspot_company_id FROM companies` fails
    //     to find the row → ValidationError thrown AFTER the sequence
    //     counter has been advanced.
    // If the TX rollback works, the next legitimate save reuses the
    // sequence value the failed attempt nominally allocated.
    const token = await setupAuth();
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "777777444444" }))
      .returning();

    // First successful save → BSG-7100001-444444 (advances counter from 7100001 → 7100002).
    const first = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "offer", payload: samplePayload });
    expect(first.body.number).toBe("BSG-7100001-444444");

    // Failed save: well-formed UUID that doesn't exist. createDocument
    // enters the TX, allocates BSG-7100002-?????? from the sequence,
    // then the company lookup returns no row → throws → TX rollback.
    const failed = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: "00000000-0000-0000-0000-999999999999",
        scope: "offer",
        payload: samplePayload
      });
    expect(failed.status).toBe(400);
    expect(failed.body.error.code).toBe("VALIDATION_FAILED");

    // Next successful save MUST get BSG-7100002-444444. If the rollback
    // was broken, this would jump to BSG-7100003-444444.
    const second = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: company.id, scope: "offer", payload: samplePayload });
    expect(second.body.number).toBe("BSG-7100002-444444");
  });
});

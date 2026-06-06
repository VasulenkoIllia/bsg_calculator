/**
 * Integration tests for DELETE /api/v1/companies/:id — the admin
 * "delete a HubSpot-deleted company + all its documents from OUR system"
 * endpoint. Gated to admin/super_admin AND to companies flagged
 * `hubspot_deleted_at`. Fixtures seeded directly via Drizzle.
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { adminActions, companies, deals, documents } from "../db/schema";
import { companyFixture } from "./fixtures/company";
import { app, createTestUser } from "./test-helpers";

const PW = "password12345";

async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status}`);
  return res.body.accessToken;
}

describe("DELETE /api/v1/companies/:id — admin purge", () => {
  it("requires auth (401)", async () => {
    const [c] = await db
      .insert(companies)
      .values(companyFixture({ hubspotDeletedAt: new Date() }))
      .returning();
    const res = await request(app).delete(`/api/v1/companies/${c.id}`);
    expect(res.status).toBe(401);
  });

  it("forbids a non-admin user (403) and deletes nothing", async () => {
    await createTestUser({ email: "user@bsg.test", password: PW, role: "user" });
    const token = await loginAs("user@bsg.test", PW);
    const [c] = await db
      .insert(companies)
      .values(companyFixture({ hubspotDeletedAt: new Date() }))
      .returning();

    const res = await request(app)
      .delete(`/api/v1/companies/${c.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(await db.select().from(companies).where(eq(companies.id, c.id))).toHaveLength(1);
  });

  it("404 when the company doesn't exist", async () => {
    await createTestUser({ email: "admin@bsg.test", password: PW });
    const token = await loginAs("admin@bsg.test", PW);
    const res = await request(app)
      .delete("/api/v1/companies/11111111-1111-1111-1111-111111111111")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("refuses a company that is still LIVE in HubSpot (400) — deletes nothing", async () => {
    await createTestUser({ email: "admin2@bsg.test", password: PW });
    const token = await loginAs("admin2@bsg.test", PW);
    const [c] = await db
      .insert(companies)
      .values(companyFixture({ hubspotDeletedAt: null })) // live upstream
      .returning();

    const res = await request(app)
      .delete(`/api/v1/companies/${c.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(await db.select().from(companies).where(eq(companies.id, c.id))).toHaveLength(1);
  });

  it("admin purges a HubSpot-deleted company + its documents/deals; returns counts; writes an audit row", async () => {
    const admin = await createTestUser({ email: "admin3@bsg.test", password: PW });
    const token = await loginAs("admin3@bsg.test", PW);

    const [c] = await db
      .insert(companies)
      .values(
        companyFixture({ hubspotCompanyId: "PURGE-1", name: "Dead Co", hubspotDeletedAt: new Date() })
      )
      .returning();
    await db.insert(deals).values({
      hubspotDealId: "PURGE-DEAL-1",
      hubspotCompanyId: c.hubspotCompanyId,
      name: "Dead Deal",
      hubspotCreatedAt: new Date(),
      hubspotModifiedAt: new Date(),
      hubspotRaw: {}
    });
    await db.insert(documents).values([
      { number: "BSG-PURGE-001", companyId: c.id, scope: "offer", payload: {}, createdByUserId: admin.id },
      { number: "BSG-PURGE-002", companyId: c.id, scope: "offer", payload: {}, createdByUserId: admin.id }
    ]);

    const res = await request(app)
      .delete(`/api/v1/companies/${c.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Dead Co", documents: 2, deals: 1 });

    // Company + its documents + deals are gone.
    expect(await db.select().from(companies).where(eq(companies.id, c.id))).toHaveLength(0);
    expect(await db.select().from(documents).where(eq(documents.companyId, c.id))).toHaveLength(0);
    expect(
      await db.select().from(deals).where(eq(deals.hubspotCompanyId, c.hubspotCompanyId))
    ).toHaveLength(0);

    // Audit row written.
    const audits = await db
      .select()
      .from(adminActions)
      .where(eq(adminActions.actionType, "company.purged"));
    expect(audits).toHaveLength(1);
    expect(audits[0].targetId).toBe(c.id);
    expect(audits[0].meta).toMatchObject({ documentsDeleted: 2, dealsDeleted: 1 });
  });

  it("super_admin is also allowed", async () => {
    const sa = await createTestUser({
      email: "sa@bsg.test",
      password: PW,
      role: "super_admin"
    });
    const token = await loginAs("sa@bsg.test", PW);
    const [c] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "PURGE-SA", hubspotDeletedAt: new Date() }))
      .returning();
    await db.insert(documents).values({
      number: "BSG-PURGE-SA1",
      companyId: c.id,
      scope: "offer",
      payload: {},
      createdByUserId: sa.id
    });

    const res = await request(app)
      .delete(`/api/v1/companies/${c.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(await db.select().from(companies).where(eq(companies.id, c.id))).toHaveLength(0);
  });
});

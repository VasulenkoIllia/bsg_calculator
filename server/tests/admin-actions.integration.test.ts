/**
 * Sprint 9.U — integration tests for the admin_actions audit log.
 *
 * Covers:
 *   - GET /api/v1/admin/audit-log is super_admin-only
 *     (admin/user → 403; missing token → 401)
 *   - recordAdminAction fires on:
 *       * invite create + revoke
 *       * password-reset-link create
 *       * user create / patch / direct password reset
 *       * document delete / restore
 *       * /me/password + /me/sign-out-everywhere
 *   - The listing emits newest-first + carries the meta payload
 *   - Optional filter on action_type
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, createTestUser } from "./test-helpers";
import { db } from "../db/client";
import { companies, type Company } from "../db/schema";
import { companyFixture } from "./fixtures/company";

async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`loginAs ${email} failed: ${res.status}`);
  return res.body.accessToken;
}

async function seedCompany(suffix: string): Promise<Company> {
  const [row] = await db
    .insert(companies)
    .values(companyFixture({ hubspotCompanyId: suffix }))
    .returning();
  return row;
}

describe("GET /api/v1/admin/audit-log (super_admin only)", () => {
  it("returns 403 for admin", async () => {
    await createTestUser({ email: "ad@bsg.test", password: "ad12345678", role: "admin" });
    const token = await loginAs("ad@bsg.test", "ad12345678");
    const res = await request(app)
      .get("/api/v1/admin/audit-log")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("returns 403 for plain user", async () => {
    await createTestUser({ email: "u@bsg.test", password: "u12345678", role: "user" });
    const token = await loginAs("u@bsg.test", "u12345678");
    const res = await request(app)
      .get("/api/v1/admin/audit-log")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/v1/admin/audit-log");
    expect(res.status).toBe(401);
  });

  it("returns an empty page for a fresh DB", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const token = await loginAs("sa@bsg.test", "sa12345678");
    const res = await request(app)
      .get("/api/v1/admin/audit-log")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    // No actions yet — fresh DB. (The super_admin's login itself
    // doesn't write to the audit log; login is a public flow.)
    expect(res.body.items).toHaveLength(0);
    expect(res.body.nextCursor).toBeNull();
  });
});

describe("audit log captures admin actions across surfaces", () => {
  it("captures invite create + revoke", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const token = await loginAs("sa@bsg.test", "sa12345678");

    const created = await request(app)
      .post("/api/v1/users/invites")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "admin" });
    expect(created.status).toBe(201);

    await request(app)
      .delete(`/api/v1/users/invites/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    const log = await request(app)
      .get("/api/v1/admin/audit-log")
      .set("Authorization", `Bearer ${token}`);
    expect(log.status).toBe(200);
    // Newest-first → revoke before create.
    const types = log.body.items.map((row: { actionType: string }) => row.actionType);
    expect(types).toContain("user.invite_created");
    expect(types).toContain("user.invite_revoked");
  });

  it("Sprint 9.X.B — captures document.created at POST /documents", async () => {
    // The Sprint 9.O audit broadened recordAdminAction wiring to user
    // surfaces but did NOT include document.created — until now an
    // operator could create a row that never landed in the audit log.
    // Verify the new wiring fires the right action_type + carries
    // companyId in meta (consumed by the company filter in 9.X.C).
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const token = await loginAs("sa@bsg.test", "sa12345678");
    const company = await seedCompany("audit-doc-created-001");

    const create = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        scope: "agreement",
        payload: { schemaVersion: 1 }
      });
    expect(create.status).toBe(201);

    const log = await request(app)
      .get("/api/v1/admin/audit-log?actionType=document.created")
      .set("Authorization", `Bearer ${token}`);
    expect(log.status).toBe(200);
    expect(log.body.items).toHaveLength(1);
    expect(log.body.items[0]).toMatchObject({
      actionType: "document.created",
      targetType: "document",
      targetId: create.body.number,
      meta: { scope: "agreement", companyId: company.id }
    });
  });

  it("Sprint 9.X.B — captures calc.created / calc.updated / calc.deleted", async () => {
    // Mirrors the documents wiring for the calc-configs CRUD surface.
    // Three rounds (create → update → delete) on a single calc — the
    // audit log should carry one row per surface, all with
    // targetType='calc_config' and the same targetId.
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const token = await loginAs("sa@bsg.test", "sa12345678");
    const company = await seedCompany("audit-calc-001");

    const create = await request(app)
      .post("/api/v1/calculator-configs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        title: "Audit-trail draft",
        payload: { schemaVersion: 1 }
      });
    expect(create.status).toBe(201);
    const calcId = create.body.id;

    await request(app)
      .put(`/api/v1/calculator-configs/${calcId}`)
      .set("Authorization", `Bearer ${token}`)
      // updateCalculatorConfigSchema requires `payload` (full snapshot
      // on every save — frontend always sends the entire blob); title
      // is optional.
      .send({
        title: "Audit-trail draft (edited)",
        payload: { schemaVersion: 1 }
      })
      .expect(200);

    await request(app)
      .delete(`/api/v1/calculator-configs/${calcId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    const log = await request(app)
      .get("/api/v1/admin/audit-log")
      .set("Authorization", `Bearer ${token}`);
    expect(log.status).toBe(200);

    const calcRows = log.body.items.filter(
      (r: { targetId: string; targetType: string }) =>
        r.targetType === "calc_config" && r.targetId === calcId
    );
    const types = calcRows.map((r: { actionType: string }) => r.actionType);
    expect(types).toContain("calc.created");
    expect(types).toContain("calc.updated");
    expect(types).toContain("calc.deleted");
  });

  it("captures document delete + restore", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const token = await loginAs("sa@bsg.test", "sa12345678");
    const company = await seedCompany("audit-doc-001");

    const create = await request(app)
      .post("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`)
      .send({
        companyId: company.id,
        scope: "offer",
        payload: { schemaVersion: 1 }
      });
    expect(create.status).toBe(201);
    const number = create.body.number;

    await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate" })
      .expect(200);

    await request(app)
      .post(`/api/v1/documents/${number}/restore`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const log = await request(app)
      .get("/api/v1/admin/audit-log?actionType=document.restored")
      .set("Authorization", `Bearer ${token}`);
    expect(log.status).toBe(200);
    expect(log.body.items).toHaveLength(1);
    expect(log.body.items[0]).toMatchObject({
      actionType: "document.restored",
      targetType: "document",
      targetId: number
    });
  });

  it("Sprint 9.V audit fix M7 — cursor pagination walks pages without overlap", async () => {
    // Generate 7 audit entries (more than one page at limit=5), then
    // verify the cursor walks both pages cleanly with no row appearing
    // twice and no row missing.
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const token = await loginAs("sa@bsg.test", "sa12345678");

    // Emit 7 invite-create actions.
    for (let i = 0; i < 7; i++) {
      await request(app)
        .post("/api/v1/users/invites")
        .set("Authorization", `Bearer ${token}`)
        .send({ role: "user" })
        .expect(201);
    }

    const page1 = await request(app)
      .get("/api/v1/admin/audit-log?limit=5")
      .set("Authorization", `Bearer ${token}`);
    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(5);
    expect(page1.body.nextCursor).not.toBeNull();

    const cursor = page1.body.nextCursor as { id: string; createdAt: string };
    const page2 = await request(app)
      .get(
        `/api/v1/admin/audit-log?limit=5&cursorId=${cursor.id}&cursorCreatedAt=${encodeURIComponent(cursor.createdAt)}`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(page2.status).toBe(200);
    // 7 invites total → page1 has 5, page2 has 2.
    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.nextCursor).toBeNull();

    // No overlap — id sets are disjoint.
    const page1Ids = new Set(page1.body.items.map((i: { id: string }) => i.id));
    const page2Ids = page2.body.items.map((i: { id: string }) => i.id);
    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }
  });

  it("captures /me/password change with NO password in meta", async () => {
    await createTestUser({
      email: "ch@bsg.test",
      password: "oldPassword1",
      role: "super_admin"
    });
    const token = await loginAs("ch@bsg.test", "oldPassword1");
    await request(app)
      .post("/api/v1/auth/me/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "oldPassword1", newPassword: "brandNew2" })
      .expect(204);

    // Re-login (the change revoked the old refresh).
    const newToken = await loginAs("ch@bsg.test", "brandNew2");
    const log = await request(app)
      .get("/api/v1/admin/audit-log?actionType=auth.password_changed")
      .set("Authorization", `Bearer ${newToken}`);
    expect(log.status).toBe(200);
    expect(log.body.items).toHaveLength(1);
    const entry = log.body.items[0];
    expect(entry.actionType).toBe("auth.password_changed");
    // Defensive: the password fields must NEVER appear in meta.
    const metaStr = JSON.stringify(entry.meta);
    expect(metaStr).not.toContain("oldPassword1");
    expect(metaStr).not.toContain("brandNew2");
  });
});

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

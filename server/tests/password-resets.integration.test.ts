/**
 * Sprint 9.O — integration tests for the reset-link flow.
 *
 * Mirrors the invite test layout. The flow:
 *   1. super_admin mints a link for a target user (POST /users/:id/password-reset-link)
 *   2. user opens the link → GET /auth/password-reset/:token (preview)
 *   3. user submits new password → POST /auth/password-reset/:token
 *      → bulk-revokes existing refresh tokens + auto-logs them in
 *
 * Key assertions:
 *   - Only super_admin can mint a link (admin/user gets 403)
 *   - 404 on any "not pending" reason (consistent with invite preview)
 *   - Old password stops working after consumption
 *   - New password works
 *   - Old refresh tokens are revoked (use them post-reset → 401)
 *   - Second consume attempt 404s (one-time only)
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, createTestUser, extractRefreshCookie } from "./test-helpers";

async function loginAs(
  email: string,
  password: string
): Promise<{ accessToken: string; refreshCookie: string }> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`loginAs ${email} failed: ${res.status}`);
  return {
    accessToken: res.body.accessToken,
    refreshCookie: extractRefreshCookie(res.headers["set-cookie"])
  };
}

function extractTokenFromLink(link: string): string {
  const url = new URL(link);
  const token = url.searchParams.get("token");
  if (!token) throw new Error(`No token in link ${link}`);
  return token;
}

describe("POST /api/v1/users/:id/password-reset-link (super_admin only)", () => {
  it("super_admin can mint a link", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const target = await createTestUser({
      email: "target@bsg.test",
      password: "oldPassword1",
      displayName: "Target"
    });
    const sa = await loginAs("sa@bsg.test", "sa12345678");

    const res = await request(app)
      .post(`/api/v1/users/${target.id}/password-reset-link`)
      .set("Authorization", `Bearer ${sa.accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body.link).toMatch(/^https?:\/\/.+\/reset-password\?token=.+/);
    expect(typeof res.body.expiresAt).toBe("string");
  });

  it("admin gets 403 (only super_admin can mint)", async () => {
    await createTestUser({ email: "ad@bsg.test", password: "ad12345678", role: "admin" });
    const target = await createTestUser({ email: "target@bsg.test", password: "oldPassword1" });
    const admin = await loginAs("ad@bsg.test", "ad12345678");

    const res = await request(app)
      .post(`/api/v1/users/${target.id}/password-reset-link`)
      .set("Authorization", `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown user id", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const sa = await loginAs("sa@bsg.test", "sa12345678");

    const res = await request(app)
      .post("/api/v1/users/00000000-0000-0000-0000-000000000000/password-reset-link")
      .set("Authorization", `Bearer ${sa.accessToken}`);

    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/auth/password-reset/:token (public preview)", () => {
  it("returns email + displayName + expiresAt for a pending link", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const target = await createTestUser({
      email: "target@bsg.test",
      password: "oldPassword1",
      displayName: "Target User"
    });
    const sa = await loginAs("sa@bsg.test", "sa12345678");

    const create = await request(app)
      .post(`/api/v1/users/${target.id}/password-reset-link`)
      .set("Authorization", `Bearer ${sa.accessToken}`);
    const rawToken = extractTokenFromLink(create.body.link);

    const preview = await request(app).get(`/api/v1/auth/password-reset/${rawToken}`);
    expect(preview.status).toBe(200);
    expect(preview.body.email).toBe("target@bsg.test");
    expect(preview.body.displayName).toBe("Target User");
  });

  it("returns 404 for an unknown token", async () => {
    const res = await request(app).get("/api/v1/auth/password-reset/fake-token");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/auth/password-reset/:token (public consume)", () => {
  it("sets the new password + revokes existing sessions + auto-logs in", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const target = await createTestUser({
      email: "target@bsg.test",
      password: "oldPassword1",
      displayName: "Target"
    });
    const sa = await loginAs("sa@bsg.test", "sa12345678");
    // Log the target in BEFORE the reset to verify their old session
    // gets revoked.
    const targetOldSession = await loginAs("target@bsg.test", "oldPassword1");

    const create = await request(app)
      .post(`/api/v1/users/${target.id}/password-reset-link`)
      .set("Authorization", `Bearer ${sa.accessToken}`);
    const rawToken = extractTokenFromLink(create.body.link);

    // Consume — should return a fresh pair.
    const consume = await request(app)
      .post(`/api/v1/auth/password-reset/${rawToken}`)
      .send({ newPassword: "newPassword123" });
    expect(consume.status).toBe(200);
    expect(consume.body.user.email).toBe("target@bsg.test");
    expect(typeof consume.body.accessToken).toBe("string");
    const newRefreshCookie = extractRefreshCookie(consume.headers["set-cookie"]);
    expect(newRefreshCookie.length).toBeGreaterThan(0);

    // Old password no longer works.
    const oldLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "target@bsg.test", password: "oldPassword1" });
    expect(oldLogin.status).toBe(401);

    // New password works.
    const newLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "target@bsg.test", password: "newPassword123" });
    expect(newLogin.status).toBe(200);

    // Pre-reset refresh cookie is now revoked — using it for /refresh
    // should fail.
    const refresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `bsg_refresh=${targetOldSession.refreshCookie}`);
    expect(refresh.status).toBe(401);
  });

  it("second consume returns 404 (one-time only)", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const target = await createTestUser({
      email: "target@bsg.test",
      password: "oldPassword1"
    });
    const sa = await loginAs("sa@bsg.test", "sa12345678");

    const create = await request(app)
      .post(`/api/v1/users/${target.id}/password-reset-link`)
      .set("Authorization", `Bearer ${sa.accessToken}`);
    const rawToken = extractTokenFromLink(create.body.link);

    await request(app)
      .post(`/api/v1/auth/password-reset/${rawToken}`)
      .send({ newPassword: "newPassword123" });

    const second = await request(app)
      .post(`/api/v1/auth/password-reset/${rawToken}`)
      .send({ newPassword: "anotherPass456" });
    expect(second.status).toBe(404);
  });

  it("rejects short passwords with 400", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const target = await createTestUser({ email: "target@bsg.test", password: "oldPassword1" });
    const sa = await loginAs("sa@bsg.test", "sa12345678");

    const create = await request(app)
      .post(`/api/v1/users/${target.id}/password-reset-link`)
      .set("Authorization", `Bearer ${sa.accessToken}`);
    const rawToken = extractTokenFromLink(create.body.link);

    const res = await request(app)
      .post(`/api/v1/auth/password-reset/${rawToken}`)
      .send({ newPassword: "short" });
    expect(res.status).toBe(400);
  });
});

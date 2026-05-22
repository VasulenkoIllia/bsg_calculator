/**
 * Sprint 9.O — integration tests for the invite-link flow.
 *
 * Covers:
 *   - super_admin can mint a link (and only super_admin can; admin/user 403)
 *   - GET /auth/invite/:token preview returns role + expiresAt for a
 *     valid token, 404 for unknown / accepted / revoked / expired
 *   - POST /auth/invite/:token/accept creates the user atomically,
 *     auto-logs in (refresh cookie + access token), 404 on second
 *     accept (the token was already used)
 *   - DELETE /users/invites/:id revokes a pending invite; the link
 *     stops working immediately
 *   - List endpoint returns pending + recent finished, with deleter
 *     attribution joined in (uses raw db.execute under the hood — this
 *     is the regression test for the "expiresAt is not a Date" bug
 *     that surfaced during smoke testing)
 *
 * The token leaves the server ONCE in the createInvite response (as
 * the `link` field's `?token=` query string). We extract it here for
 * the public endpoint calls — same pattern an invitee would follow
 * via their email/Telegram message.
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, createTestUser, extractRefreshCookie } from "./test-helpers";

async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`loginAs ${email} failed: ${res.status}`);
  return res.body.accessToken;
}

function extractTokenFromLink(link: string): string {
  const url = new URL(link);
  const token = url.searchParams.get("token");
  if (!token) throw new Error(`No token in link ${link}`);
  return token;
}

describe("POST /api/v1/users/invites (super_admin only)", () => {
  it("super_admin can mint a link", async () => {
    await createTestUser({
      email: "sa@bsg.test",
      password: "sa12345678",
      role: "super_admin"
    });
    const token = await loginAs("sa@bsg.test", "sa12345678");

    const res = await request(app)
      .post("/api/v1/users/invites")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "admin" });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("admin");
    expect(res.body.link).toMatch(/^https?:\/\/.+\/accept-invite\?token=.+/);
    expect(typeof res.body.expiresAt).toBe("string");
  });

  it("admin gets 403 (only super_admin can mint invites)", async () => {
    await createTestUser({ email: "ad@bsg.test", password: "ad12345678", role: "admin" });
    const token = await loginAs("ad@bsg.test", "ad12345678");

    const res = await request(app)
      .post("/api/v1/users/invites")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "user" });

    expect(res.status).toBe(403);
  });

  it("validates the role field", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const token = await loginAs("sa@bsg.test", "sa12345678");

    const res = await request(app)
      .post("/api/v1/users/invites")
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "godmode" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/auth/invite/:token (public preview)", () => {
  it("returns role + expiresAt for a pending invite", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const adminToken = await loginAs("sa@bsg.test", "sa12345678");

    const create = await request(app)
      .post("/api/v1/users/invites")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "user" });
    const rawToken = extractTokenFromLink(create.body.link);

    const preview = await request(app).get(`/api/v1/auth/invite/${rawToken}`);
    expect(preview.status).toBe(200);
    expect(preview.body.role).toBe("user");
    expect(typeof preview.body.expiresAt).toBe("string");
  });

  it("returns 404 for an unknown token (no info leak about token state)", async () => {
    const res = await request(app).get("/api/v1/auth/invite/totally-fake-token");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/auth/invite/:token/accept (public)", () => {
  it("creates the user + issues access+refresh tokens", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const adminToken = await loginAs("sa@bsg.test", "sa12345678");

    const create = await request(app)
      .post("/api/v1/users/invites")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "admin" });
    const rawToken = extractTokenFromLink(create.body.link);

    const accept = await request(app)
      .post(`/api/v1/auth/invite/${rawToken}/accept`)
      .send({
        email: "invited@bsg.test",
        displayName: "Invited Admin",
        password: "newPassword123"
      });

    // 201 Created — a new User resource was inserted, semantic match.
    // (Different from /auth/login which returns 200 because the user
    // already existed; here we're materialising one.)
    expect(accept.status).toBe(201);
    expect(accept.body.user.email).toBe("invited@bsg.test");
    expect(accept.body.user.role).toBe("admin");
    expect(accept.body.user.isActive).toBe(true);
    expect(typeof accept.body.accessToken).toBe("string");
    // The server should set the refresh cookie on the response.
    const refresh = extractRefreshCookie(accept.headers["set-cookie"]);
    expect(refresh.length).toBeGreaterThan(0);
  });

  it("second accept attempt returns 404 (token was already used)", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const adminToken = await loginAs("sa@bsg.test", "sa12345678");

    const create = await request(app)
      .post("/api/v1/users/invites")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "user" });
    const rawToken = extractTokenFromLink(create.body.link);

    // First accept — succeeds.
    await request(app)
      .post(`/api/v1/auth/invite/${rawToken}/accept`)
      .send({
        email: "first@bsg.test",
        displayName: "First",
        password: "pw12345678"
      });
    // Second accept — 404.
    const second = await request(app)
      .post(`/api/v1/auth/invite/${rawToken}/accept`)
      .send({
        email: "second@bsg.test",
        displayName: "Second",
        password: "pw12345678"
      });
    expect(second.status).toBe(404);
  });

  it("returns 409 on duplicate email", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    await createTestUser({ email: "taken@bsg.test", password: "anything", role: "user" });
    const adminToken = await loginAs("sa@bsg.test", "sa12345678");

    const create = await request(app)
      .post("/api/v1/users/invites")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "user" });
    const rawToken = extractTokenFromLink(create.body.link);

    const accept = await request(app)
      .post(`/api/v1/auth/invite/${rawToken}/accept`)
      .send({
        email: "taken@bsg.test",
        displayName: "Conflict",
        password: "pw12345678"
      });
    expect(accept.status).toBe(409);
    expect(accept.body.error.code).toBe("CONFLICT_USER_EXISTS");
  });
});

describe("DELETE /api/v1/users/invites/:id (super_admin revokes)", () => {
  it("revoke makes the token stop working", async () => {
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const adminToken = await loginAs("sa@bsg.test", "sa12345678");

    const create = await request(app)
      .post("/api/v1/users/invites")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "user" });
    const rawToken = extractTokenFromLink(create.body.link);

    const revoke = await request(app)
      .delete(`/api/v1/users/invites/${create.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(revoke.status).toBe(204);

    const preview = await request(app).get(`/api/v1/auth/invite/${rawToken}`);
    expect(preview.status).toBe(404);
  });
});

describe("GET /api/v1/users/invites (admin list)", () => {
  it("returns the JOINed row shape without timestamp-parsing errors", async () => {
    // This is the regression test for the smoke-test bug where the
    // raw db.execute path returned expiresAt as a string and the
    // service layer's `.toISOString()` blew up.
    await createTestUser({ email: "sa@bsg.test", password: "sa12345678", role: "super_admin" });
    const adminToken = await loginAs("sa@bsg.test", "sa12345678");

    await request(app)
      .post("/api/v1/users/invites")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "user" });

    const list = await request(app)
      .get("/api/v1/users/invites")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].status).toBe("pending");
    expect(typeof list.body.items[0].expiresAt).toBe("string");
    expect(list.body.items[0].createdByEmail).toBe("sa@bsg.test");
  });
});

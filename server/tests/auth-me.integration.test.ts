/**
 * Sprint 9.T — integration tests for the personal-cabinet endpoints.
 *
 * Covers:
 *   POST /api/v1/auth/me/password
 *     - happy path: old password stops working, new one works,
 *       all refresh tokens revoked.
 *     - 401 on wrong currentPassword (AUTH_INVALID_CREDENTIALS).
 *     - 400 on newPassword < 8 chars.
 *     - 401 without Bearer.
 *   POST /api/v1/auth/me/sign-out-everywhere
 *     - happy path: existing refresh tokens revoked + cookie cleared.
 *     - 401 without Bearer.
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

describe("POST /api/v1/auth/me/password", () => {
  it("changes the password + revokes all refresh tokens", async () => {
    await createTestUser({
      email: "ch@bsg.test",
      password: "oldPassword1",
      role: "admin"
    });
    const session = await loginAs("ch@bsg.test", "oldPassword1");

    const res = await request(app)
      .post("/api/v1/auth/me/password")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ currentPassword: "oldPassword1", newPassword: "brandNew2" });
    expect(res.status).toBe(204);

    // Old password no longer works.
    const oldLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "ch@bsg.test", password: "oldPassword1" });
    expect(oldLogin.status).toBe(401);

    // New password works.
    const newLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "ch@bsg.test", password: "brandNew2" });
    expect(newLogin.status).toBe(200);

    // Pre-change refresh cookie is now revoked (past the grace window
    // since revokeAll backdates revoked_at).
    const refresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `bsg_refresh=${session.refreshCookie}`);
    expect(refresh.status).toBe(401);
  });

  it("returns 401 AUTH_INVALID_CREDENTIALS on wrong currentPassword", async () => {
    await createTestUser({
      email: "ch@bsg.test",
      password: "oldPassword1",
      role: "admin"
    });
    const session = await loginAs("ch@bsg.test", "oldPassword1");

    const res = await request(app)
      .post("/api/v1/auth/me/password")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ currentPassword: "WRONG", newPassword: "brandNew2" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("returns 400 on newPassword shorter than 8 chars", async () => {
    await createTestUser({
      email: "ch@bsg.test",
      password: "oldPassword1",
      role: "admin"
    });
    const session = await loginAs("ch@bsg.test", "oldPassword1");

    const res = await request(app)
      .post("/api/v1/auth/me/password")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ currentPassword: "oldPassword1", newPassword: "short" });
    expect(res.status).toBe(400);
  });

  it("returns 401 without Bearer", async () => {
    const res = await request(app)
      .post("/api/v1/auth/me/password")
      .send({ currentPassword: "x", newPassword: "newPassword2" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/me/sign-out-everywhere", () => {
  it("revokes the current refresh + clears the cookie", async () => {
    await createTestUser({
      email: "sa@bsg.test",
      password: "password1",
      role: "admin"
    });
    const session = await loginAs("sa@bsg.test", "password1");

    const res = await request(app)
      .post("/api/v1/auth/me/sign-out-everywhere")
      .set("Authorization", `Bearer ${session.accessToken}`);
    expect(res.status).toBe(204);

    // Refresh attempt with the pre-action cookie is rejected.
    const refresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `bsg_refresh=${session.refreshCookie}`);
    expect(refresh.status).toBe(401);
  });

  it("returns 401 without Bearer", async () => {
    const res = await request(app).post("/api/v1/auth/me/sign-out-everywhere");
    expect(res.status).toBe(401);
  });
});

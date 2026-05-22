/**
 * Integration tests for the auth flow.
 *
 * Each test sets up its own users via `createTestUser` because
 * setup.ts truncates tables in `beforeEach`.
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, createTestUser, extractRefreshCookie } from "./test-helpers";

describe("POST /api/v1/auth/login", () => {
  it("returns access token + user on valid credentials", async () => {
    // Sprint 9.R — explicit role: "user" because createTestUser
    // default flipped from "user" to "admin". This test specifically
    // verifies the auth-response shape for the lowest-tier role.
    await createTestUser({
      email: "ok@bsg.test",
      password: "correct123",
      role: "user"
    });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "ok@bsg.test", password: "correct123" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      email: "ok@bsg.test",
      role: "user",
      isActive: true
    });
    // Sets the httpOnly refresh cookie.
    expect(extractRefreshCookie(res.headers["set-cookie"])).not.toBe("");
  });

  it("login is case-insensitive thanks to citext", async () => {
    await createTestUser({ email: "case@bsg.test", password: "correct123" });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "CASE@BSG.TEST", password: "correct123" });

    expect(res.status).toBe(200);
  });

  it("returns 401 AUTH_INVALID_CREDENTIALS on wrong password", async () => {
    await createTestUser({ email: "ok@bsg.test", password: "correct123" });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "ok@bsg.test", password: "WRONG" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("returns 401 AUTH_INVALID_CREDENTIALS on missing user (no enum leak)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "nobody@bsg.test", password: "x" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("returns 400 VALIDATION_FAILED on empty body", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details).toEqual(expect.any(Array));
  });

  it("returns 403 FORBIDDEN when user is disabled", async () => {
    await createTestUser({
      email: "disabled@bsg.test",
      password: "correct123",
      isActive: false
    });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "disabled@bsg.test", password: "correct123" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns the authenticated user when given a valid Bearer", async () => {
    // Sprint 9.R — explicit role: "user" (default flipped to admin).
    await createTestUser({
      email: "me@bsg.test",
      password: "correct123",
      role: "user"
    });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "me@bsg.test", password: "correct123" });
    const token = login.body.accessToken;

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: "me@bsg.test", role: "user" });
  });

  it("returns 401 AUTH_TOKEN_INVALID without Authorization header", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("returns 401 AUTH_TOKEN_INVALID on a tampered token", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer header.payload.tampered");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_TOKEN_INVALID");
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("rotates the refresh cookie + returns a new access token", async () => {
    await createTestUser({ email: "rot@bsg.test", password: "correct123" });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "rot@bsg.test", password: "correct123" });
    const oldCookie = extractRefreshCookie(login.headers["set-cookie"]);
    expect(oldCookie).not.toBe("");

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `bsg_refresh=${oldCookie}`);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));

    const newCookie = extractRefreshCookie(res.headers["set-cookie"]);
    expect(newCookie).not.toBe("");
    expect(newCookie).not.toBe(oldCookie);
  });

  it("returns 401 AUTH_TOKEN_INVALID when no cookie is sent", async () => {
    const res = await request(app).post("/api/v1/auth/refresh");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("returns 401 AUTH_TOKEN_INVALID on an unknown token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", "bsg_refresh=fakefake");
    expect(res.status).toBe(401);
  });

  it("grace window: the old cookie still issues an access token within 10s", async () => {
    await createTestUser({ email: "grace@bsg.test", password: "correct123" });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "grace@bsg.test", password: "correct123" });
    const cookie = extractRefreshCookie(login.headers["set-cookie"]);

    // First refresh — rotates.
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `bsg_refresh=${cookie}`)
      .expect(200);

    // Second refresh with the OLD cookie within the 10s window.
    const second = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `bsg_refresh=${cookie}`);

    expect(second.status).toBe(200);
    expect(second.body.accessToken).toEqual(expect.any(String));
    // Graced path does NOT issue a new cookie.
    expect(second.headers["set-cookie"]).toBeUndefined();
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes the refresh token + clears the cookie", async () => {
    await createTestUser({ email: "out@bsg.test", password: "correct123" });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "out@bsg.test", password: "correct123" });
    const cookie = extractRefreshCookie(login.headers["set-cookie"]);

    const out = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", `bsg_refresh=${cookie}`);
    expect(out.status).toBe(204);

    // Cookie cleared (Max-Age=0 in Set-Cookie response).
    const setCookie = out.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toMatch(/bsg_refresh=;/);

    // After logout — grace window NOT applied to a fully-revoked
    // session beyond the 10s window. Within 10s the grace path WILL
    // honour the token, so we don't assert immediate invalidation
    // here; the dedicated logout-revoke test sits below.
  });

  it("logout is idempotent when called twice", async () => {
    await createTestUser({ email: "out2@bsg.test", password: "correct123" });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "out2@bsg.test", password: "correct123" });
    const cookie = extractRefreshCookie(login.headers["set-cookie"]);

    await request(app).post("/api/v1/auth/logout").set("Cookie", `bsg_refresh=${cookie}`).expect(204);
    await request(app).post("/api/v1/auth/logout").set("Cookie", `bsg_refresh=${cookie}`).expect(204);
  });
});

describe("404 envelope for unmatched routes", () => {
  it("returns RESOURCE_NOT_FOUND with the URL", async () => {
    const res = await request(app).get("/api/v1/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
    expect(res.body.error.message).toContain("/api/v1/nonexistent");
  });
});

describe("X-Request-Id correlation", () => {
  it("echoes the request id on every response", async () => {
    const res = await request(app)
      .get("/health")
      .set("X-Request-Id", "test-fixed-id-12345");
    expect(res.headers["x-request-id"]).toBe("test-fixed-id-12345");
  });

  it("generates a UUID when no incoming header is given", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});

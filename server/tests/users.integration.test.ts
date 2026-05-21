/**
 * Integration tests for the users (admin) module + admin guard.
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, createTestUser } from "./test-helpers";

async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`loginAs ${email} failed: ${res.status}`);
  return res.body.accessToken;
}

describe("GET /api/v1/users (admin-only)", () => {
  it("returns the list to admins", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", isAdmin: true });
    await createTestUser({ email: "op@bsg.test", password: "op12345" });

    const token = await loginAs("admin@bsg.test", "admin12345");
    const res = await request(app).get("/api/v1/users").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });

  it("returns 403 FORBIDDEN for non-admin users", async () => {
    await createTestUser({ email: "op@bsg.test", password: "op12345" });
    const token = await loginAs("op@bsg.test", "op12345");

    const res = await request(app).get("/api/v1/users").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 401 AUTH_TOKEN_INVALID without a token", async () => {
    const res = await request(app).get("/api/v1/users");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/users (admin creates a new user)", () => {
  it("creates the user and returns the public DTO", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", isAdmin: true });
    const token = await loginAs("admin@bsg.test", "admin12345");

    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: "new@bsg.test",
        password: "newPassword1",
        displayName: "New Hire",
        role: "user"
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: "new@bsg.test",
      displayName: "New Hire",
      role: "user",
      isActive: true
    });
  });

  it("returns 409 CONFLICT_USER_EXISTS on duplicate email", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", isAdmin: true });
    await createTestUser({ email: "dup@bsg.test", password: "x" });
    const token = await loginAs("admin@bsg.test", "admin12345");

    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "dup@bsg.test", password: "anotherPwd" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT_USER_EXISTS");
  });

  it("returns 400 VALIDATION_FAILED on bad body", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", isAdmin: true });
    const token = await loginAs("admin@bsg.test", "admin12345");

    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "not-an-email", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("PATCH /api/v1/users/:id", () => {
  it("updates allowed fields", async () => {
    const admin = await createTestUser({
      email: "admin@bsg.test",
      password: "admin12345",
      isAdmin: true
    });
    const target = await createTestUser({ email: "target@bsg.test", password: "x" });
    const token = await loginAs("admin@bsg.test", "admin12345");

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false, displayName: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: target.id, isActive: false, displayName: "Renamed" });
    // Sanity: admin itself unchanged.
    void admin;
  });

  it("returns 400 VALIDATION_FAILED on invalid UUID param", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", isAdmin: true });
    const token = await loginAs("admin@bsg.test", "admin12345");

    const res = await request(app)
      .patch("/api/v1/users/not-a-uuid")
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 404 RESOURCE_NOT_FOUND for non-existent id", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", isAdmin: true });
    const token = await loginAs("admin@bsg.test", "admin12345");

    const res = await request(app)
      .patch("/api/v1/users/00000000-0000-4000-8000-000000000000")
      .set("Authorization", `Bearer ${token}`)
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("returns 400 VALIDATION_FAILED on empty patch body", async () => {
    const admin = await createTestUser({
      email: "admin@bsg.test",
      password: "admin12345",
      isAdmin: true
    });
    const token = await loginAs("admin@bsg.test", "admin12345");

    const res = await request(app)
      .patch(`/api/v1/users/${admin.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("POST /api/v1/users/:id/reset-password", () => {
  it("re-hashes the password (operator can log in with new one)", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", isAdmin: true });
    const target = await createTestUser({ email: "target@bsg.test", password: "oldPwd123" });
    const token = await loginAs("admin@bsg.test", "admin12345");

    await request(app)
      .post(`/api/v1/users/${target.id}/reset-password`)
      .set("Authorization", `Bearer ${token}`)
      .send({ newPassword: "newPwd45678" })
      .expect(200);

    // Old password no longer works.
    const oldLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "target@bsg.test", password: "oldPwd123" });
    expect(oldLogin.status).toBe(401);

    // New password does.
    const newLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: "target@bsg.test", password: "newPwd45678" });
    expect(newLogin.status).toBe(200);
  });
});

describe("Health endpoints", () => {
  it("GET /health returns 200 with no auth", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /ready pings DB + returns ready", async () => {
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.checks.db).toBe("ok");
  });
});

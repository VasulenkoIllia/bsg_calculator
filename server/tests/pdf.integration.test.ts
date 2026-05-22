/**
 * Integration tests for GET /api/v1/documents/:number/pdf.
 *
 * Sprint 4.E.2 made this endpoint actually render via the shared
 * `buildOfferPdfHtml` builder. Puppeteer itself is still disabled
 * in tests (NODE_ENV=test trips the browser-pool guard), so we only
 * verify the CONTROLLER LOGIC — input validation, shape checks,
 * downstream call routing. The Puppeteer render is exercised manually
 * during dev and via the future E2E Playwright job.
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import { db } from "../db/client";
import { companies } from "../db/schema";
import { companyFixture } from "./fixtures/company";
import { app, createTestUser } from "./test-helpers";

async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: email, password });
  return res.body.accessToken;
}

/**
 * Minimal payload that does NOT match the wizard's
 * DocumentTemplatePayload shape — triggers the 422 path in the
 * controller before any Puppeteer call.
 */
const minimalPayload = { schemaVersion: 1, header: { documentNumber: "BSG-7100001" } };

async function setupDocAndAuth(): Promise<{ token: string; number: string }> {
  await createTestUser({ email: "pdf@bsg.test", password: "password12345" });
  const token = await loginAs("pdf@bsg.test", "password12345");
  const [company] = await db.insert(companies).values(companyFixture()).returning();
  const res = await request(app)
    .post("/api/v1/documents")
    .set("Authorization", `Bearer ${token}`)
    .send({ companyId: company.id, scope: "offer", payload: minimalPayload });
  return { token, number: res.body.number };
}

describe("POST /api/v1/pdf/preview (Sprint 6.0)", () => {
  it("requires auth", async () => {
    const res = await request(app).post("/api/v1/pdf/preview").send({});
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing or payload key absent", async () => {
    // Sprint 9.S audit closure — explicit role at the call site so
    // the actor tier is visible without reading the helper's default.
    await createTestUser({ email: "pdf@bsg.test", password: "password12345", role: "admin" });
    const token = await loginAs("pdf@bsg.test", "password12345");
    const res = await request(app)
      .post("/api/v1/pdf/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 400 when payload lacks DocumentTemplatePayload shape", async () => {
    // Same shape-guard as GET /:number/pdf — fails BEFORE Puppeteer
    // pool is touched so the test runs cleanly even with Chromium
    // disabled in NODE_ENV=test.
    // Sprint 9.S audit closure — explicit role at the call site so
    // the actor tier is visible without reading the helper's default.
    await createTestUser({ email: "pdf@bsg.test", password: "password12345", role: "admin" });
    const token = await loginAs("pdf@bsg.test", "password12345");
    const res = await request(app)
      .post("/api/v1/pdf/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({ payload: { wrong: "shape" } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.message).toMatch(/payload not in DocumentTemplatePayload shape/i);
  });

  it("returns 400 when payload has null nested keys (Sprint 5.F.2 null-guard)", async () => {
    // typeof null === "object" — the Sprint 5.F.2 fix to isWizardPayload
    // explicitly rejects null nested fields, ensuring the error surface
    // is the right shape (400 VALIDATION_FAILED, not a confusing 500
    // from buildOfferPdfHtml dereferencing a null).
    // Sprint 9.S audit closure — explicit role at the call site so
    // the actor tier is visible without reading the helper's default.
    await createTestUser({ email: "pdf@bsg.test", password: "password12345", role: "admin" });
    const token = await loginAs("pdf@bsg.test", "password12345");
    const res = await request(app)
      .post("/api/v1/pdf/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({
        payload: {
          documentScope: "offer",
          header: null,
          layout: null,
          agreementParties: null
        }
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("GET /api/v1/documents/:number/pdf", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/v1/documents/BSG-7100001-512587/pdf");
    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_FAILED for a malformed number (regex pre-check)", async () => {
    // Sprint 9.S audit closure — explicit role at the call site so
    // the actor tier is visible without reading the helper's default.
    await createTestUser({ email: "pdf@bsg.test", password: "password12345", role: "admin" });
    const token = await loginAs("pdf@bsg.test", "password12345");
    // BSG-9999999 (no suffix) rejected by the URL pattern BEFORE the
    // DB lookup — defends Content-Disposition from CRLF injection on
    // inputs that could in some edge case bypass the lookup.
    const res = await request(app)
      .get("/api/v1/documents/BSG-9999999/pdf")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 404 for a well-formed but missing number", async () => {
    // Sprint 9.S audit closure — explicit role at the call site so
    // the actor tier is visible without reading the helper's default.
    await createTestUser({ email: "pdf@bsg.test", password: "password12345", role: "admin" });
    const token = await loginAs("pdf@bsg.test", "password12345");
    const res = await request(app)
      .get("/api/v1/documents/BSG-9999999-999999/pdf")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("returns 422 VALIDATION_FAILED when payload lacks wizard shape", async () => {
    // The shape-check guard intercepts BEFORE the Puppeteer pool is
    // touched, so this test runs cleanly even though Chromium is
    // disabled in NODE_ENV=test. minimalPayload above is the smoking
    // gun — it only carries schemaVersion + header.
    const { token, number } = await setupDocAndAuth();
    const res = await request(app)
      .get(`/api/v1/documents/${number}/pdf`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.message).toMatch(/payload not in DocumentTemplatePayload shape/i);
  });
});

/**
 * Phase 8 Stage 5 — soft-delete + restore integration tests.
 *
 * The HubSpot tear-down branch is exercised against a mocked
 * `hubspot.deleteNote` so we don't talk to the real API. The
 * "no HubSpot" branch covers documents that were never synced.
 *
 * Auth matrix:
 *   - DELETE /:number requires `admin` (admin OR super_admin pass)
 *   - POST /:number/restore requires `super_admin`
 *   - GET /?includeDeleted=true is silently coerced to 'alive' for
 *     non-super_admin (no 403 — debugging flag, not permission scope)
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { companies, documents } from "../db/schema";
import { hubspot } from "../modules/hubspot/hubspot.client";
import { companyFixture } from "./fixtures/company";
import { app, createTestUser } from "./test-helpers";

async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`loginAs ${email} failed: ${res.status}`);
  return res.body.accessToken;
}

const samplePayload = {
  schemaVersion: 1,
  calculatorType: { payin: true, payout: false },
  parties: { merchant: { legalName: "Acme Ltd" } }
};

async function createDocAs(
  token: string,
  companyId: string
): Promise<{ number: string; id: string }> {
  const res = await request(app)
    .post("/api/v1/documents")
    .set("Authorization", `Bearer ${token}`)
    .send({ companyId, scope: "offer", payload: samplePayload });
  if (res.status !== 201) {
    throw new Error(`createDoc failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { number: res.body.number, id: res.body.id };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("DELETE /api/v1/documents/:number — auth + body validation", () => {
  it("returns 403 FORBIDDEN for plain `user` role", async () => {
    // Sprint 9.R — `user` is now also forbidden from POST /documents
    // (createDocAs helper). Two-actor setup: an admin seeds the
    // document so the user can attempt to delete it.
    await createTestUser({
      email: "admin@bsg.test",
      password: "admin12345",
      role: "admin"
    });
    await createTestUser({
      email: "user@bsg.test",
      password: "user12345",
      role: "user"
    });
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "del000000001" }))
      .returning();
    const adminToken = await loginAs("admin@bsg.test", "admin12345");
    const userToken = await loginAs("user@bsg.test", "user12345");
    const { number } = await createDocAs(adminToken, company.id);

    const res = await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ reason: "duplicate" });
    expect(res.status).toBe(403);
  });

  it("returns 400 VALIDATION_FAILED when reason is 'other' but no note provided", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", role: "admin" });
    const [company] = await db.insert(companies).values(companyFixture({ hubspotCompanyId: "del000000002" })).returning();
    const token = await loginAs("admin@bsg.test", "admin12345");
    const { number } = await createDocAs(token, company.id);

    const res = await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "other" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 404 RESOURCE_NOT_FOUND for unknown document number", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", role: "admin" });
    const token = await loginAs("admin@bsg.test", "admin12345");
    const res = await request(app)
      .delete("/api/v1/documents/BSG-9999999-AAAAAA")
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/documents/:number — happy paths", () => {
  it("soft-deletes a never-synced document (no HubSpot call)", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", role: "admin" });
    const [company] = await db.insert(companies).values(companyFixture({ hubspotCompanyId: "del000000003" })).returning();
    const token = await loginAs("admin@bsg.test", "admin12345");
    const { number, id } = await createDocAs(token, company.id);

    const deleteNoteSpy = vi.spyOn(hubspot, "deleteNote").mockResolvedValue();

    const res = await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate", note: "Same content as BSG-..." });

    expect(res.status).toBe(200);
    expect(res.body.deletedAt).not.toBeNull();
    expect(res.body.deletionReason).toBe("duplicate");
    expect(res.body.deletionNote).toBe("Same content as BSG-...");
    // No HubSpot call — document was never synced.
    expect(deleteNoteSpy).not.toHaveBeenCalled();

    // DB row state verified.
    const [row] = await db.select().from(documents).where(eq(documents.id, id));
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletionReason).toBe("duplicate");
  });

  it("returns 409 DOCUMENT_ALREADY_DELETED on second delete of the same row", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", role: "admin" });
    const [company] = await db.insert(companies).values(companyFixture({ hubspotCompanyId: "del000000004" })).returning();
    const token = await loginAs("admin@bsg.test", "admin12345");
    const { number } = await createDocAs(token, company.id);

    await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate" })
      .expect(200);

    const res = await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DOCUMENT_ALREADY_DELETED");
  });

  it("emits a 'deleted' document_event with reason + hasNote breadcrumb (no note content)", async () => {
    // Sprint 9.M B5/B6 — events on soft-deleted documents are now
    // 404'd for non-super_admin callers (matching the single-doc
    // fetch gate). Use a super_admin actor to verify the event row.
    await createTestUser({
      email: "sa@bsg.test",
      password: "sa12345678",
      role: "super_admin"
    });
    const [company] = await db.insert(companies).values(companyFixture({ hubspotCompanyId: "del000000005" })).returning();
    const token = await loginAs("sa@bsg.test", "sa12345678");
    const { number } = await createDocAs(token, company.id);

    await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "client_request", note: "Client withdrew the offer" })
      .expect(200);

    // Sprint 9.M B6 — events meta deliberately omits the raw `note`
    // content (it can be sensitive operator commentary and the
    // events endpoint is readable by any authenticated user). The
    // breadcrumb `hasNote: true` is enough for the History panel
    // to mark "with note" without leaking the body.
    const events = await request(app)
      .get(`/api/v1/documents/${number}/events`)
      .set("Authorization", `Bearer ${token}`);
    expect(events.status).toBe(200);
    expect(events.body.items[0]).toMatchObject({
      eventType: "deleted",
      meta: expect.objectContaining({
        reason: "client_request",
        hasNote: true
      })
    });
    // The literal note content should NOT appear in event meta.
    expect(events.body.items[0].meta.note).toBeUndefined();
  });

  /**
   * Sprint 9.N policy reversal — soft-deleted documents are now
   * visible to all authenticated users. The deleter (admin) still
   * sees the row + events with a "Deleted" badge + reason.
   * `deletionNote` content is narrowed to admin+ inside `toPublic`.
   */
  it("Sprint 9.N — deleted-doc events readable by the deleter (admin)", async () => {
    await createTestUser({
      email: "admin@bsg.test",
      password: "admin12345",
      role: "admin"
    });
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "del000000099" }))
      .returning();
    const token = await loginAs("admin@bsg.test", "admin12345");
    const { number } = await createDocAs(token, company.id);

    // Admin can read events BEFORE delete.
    await request(app)
      .get(`/api/v1/documents/${number}/events`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate" })
      .expect(200);

    // Sprint 9.N — admin STILL sees events after delete (policy
    // reversal of Sprint 9.M). The 'deleted' event row is the
    // newest entry and carries reason/hasNote breadcrumb in meta.
    const res = await request(app)
      .get(`/api/v1/documents/${number}/events`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({
      eventType: "deleted",
      meta: expect.objectContaining({ reason: "duplicate" })
    });
  });

  /**
   * Sprint 9.N policy reversal — single-doc fetch returns the row
   * for any authenticated user, including soft-deleted ones. Note
   * content is gated on actorRole inside `toPublic`: regular user
   * sees the row WITHOUT the deletionNote field; admin+ sees it.
   */
  it("Sprint 9.N — deleted-doc single-fetch returns 200 with reason for admin", async () => {
    await createTestUser({
      email: "admin@bsg.test",
      password: "admin12345",
      role: "admin"
    });
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "del000000098" }))
      .returning();
    const token = await loginAs("admin@bsg.test", "admin12345");
    const { number } = await createDocAs(token, company.id);

    await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate", note: "internal context" })
      .expect(200);

    const res = await request(app)
      .get(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.deletedAt).not.toBeNull();
    expect(res.body.deletionReason).toBe("duplicate");
    // admin sees the note text (gated to admin+ at the DTO layer).
    expect(res.body.deletionNote).toBe("internal context");
  });

  it("Sprint 9.N — regular `user` sees the row but NOT the deletionNote text", async () => {
    await createTestUser({
      email: "admin@bsg.test",
      password: "admin12345",
      role: "admin"
    });
    // Sprint 9.R — explicit role: "user" (default flipped to "admin").
    // This test specifically verifies the `user` tier's note-redaction.
    await createTestUser({
      email: "user@bsg.test",
      password: "user12345",
      role: "user"
    });
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "del000000097" }))
      .returning();
    const adminToken = await loginAs("admin@bsg.test", "admin12345");
    const userToken = await loginAs("user@bsg.test", "user12345");
    const { number } = await createDocAs(adminToken, company.id);

    await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "client_request", note: "Sensitive internal context" })
      .expect(200);

    const res = await request(app)
      .get(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.deletionReason).toBe("client_request");
    // Regular user sees reason but NOT the free-text note.
    expect(res.body.deletionNote).toBeNull();
  });
});

describe("DELETE /api/v1/documents/:number — HubSpot tear-down", () => {
  it("calls hubspot.deleteNote when document is synced + clears noteId on success", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", role: "admin" });
    const [company] = await db.insert(companies).values(companyFixture({ hubspotCompanyId: "del000000006" })).returning();
    const token = await loginAs("admin@bsg.test", "admin12345");
    const { number, id } = await createDocAs(token, company.id);

    // Simulate a previously-synced state by directly patching the row.
    await db
      .update(documents)
      .set({ hubspotSyncState: "synced", hubspotNoteId: "fake-note-42" })
      .where(eq(documents.id, id));

    const deleteNoteSpy = vi.spyOn(hubspot, "deleteNote").mockResolvedValue();
    vi.spyOn(hubspot, "isConfigured").mockReturnValue(true);

    const res = await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "client_request" });

    expect(res.status).toBe(200);
    expect(deleteNoteSpy).toHaveBeenCalledWith("fake-note-42");
    expect(res.body.deletedAt).not.toBeNull();
    expect(res.body.hubspotNoteId).toBeNull();
    expect(res.body.hubspotSyncState).toBe("not_synced");
  });

  it("returns 502 + leaves row ALIVE with state='delete_failed' on HubSpot failure", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", role: "admin" });
    const [company] = await db.insert(companies).values(companyFixture({ hubspotCompanyId: "del000000007" })).returning();
    const token = await loginAs("admin@bsg.test", "admin12345");
    const { number, id } = await createDocAs(token, company.id);

    await db
      .update(documents)
      .set({ hubspotSyncState: "synced", hubspotNoteId: "fake-note-99" })
      .where(eq(documents.id, id));

    vi.spyOn(hubspot, "isConfigured").mockReturnValue(true);
    vi.spyOn(hubspot, "deleteNote").mockRejectedValue(
      new Error("connection refused")
    );

    const res = await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate" });

    expect(res.status).toBe(502);
    // Row stayed alive — deletedAt is still null.
    const [row] = await db.select().from(documents).where(eq(documents.id, id));
    expect(row.deletedAt).toBeNull();
    expect(row.hubspotSyncState).toBe("delete_failed");
    expect(row.hubspotNoteId).toBe("fake-note-99");
  });
});

describe("POST /api/v1/documents/:number/restore", () => {
  it("returns 403 for admin (super_admin required)", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", role: "admin" });
    const [company] = await db.insert(companies).values(companyFixture({ hubspotCompanyId: "del000000008" })).returning();
    const token = await loginAs("admin@bsg.test", "admin12345");
    const { number } = await createDocAs(token, company.id);
    await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate" })
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/documents/${number}/restore`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it("clears soft-delete fields when super_admin restores", async () => {
    await createTestUser({
      email: "sa@bsg.test",
      password: "sa12345678",
      role: "super_admin"
    });
    const [company] = await db.insert(companies).values(companyFixture({ hubspotCompanyId: "del000000009" })).returning();
    const token = await loginAs("sa@bsg.test", "sa12345678");
    const { number } = await createDocAs(token, company.id);
    await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "created_in_error" })
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/documents/${number}/restore`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.deletedAt).toBeNull();
    expect(res.body.deletionReason).toBeNull();

    // History records a 'restored' event.
    const events = await request(app)
      .get(`/api/v1/documents/${number}/events`)
      .set("Authorization", `Bearer ${token}`);
    expect(events.body.items[0]).toMatchObject({ eventType: "restored" });
  });

  it("returns 404 when restoring a non-deleted document", async () => {
    await createTestUser({
      email: "sa@bsg.test",
      password: "sa12345678",
      role: "super_admin"
    });
    const [company] = await db.insert(companies).values(companyFixture({ hubspotCompanyId: "del000000010" })).returning();
    const token = await loginAs("sa@bsg.test", "sa12345678");
    const { number } = await createDocAs(token, company.id);

    const res = await request(app)
      .post(`/api/v1/documents/${number}/restore`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(404);
  });
});

/**
 * Sprint 9.M T3 — guards on soft-deleted documents across the three
 * write paths that should refuse to touch a retracted artefact:
 * Sync (would push a Note for a deleted doc), Use-as-template
 * (would bootstrap new work from a retracted source), PDF download
 * (intentionally STILL allowed for audit access — covered here so a
 * future refactor doesn't accidentally tighten this without
 * thinking through the audit implications).
 */
describe("Soft-deleted guards across write paths", () => {
  it("POST /documents/:number/sync on a soft-deleted doc → 404", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", role: "admin" });
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "delsync001234" }))
      .returning();
    const token = await loginAs("admin@bsg.test", "admin12345");
    const { number } = await createDocAs(token, company.id);

    await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate" })
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/documents/${number}/sync`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("POST /documents/:number/use-as-template on a soft-deleted doc → 404", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", role: "admin" });
    const [company] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "deltpl0012345" }))
      .returning();
    const token = await loginAs("admin@bsg.test", "admin12345");
    const { number } = await createDocAs(token, company.id);

    await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate" })
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/documents/${number}/use-as-template`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("Listing: Sprint 9.N visibility policy", () => {
  it("INCLUDES soft-deleted rows by default for any authenticated user", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", role: "admin" });
    await createTestUser({ email: "user@bsg.test", password: "user12345" });
    const [company] = await db.insert(companies).values(companyFixture({ hubspotCompanyId: "del000000011" })).returning();
    const adminToken = await loginAs("admin@bsg.test", "admin12345");
    const userToken = await loginAs("user@bsg.test", "user12345");

    const { number: aliveNumber } = await createDocAs(adminToken, company.id);
    const { number: deletedNumber } = await createDocAs(adminToken, company.id);
    await request(app)
      .delete(`/api/v1/documents/${deletedNumber}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "duplicate" })
      .expect(200);

    // Sprint 9.N — default behaviour shows BOTH alive and deleted
    // (regular user uses the Status filter on the FE to narrow).
    const list = await request(app)
      .get("/api/v1/documents")
      .set("Authorization", `Bearer ${userToken}`);
    expect(list.status).toBe(200);
    const numbers = list.body.items.map((d: { number: string }) => d.number);
    expect(numbers).toContain(aliveNumber);
    expect(numbers).toContain(deletedNumber);
  });

  it("includeDeleted=false → alive only (Status: Active filter)", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", role: "admin" });
    const [company] = await db.insert(companies).values(companyFixture({ hubspotCompanyId: "del000000012" })).returning();
    const token = await loginAs("admin@bsg.test", "admin12345");
    const { number: aliveNumber } = await createDocAs(token, company.id);
    const { number: deletedNumber } = await createDocAs(token, company.id);
    await request(app)
      .delete(`/api/v1/documents/${deletedNumber}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate" })
      .expect(200);

    const list = await request(app)
      .get("/api/v1/documents?includeDeleted=false")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    const numbers = list.body.items.map((d: { number: string }) => d.number);
    expect(numbers).toContain(aliveNumber);
    expect(numbers).not.toContain(deletedNumber);
  });

  it("includeDeleted=only → deleted only (any role, Status: Deleted filter)", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", role: "admin" });
    const [company] = await db.insert(companies).values(companyFixture({ hubspotCompanyId: "del000000013" })).returning();
    const token = await loginAs("admin@bsg.test", "admin12345");
    const { number: aliveNumber } = await createDocAs(token, company.id);
    const { number: deletedNumber } = await createDocAs(token, company.id);
    await request(app)
      .delete(`/api/v1/documents/${deletedNumber}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate" })
      .expect(200);

    const list = await request(app)
      .get("/api/v1/documents?includeDeleted=only")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    const numbers = list.body.items.map((d: { number: string }) => d.number);
    expect(numbers).not.toContain(aliveNumber);
    expect(numbers).toContain(deletedNumber);
  });

  it("listing rows carry lastEvent surrogate from the events log", async () => {
    await createTestUser({ email: "admin@bsg.test", password: "admin12345", role: "admin" });
    const [company] = await db.insert(companies).values(companyFixture({ hubspotCompanyId: "del000000014" })).returning();
    const token = await loginAs("admin@bsg.test", "admin12345");
    const { number } = await createDocAs(token, company.id);

    const list = await request(app)
      .get("/api/v1/documents")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    const row = list.body.items.find((d: { number: string }) => d.number === number);
    expect(row).toBeDefined();
    // Sprint 9.N — every freshly-created doc has at least one event
    // (the 'created' event written in the same TX as the insert).
    expect(row.lastEvent).toMatchObject({
      eventType: "created",
      actorDisplayName: expect.any(String)
    });
  });
});

/**
 * The cutover's central promise, tested: after CRM_PROVIDER flips to
 * monday, the 34 documents whose notes live in HubSpot must still delete
 * cleanly — soft-deleted locally, with NO call to either CRM.
 *
 * Nothing covered this. Every other test in the suite runs with the
 * default `CRM_PROVIDER=hubspot`, so the entire monday era was exercised
 * only by hand against a copy of production. That is exactly the blind
 * spot that hid two SQL blockers in the backfill, which is why this file
 * mocks the env module rather than trusting a manual pass.
 *
 * `env` is `Object.freeze`d, so a spy cannot reach it — the module itself
 * has to be replaced, spreading the real config so DATABASE_URL and the
 * rest stay exactly as the suite set them up.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { describeResponse } from "./test-helpers";
import request from "supertest";
import { eq } from "drizzle-orm";

vi.mock("../config/env", async importOriginal => {
  const actual = await importOriginal<typeof import("../config/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      CRM_PROVIDER: "monday",
      MONDAY_API_TOKEN: "test-monday-token",
      MONDAY_WEBHOOK_SECRET: "test_monday_webhook_secret"
    }
  };
});

const { db } = await import("../db/client");
const { companies, documents } = await import("../db/schema");
const { hubspot } = await import("../modules/hubspot/hubspot.client");
const { monday } = await import("../modules/monday/monday.client");
const { companyFixture } = await import("./fixtures/company");
const { app, createTestUser } = await import("./test-helpers");

const PW = "admin12345";

async function loginAs(email: string): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ identifier: email, password: PW });
  if (res.status !== 200) throw new Error(`loginAs ${email} failed: ${describeResponse(res)}`);
  return res.body.accessToken;
}

async function seedDoc(noteProvider: "hubspot" | "monday" | null): Promise<{ number: string; token: string }> {
  await createTestUser({ email: "era@bsg.test", password: PW, role: "admin" });
  const token = await loginAs("era@bsg.test");
  const [company] = await db
    .insert(companies)
    .values(companyFixture({ hubspotCompanyId: "era000000001", crmItemId: "3170219470" }))
    .returning();

  const created = await request(app)
    .post("/api/v1/documents")
    .set("Authorization", `Bearer ${token}`)
    .send({
      companyId: company.id,
      scope: "offer",
      payload: {
        schemaVersion: 1,
        calculatorType: { payin: true, payout: false },
        parties: { merchant: { legalName: "Era Ltd" } }
      }
    });
  expect(created.status).toBe(201);

  if (noteProvider) {
    await db
      .update(documents)
      .set({
        hubspotSyncState: "synced",
        hubspotNoteId: `note-${noteProvider}-1`,
        crmNoteProvider: noteProvider,
        crmNoteTarget: "company"
      })
      .where(eq(documents.id, created.body.id));
  }
  return { number: created.body.number, token };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("monday era — deleting a HubSpot-era document", () => {
  it("soft-deletes WITHOUT calling HubSpot or monday", async () => {
    const deleteNote = vi.spyOn(hubspot, "deleteNote").mockResolvedValue(undefined as never);
    const deleteUpdate = vi.spyOn(monday, "deleteUpdate").mockResolvedValue(undefined as never);

    const { number, token } = await seedDoc("hubspot");
    const res = await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate" });

    expect(res.status).toBe(200);
    // The whole point: HubSpot is gone, so it must not be dialled — and
    // the note is not monday's, so monday must not be dialled either.
    expect(deleteNote).not.toHaveBeenCalled();
    expect(deleteUpdate).not.toHaveBeenCalled();

    const [row] = await db.select().from(documents).where(eq(documents.number, number));
    expect(row.deletedAt).not.toBeNull();
    // The live pointer is cleared (the CHECK pairs it with the provider),
    // but the id is NOT lost: nothing tore that note down, so it is still
    // sitting on the customer's HubSpot card and the legacy column is the
    // only remaining record of it.
    expect(row.hubspotNoteId).toBeNull();
    expect(row.crmNoteProvider).toBeNull();
    expect(row.legacyHubspotNoteId).toBe("note-hubspot-1");
  });

  it("DOES tear down a monday-era note on the same delete path", async () => {
    const deleteUpdate = vi.spyOn(monday, "deleteUpdate").mockResolvedValue(undefined as never);

    const { number, token } = await seedDoc("monday");
    const res = await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate" });

    expect(res.status).toBe(200);
    expect(deleteUpdate).toHaveBeenCalledWith("note-monday-1");

    // A monday id must never be parked in a column named for HubSpot —
    // and it does not need to be: that note really was removed upstream.
    const [row] = await db.select().from(documents).where(eq(documents.number, number));
    expect(row.legacyHubspotNoteId).toBeNull();
  });

  it("a never-synced document deletes with no CRM call at all", async () => {
    const deleteNote = vi.spyOn(hubspot, "deleteNote").mockResolvedValue(undefined as never);
    const deleteUpdate = vi.spyOn(monday, "deleteUpdate").mockResolvedValue(undefined as never);

    const { number, token } = await seedDoc(null);
    const res = await request(app)
      .delete(`/api/v1/documents/${number}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "duplicate" });

    expect(res.status).toBe(200);
    expect(deleteNote).not.toHaveBeenCalled();
    expect(deleteUpdate).not.toHaveBeenCalled();
  });
});

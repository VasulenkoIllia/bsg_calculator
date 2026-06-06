/**
 * Integration tests for server/scripts/reconcile-companies.ts.
 *
 * The reconcile script's `--prune-empty` and `--repoint` paths DELETE and
 * MUTATE production data, so the drift detection, the prune guard (never
 * delete a company that owns documents) and the re-point delegation are
 * covered directly here. HubSpot is stubbed via `vi.spyOn` so no real
 * HTTP fires; a 404 (NotFoundError) is what marks a company as drifted.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { companies, deals, documents } from "../db/schema";
import { hubspot } from "../modules/hubspot/hubspot.client";
import { HubspotUnreachableError } from "../shared/errors";
import type { HubspotObject } from "../modules/hubspot/hubspot.types";
import { __internals } from "../scripts/reconcile-companies";
import { companyFixture } from "./fixtures/company";
import { createTestUser } from "./test-helpers";

const { findDriftedCompanies, scan, repoint } = __internals;

function hubspotCompanyObject(id: string): HubspotObject {
  return {
    id,
    properties: {
      hs_object_id: id,
      name: "Acme",
      company_type: "direct_client",
      createdate: "2026-01-01T00:00:00.000Z",
      hs_lastmodifieddate: "2026-02-01T00:00:00.000Z"
    }
  } as HubspotObject;
}

/**
 * The real shape the HubSpot client throws on a 404 — ALL 4xx surface as
 * HubspotUnreachableError carrying details.status (NOT NotFoundError). The
 * reconcile drift detection must key on this, not on the error class.
 */
function hubspot404(): HubspotUnreachableError {
  return new HubspotUnreachableError("HubSpot returned 404: <html>…not found</html>", {
    status: 404,
    url: "https://api.hubapi.com/crm/v3/objects/companies/x"
  });
}

describe("reconcile-companies script", () => {
  let getCompanySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getCompanySpy = vi.spyOn(hubspot, "getCompany");
    // hubspot.isConfigured() is read by main(), not the internals — internals
    // call getCompany directly, which we stub per-test.
  });

  afterEach(() => {
    getCompanySpy.mockRestore();
  });

  it("findDriftedCompanies: classifies a HubSpot 404 as drift and counts owned rows", async () => {
    const user = await createTestUser({ email: "rec1@test.dev", password: "password123" });
    await db.insert(companies).values(companyFixture({ hubspotCompanyId: "8000000001" }));
    const [drifted] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "8000000002" }))
      .returning();
    await db.insert(documents).values({
      number: "BSG-8000001-000001",
      companyId: drifted.id,
      scope: "offer",
      payload: {},
      createdByUserId: user.id
    });
    await db.insert(deals).values({
      hubspotDealId: "8000000010",
      hubspotCompanyId: drifted.hubspotCompanyId,
      name: "Drifted Deal",
      hubspotCreatedAt: new Date(),
      hubspotModifiedAt: new Date(),
      hubspotRaw: {}
    });

    getCompanySpy.mockImplementation(async (id: string) => {
      if (id === "8000000001") return hubspotCompanyObject(id);
      throw hubspot404();
    });

    const result = await findDriftedCompanies();
    expect(result).toHaveLength(1);
    expect(result[0].company.hubspotCompanyId).toBe("8000000002");
    expect(result[0].documents).toBe(1);
    expect(result[0].deals).toBe(1);
  });

  it("findDriftedCompanies: rethrows a non-404 (e.g. 503) to abort (never misclassifies)", async () => {
    await db.insert(companies).values(companyFixture({ hubspotCompanyId: "8000000050" }));
    getCompanySpy.mockRejectedValue(
      new HubspotUnreachableError("HubSpot returned 503.", { status: 503, url: "x" })
    );
    await expect(findDriftedCompanies()).rejects.toThrow(/503/);
  });

  it("scan --prune-empty: removes no-document drift, keeps document-owning drift", async () => {
    const user = await createTestUser({ email: "rec2@test.dev", password: "password123" });
    await db.insert(companies).values(companyFixture({ hubspotCompanyId: "8000000101" })); // empty
    const [withDocs] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "8000000102" }))
      .returning();
    await db.insert(documents).values({
      number: "BSG-8000002-000001",
      companyId: withDocs.id,
      scope: "offer",
      payload: {},
      createdByUserId: user.id
    });

    getCompanySpy.mockRejectedValue(hubspot404()); // both drifted

    await scan(true);

    const remaining = (await db.select().from(companies)).map(c => c.hubspotCompanyId);
    expect(remaining).toEqual(["8000000102"]); // empty pruned; doc-owner kept
  });

  it("repoint: folds the drifted company into the survivor (re-points docs, removes secondary)", async () => {
    const user = await createTestUser({ email: "rec3@test.dev", password: "password123" });
    const [survivor] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "8000000201" }))
      .returning();
    const [drifted] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "8000000202" }))
      .returning();
    const [doc] = await db
      .insert(documents)
      .values({
        number: "BSG-8000003-000001",
        companyId: drifted.id,
        scope: "offer",
        payload: {},
        createdByUserId: user.id
      })
      .returning();

    // Survivor is cached → repoint validation finds it without a HubSpot call.
    await repoint("8000000202", "8000000201");

    const [movedDoc] = await db.select().from(documents).where(eq(documents.id, doc.id));
    expect(movedDoc.companyId).toBe(survivor.id);
    const remaining = (await db.select().from(companies)).map(c => c.hubspotCompanyId);
    expect(remaining).toEqual(["8000000201"]);
  });

  it("repoint: rejects from === to", async () => {
    await expect(repoint("8000000301", "8000000301")).rejects.toThrow(/must differ/);
  });

  it("repoint: rejects a survivor absent from both cache and HubSpot", async () => {
    getCompanySpy.mockRejectedValue(hubspot404());
    await expect(repoint("8000000401", "8000000402")).rejects.toThrow(/not found/);
  });
});

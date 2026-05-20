/**
 * Unit tests for the backfill helpers.
 *
 * Targets the pure logic surfaces — full HubSpot calls are mocked
 * via vi.mock at module level. The DB layer is exercised against
 * the real test Postgres (cleanupNonMatching, loadKnownCompanyIds).
 */

import { describe, expect, it } from "vitest";
import { db } from "../db/client";
import { companies, deals, type NewCompany, type NewDeal } from "../db/schema";
import { __internals } from "./hubspot-backfill";

const { resolveDealCompanyFromSet, loadKnownCompanyIds, cleanupNonMatching } = __internals;

function companyFixture(overrides: Partial<NewCompany> = {}): NewCompany {
  return {
    hubspotCompanyId: `hub-${Math.random().toString(36).slice(2, 10)}`,
    name: "Test",
    companyType: "direct_client",
    hubspotCreatedAt: new Date(),
    hubspotModifiedAt: new Date(),
    hubspotRaw: {},
    ...overrides
  };
}

function dealFixture(hubspotCompanyId: string, overrides: Partial<NewDeal> = {}): NewDeal {
  return {
    hubspotDealId: `deal-${Math.random().toString(36).slice(2, 10)}`,
    hubspotCompanyId,
    name: "Test Deal",
    hubspotCreatedAt: new Date(),
    hubspotModifiedAt: new Date(),
    hubspotRaw: {},
    ...overrides
  };
}

describe("resolveDealCompanyFromSet", () => {
  it("picks primary candidate when it's in the known set", () => {
    const known = new Set(["A", "B", "C"]);
    expect(resolveDealCompanyFromSet(["B", "A"], known)).toBe("B");
  });

  it("falls back to secondary when primary is filtered out", () => {
    const known = new Set(["B"]); // primary "A" missing
    expect(resolveDealCompanyFromSet(["A", "B"], known)).toBe("B");
  });

  it("returns null when none of the candidates is known", () => {
    const known = new Set(["X", "Y"]);
    expect(resolveDealCompanyFromSet(["A", "B"], known)).toBeNull();
  });

  it("returns null on empty candidate list", () => {
    expect(resolveDealCompanyFromSet([], new Set(["A"]))).toBeNull();
  });
});

describe("loadKnownCompanyIds", () => {
  it("returns an empty Set when companies table is empty", async () => {
    const set = await loadKnownCompanyIds();
    expect(set.size).toBe(0);
  });

  it("includes every hubspot_company_id present in the DB", async () => {
    const a = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "A-001" }))
      .returning();
    const b = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "B-002" }))
      .returning();
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);

    const set = await loadKnownCompanyIds();
    expect(set.has("A-001")).toBe(true);
    expect(set.has("B-002")).toBe(true);
    expect(set.has("C-not-there")).toBe(false);
  });
});

describe("cleanupNonMatching", () => {
  it("no-ops when filter is empty", async () => {
    await db.insert(companies).values(
      companyFixture({ companyType: "referring_partner" })
    );

    const stats = await cleanupNonMatching("");
    expect(stats).toEqual({ companiesDeleted: 0, dealsDeleted: 0 });

    const remaining = await db.select().from(companies);
    expect(remaining).toHaveLength(1); // untouched
  });

  it("removes non-matching companies (and their deals) — keeps matching ones", async () => {
    const [keepCompany] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "keep", companyType: "direct_client" }))
      .returning();
    const [dropCompany] = await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "drop", companyType: "referring_partner" }))
      .returning();
    expect(keepCompany).toBeDefined();
    expect(dropCompany).toBeDefined();
    await db.insert(deals).values(dealFixture("keep"));
    await db.insert(deals).values(dealFixture("drop"));

    const stats = await cleanupNonMatching("direct_client");
    expect(stats.companiesDeleted).toBe(1);
    expect(stats.dealsDeleted).toBe(1);

    const remainingCompanies = await db.select().from(companies);
    expect(remainingCompanies.map(c => c.hubspotCompanyId)).toEqual(["keep"]);
    const remainingDeals = await db.select().from(deals);
    expect(remainingDeals.map(d => d.hubspotCompanyId)).toEqual(["keep"]);
  });

  it("also removes companies with NULL company_type", async () => {
    await db
      .insert(companies)
      .values(companyFixture({ hubspotCompanyId: "no-type", companyType: null }));

    const stats = await cleanupNonMatching("direct_client");
    expect(stats.companiesDeleted).toBe(1);

    const remaining = await db.select().from(companies);
    expect(remaining).toHaveLength(0);
  });
});

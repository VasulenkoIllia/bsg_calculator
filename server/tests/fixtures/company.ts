/**
 * Shared `companyFixture()` factory for server integration tests.
 *
 * Five test files used to define an identical local copy of this
 * factory (Sprint 5.F.2 audit caught the duplication). Centralising
 * here means a future field addition on `companies` only needs to be
 * reflected in one place — and tests that don't override the field
 * pick up the new default automatically.
 *
 * Use:
 *   await db.insert(companies).values(companyFixture());
 *   await db.insert(companies).values(companyFixture({ name: "Acme" }));
 */

import type { NewCompany } from "../../db/schema";

export function companyFixture(overrides: Partial<NewCompany> = {}): NewCompany {
  return {
    // Random suffix so concurrent fixtures in one test don't collide
    // on the UNIQUE(hubspot_company_id) constraint.
    hubspotCompanyId: `hubspot-${Math.random().toString(36).slice(2)}`,
    name: "Acme Holdings",
    companyType: "direct_client",
    hubspotCreatedAt: new Date("2026-01-01"),
    hubspotModifiedAt: new Date("2026-01-01"),
    hubspotRaw: {},
    ...overrides
  };
}

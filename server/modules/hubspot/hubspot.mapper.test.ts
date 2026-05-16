/**
 * Pure-function unit tests for the HubSpot → row mapper.
 *
 * No DB or HTTP — tests only verify shape transformations and
 * defensive null/missing-field handling.
 */

import { describe, expect, it } from "vitest";
import { mapHubspotCompanyToRow, mapHubspotDealToRow } from "./hubspot.mapper";
import type { HubspotObject } from "./hubspot.types";

function makeCompanyFixture(overrides: Partial<HubspotObject["properties"]> = {}): HubspotObject {
  return {
    id: "426418136305",
    properties: {
      hs_object_id: "426418136305",
      name: "(A) Elena",
      company_type: "referring_partner",
      segment_type: "Master_referring_partner",
      lifecyclestage: "opportunity",
      hs_task_label: "(A) Elena",
      createdate: "2026-04-17T16:02:14.684Z",
      hs_lastmodifieddate: "2026-05-13T21:25:24.362Z",
      ...overrides
    },
    createdAt: "2026-04-17T16:02:14.684Z",
    updatedAt: "2026-05-13T21:25:24.362Z"
  };
}

function makeDealFixture(overrides: Partial<HubspotObject["properties"]> = {}): HubspotObject {
  return {
    id: "498828505295",
    properties: {
      hs_object_id: "498828505295",
      hs_primary_associated_company: "426487875793",
      dealname: "CEI Processing Limited",
      dealstage: "appointmentscheduled",
      pipeline: "default",
      amount: "500000",
      deal_currency_code: "EUR",
      client: "(M) Atom",
      agent: "(A) Jeremy",
      business_vertical: "iGaming / Betting",
      createdate: "2026-04-14T09:44:37.845Z",
      hs_lastmodifieddate: "2026-04-28T16:09:13.636Z",
      ...overrides
    },
    createdAt: "2026-04-14T09:44:37.845Z",
    updatedAt: "2026-04-28T16:09:13.636Z"
  };
}

describe("mapHubspotCompanyToRow", () => {
  it("maps a populated company correctly", () => {
    const row = mapHubspotCompanyToRow(makeCompanyFixture());
    expect(row).not.toBeNull();
    expect(row).toMatchObject({
      hubspotCompanyId: "426418136305",
      name: "(A) Elena",
      companyType: "referring_partner",
      segmentType: "Master_referring_partner",
      lifecycleStage: "opportunity",
      hsTaskLabel: "(A) Elena"
    });
    expect(row?.hubspotCreatedAt).toBeInstanceOf(Date);
    expect(row?.hubspotModifiedAt).toBeInstanceOf(Date);
    expect(row?.hubspotRaw).toMatchObject({ name: "(A) Elena" });
  });

  it("returns null on missing name", () => {
    const obj = makeCompanyFixture({ name: null });
    expect(mapHubspotCompanyToRow(obj)).toBeNull();
  });

  it("returns null on missing createdate", () => {
    const obj = makeCompanyFixture({ createdate: null });
    expect(mapHubspotCompanyToRow(obj)).toBeNull();
  });

  it("nulls empty-string optional fields", () => {
    const row = mapHubspotCompanyToRow(makeCompanyFixture({ company_type: "", segment_type: null }));
    expect(row?.companyType).toBeNull();
    expect(row?.segmentType).toBeNull();
  });

  it("preserves the full payload in hubspot_raw", () => {
    const obj = makeCompanyFixture({ industry: "FINTECH", domain: "acme.com" });
    const row = mapHubspotCompanyToRow(obj);
    expect(row?.hubspotRaw).toMatchObject({ industry: "FINTECH", domain: "acme.com" });
  });

  it("parses ISO timestamps", () => {
    const row = mapHubspotCompanyToRow(makeCompanyFixture());
    expect(row?.hubspotCreatedAt?.toISOString()).toBe("2026-04-17T16:02:14.684Z");
  });

  it("parses epoch-ms timestamps if HubSpot ever returns them", () => {
    const epochMs = "1745870400000"; // 2025-04-28T16:00:00.000Z
    const row = mapHubspotCompanyToRow(makeCompanyFixture({ createdate: epochMs }));
    expect(row?.hubspotCreatedAt?.toISOString()).toBe("2025-04-28T20:00:00.000Z");
  });
});

describe("mapHubspotDealToRow", () => {
  it("maps a populated deal correctly", () => {
    const row = mapHubspotDealToRow(makeDealFixture());
    expect(row).not.toBeNull();
    expect(row).toMatchObject({
      hubspotDealId: "498828505295",
      hubspotCompanyId: "426487875793",
      name: "CEI Processing Limited",
      stage: "appointmentscheduled",
      pipelineId: "default",
      amount: "500000",
      currency: "EUR",
      clientLabel: "(M) Atom",
      agentLabel: "(A) Jeremy",
      businessVertical: "iGaming / Betting"
    });
  });

  it("returns null when hs_primary_associated_company is missing", () => {
    const obj = makeDealFixture({ hs_primary_associated_company: null });
    expect(mapHubspotDealToRow(obj)).toBeNull();
  });

  it("falls back to associations[].companies[0] when primary property is missing", () => {
    const obj: HubspotObject = {
      ...makeDealFixture({ hs_primary_associated_company: null }),
      associations: {
        companies: { results: [{ id: "999999", type: "company_to_deal" }] }
      }
    };
    const row = mapHubspotDealToRow(obj);
    expect(row?.hubspotCompanyId).toBe("999999");
  });

  it("returns null on missing dealname", () => {
    expect(mapHubspotDealToRow(makeDealFixture({ dealname: null }))).toBeNull();
  });

  it("preserves all pricing fields in hubspot_raw (they're NOT extracted)", () => {
    const obj = makeDealFixture({
      forecasted_monthly_volume: "5000000",
      transaction_fee__mdr: "3.5",
      switzerland_share_in_total_europe_volume: "12.5"
    });
    const row = mapHubspotDealToRow(obj);
    expect(row?.hubspotRaw).toMatchObject({
      forecasted_monthly_volume: "5000000",
      transaction_fee__mdr: "3.5",
      switzerland_share_in_total_europe_volume: "12.5"
    });
    // Verify they're NOT in the named columns of NewDeal type.
    expect(row).not.toHaveProperty("forecastedMonthlyVolume");
  });
});

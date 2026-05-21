/**
 * Phase 9 — unit tests for the HubSpot Note body builder.
 *
 * The builder is pure (no DB, no HTTP) so we can exercise it with
 * plain in-memory `Document`-shaped fixtures. The assertions focus
 * on the SHAPE of the output (presence of key sections, URL form,
 * scope label) rather than exact string matches — so future polish
 * to the template doesn't break the suite.
 */

import { describe, expect, it } from "vitest";
import type { Document } from "../../db/schema";
import { buildHubspotNoteBody } from "./note-builder";

// ─── Fixture helper ─────────────────────────────────────────────────
function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    number: "BSG-7100001-512587",
    companyId: "22222222-2222-4222-8222-222222222222",
    hubspotDealId: null,
    calculatorConfigId: null,
    scope: "offer",
    payload: {
      schemaVersion: 1,
      calculatorType: { kind: "card", payin: true, payout: false },
      payin: { euPercent: 80, wwPercent: 20, ccPercent: 70, apmPercent: 30 },
      contractSummary: {
        settlementPeriod: "T+1",
        rollingReservePercent: 5,
        rollingReserveHoldDays: 180
      }
    },
    addendum: null,
    hubspotSyncState: "not_synced",
    hubspotNoteId: null,
    createdByUserId: "33333333-3333-4333-8333-333333333333",
    createdAt: new Date("2026-05-21T12:34:56.789Z"),
    updatedAt: new Date("2026-05-21T12:34:56.789Z"),
    ...overrides
  };
}

describe("buildHubspotNoteBody", () => {
  it("includes the BSG number + scope label in the header", () => {
    const body = buildHubspotNoteBody({
      document: makeDoc({ scope: "offer" }),
      companyName: "Acme Inc"
    });
    expect(body).toContain("BSG-7100001-512587");
    expect(body).toContain("Offer");
  });

  it("renders the agreement scope label correctly", () => {
    const body = buildHubspotNoteBody({
      document: makeDoc({ scope: "agreement" }),
      companyName: "Acme Inc"
    });
    expect(body).toContain("Agreement");
  });

  it("renders the offer_and_agreement scope label as 'Offer + Agreement'", () => {
    const body = buildHubspotNoteBody({
      document: makeDoc({ scope: "offer_and_agreement" }),
      companyName: "Acme Inc"
    });
    expect(body).toContain("Offer + Agreement");
  });

  it("includes the company name when provided", () => {
    const body = buildHubspotNoteBody({
      document: makeDoc(),
      companyName: "Acme Payments BV"
    });
    expect(body).toMatch(/Company:\s+Acme Payments BV/);
  });

  it("includes the hubspotDealId when the document is pinned to a deal", () => {
    const body = buildHubspotNoteBody({
      document: makeDoc({ hubspotDealId: "499577072839" }),
      companyName: "Acme Inc"
    });
    expect(body).toMatch(/Deal:\s+499577072839/);
  });

  it("omits the Deal line when document has no hubspotDealId", () => {
    const body = buildHubspotNoteBody({
      document: makeDoc({ hubspotDealId: null }),
      companyName: "Acme Inc"
    });
    expect(body).not.toMatch(/^Deal:/m);
  });

  it("includes the payin split percentages when the payload carries them", () => {
    const body = buildHubspotNoteBody({
      document: makeDoc(),
      companyName: "Acme Inc"
    });
    expect(body).toContain("Payin split");
    expect(body).toMatch(/EU:\s+80\.00%/);
    expect(body).toMatch(/Worldwide:\s+20\.00%/);
  });

  it("includes contract terms (settlement, rolling reserve) when present", () => {
    const body = buildHubspotNoteBody({
      document: makeDoc(),
      companyName: "Acme Inc"
    });
    expect(body).toContain("Contract terms");
    expect(body).toContain("Settlement: T+1");
    expect(body).toMatch(/Rolling reserve:\s+5\.00%/);
    expect(body).toContain("hold 180 days");
  });

  it("includes the addendum when present", () => {
    const body = buildHubspotNoteBody({
      document: makeDoc({ addendum: "Custom payment terms apply." }),
      companyName: "Acme Inc"
    });
    expect(body).toContain("Addendum");
    expect(body).toContain("Custom payment terms apply.");
  });

  it("does NOT render the Addendum section when document has none", () => {
    const body = buildHubspotNoteBody({
      document: makeDoc({ addendum: null }),
      companyName: "Acme Inc"
    });
    expect(body).not.toContain("── Addendum ──");
  });

  it("emits a clickable footer link with the BSG number", () => {
    const body = buildHubspotNoteBody({
      document: makeDoc(),
      companyName: "Acme Inc"
    });
    expect(body).toMatch(/View full document:\s+https?:\/\/.*\/documents\/BSG-7100001-512587/);
  });

  it("handles missing payload fields gracefully (no crash, just empty sections)", () => {
    const body = buildHubspotNoteBody({
      document: makeDoc({ payload: { schemaVersion: 1 } }),
      companyName: "Acme Inc"
    });
    // Header + footer still render — pricing/contract sections quietly
    // skipped because nothing in the payload to fill them.
    expect(body).toContain("BSG-7100001-512587");
    expect(body).toMatch(/View full document:/);
    expect(body).not.toContain("Payin split");
    expect(body).not.toContain("Contract terms");
  });
});

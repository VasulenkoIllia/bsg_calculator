/**
 * Phase 9.H — unit tests for the redesigned HubSpot Note body
 * builder. The builder is pure (no DB, no HTTP) so we can exercise
 * it with plain in-memory inputs.
 *
 * The expected output shape:
 *   <p>{Label} {identifier} // Company: {co} // Created {dd.MM.yyyy, HH:mm} by {actor.displayName} ({actor.email})</p>
 *   <p><a href="{absUrl}" target="_blank" rel="noopener">Link</a></p>
 *
 * The assertions focus on the SHAPE — adjacent whitespace / line
 * breaks may evolve without breaking the suite.
 */

import { describe, expect, it } from "vitest";
import {
  buildHubspotNoteBody,
  noteKindFromDocumentScope
} from "./note-builder";

const ACTOR = {
  displayName: "Admin",
  email: "admin@bsg.test"
};

describe("buildHubspotNoteBody — new one-liner format (Phase 9.H)", () => {
  it("renders Offer document with BSG number + company + actor + clickable link", () => {
    const body = buildHubspotNoteBody({
      kind: "document_offer",
      identifier: "BSG-7100001-099930",
      companyName: "(A) TEST 1",
      createdAt: new Date(Date.UTC(2026, 4, 21, 15, 40)),
      actor: ACTOR,
      detailPath: "/documents/BSG-7100001-099930"
    });
    // Header line
    expect(body).toContain("Offer BSG-7100001-099930");
    expect(body).toContain("// Company: (A) TEST 1");
    expect(body).toContain("// Created 21.05.2026, 15:40");
    expect(body).toContain("by Admin (admin@bsg.test)");
    // Clickable link. Sprint 9.L — regex stays protocol-agnostic
    // (`https?://`) so the same assertion passes against the dev
    // env (APP_PUBLIC_URL=http://localhost:5173) and prod
    // (APP_PUBLIC_URL=https://bsg.workflo.space).
    expect(body).toMatch(/<a href="https?:\/\/[^"]+\/documents\/BSG-7100001-099930"[^>]*>Link<\/a>/);
  });

  it("renders Agreement scope correctly", () => {
    const body = buildHubspotNoteBody({
      kind: "document_agreement",
      identifier: "BSG-7100002-XXXXXX",
      companyName: "Acme",
      createdAt: new Date(),
      actor: ACTOR,
      detailPath: "/documents/BSG-7100002-XXXXXX"
    });
    expect(body).toContain("Agreement BSG-7100002-XXXXXX");
  });

  it("renders Offer + Agreement label correctly", () => {
    const body = buildHubspotNoteBody({
      kind: "document_offer_and_agreement",
      identifier: "BSG-7100003-XXX",
      companyName: "Acme",
      createdAt: new Date(),
      actor: ACTOR,
      detailPath: "/documents/BSG-7100003-XXX"
    });
    expect(body).toContain("Offer + Agreement BSG-7100003-XXX");
  });

  it("renders Calculator with title identifier", () => {
    const body = buildHubspotNoteBody({
      kind: "calculator",
      identifier: "Pricing draft v2",
      companyName: "Acme",
      createdAt: new Date(),
      actor: ACTOR,
      detailPath: "/calc/abc-def"
    });
    expect(body).toContain("Calculator Pricing draft v2");
    expect(body).toMatch(/<a href="https?:\/\/[^"]+\/calc\/abc-def"[^>]*>Link<\/a>/);
  });

  it("escapes HTML special chars in company name + actor name", () => {
    const body = buildHubspotNoteBody({
      kind: "document_offer",
      identifier: "BSG-X",
      companyName: "A & <Tricky> Co",
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0)),
      actor: { displayName: 'Ivan "boss" Petrov', email: "ip@bsg" },
      detailPath: "/documents/BSG-X"
    });
    expect(body).toContain("A &amp; &lt;Tricky&gt; Co");
    expect(body).toContain("Ivan &quot;boss&quot; Petrov");
    // Make sure we didn't ALSO escape inside the URL (already encoded).
    expect(body).toMatch(/href="https?:\/\/.*\/documents\/BSG-X"/);
  });

  it("emits the standard 2-paragraph HTML structure", () => {
    const body = buildHubspotNoteBody({
      kind: "document_offer",
      identifier: "BSG-X",
      companyName: "Acme",
      createdAt: new Date(),
      actor: ACTOR,
      detailPath: "/documents/BSG-X"
    });
    // Two <p> tags expected: header + link.
    const paragraphCount = (body.match(/<p>/g) ?? []).length;
    expect(paragraphCount).toBe(2);
  });

  it("formats single-digit days/months with leading zero", () => {
    const body = buildHubspotNoteBody({
      kind: "document_offer",
      identifier: "X",
      companyName: "Y",
      createdAt: new Date(Date.UTC(2026, 0, 3, 9, 5)),
      actor: ACTOR,
      detailPath: "/documents/X"
    });
    expect(body).toContain("03.01.2026, 09:05");
  });
});

describe("noteKindFromDocumentScope", () => {
  it("maps each scope value to the matching kind", () => {
    expect(noteKindFromDocumentScope("offer")).toBe("document_offer");
    expect(noteKindFromDocumentScope("agreement")).toBe("document_agreement");
    expect(noteKindFromDocumentScope("offer_and_agreement")).toBe(
      "document_offer_and_agreement"
    );
  });
});

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentOfferStatus, OfferStatusBadge } from "./OfferStatusBadge.js";

describe("DocumentOfferStatus", () => {
  const offerPayload = { header: { documentDateIso: "2026-06-02", offerValidDays: 7 } };

  it("renders nothing for the agreement-bundle scope", () => {
    const { container } = render(
      <DocumentOfferStatus scope="offer_and_agreement" payload={offerPayload} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the payload has no readable header", () => {
    const { container } = render(<DocumentOfferStatus scope="offer" payload={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a badge with the derived valid-till date for an offer", () => {
    const { container } = render(<DocumentOfferStatus scope="offer" payload={offerPayload} />);
    // 2026-06-02 + 7 days = 09.06.2026 — shown whether valid or expired.
    expect(container.textContent).toContain("09.06.2026");
  });

  it("renders nothing for an offer with no explicit validity (old payload)", () => {
    const { container } = render(
      <DocumentOfferStatus
        scope="offer"
        payload={{ header: { documentDateIso: "2026-06-02" } }}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("OfferStatusBadge", () => {
  // Far-future / far-past document dates keep valid/expired independent of
  // the real clock so these assertions stay deterministic over time.
  it("shows a green 'Valid till' badge before the valid-till date", () => {
    const { container } = render(
      <OfferStatusBadge documentDateIso="2999-01-01" offerValidDays={15} />
    );
    const span = container.querySelector("span");
    expect(span?.textContent).toContain("Valid till");
    expect(span?.className).toContain("text-green-700");
  });

  it("shows a red 'Expired' badge past the valid-till date", () => {
    const { container } = render(
      <OfferStatusBadge documentDateIso="2000-01-01" offerValidDays={15} />
    );
    const span = container.querySelector("span");
    expect(span?.textContent).toContain("Expired");
    expect(span?.className).toContain("text-red-700");
  });
});

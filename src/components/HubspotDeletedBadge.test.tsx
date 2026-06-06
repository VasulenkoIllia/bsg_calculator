import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HubspotDeletedBadge } from "./HubspotDeletedBadge.js";

describe("HubspotDeletedBadge", () => {
  it("renders nothing when the company is live (deletedAt null)", () => {
    const { container } = render(<HubspotDeletedBadge deletedAt={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for undefined", () => {
    const { container } = render(<HubspotDeletedBadge deletedAt={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a 'Deleted in HubSpot' badge when deletedAt is set", () => {
    const { container } = render(
      <HubspotDeletedBadge deletedAt="2026-06-06T12:00:00.000Z" />
    );
    expect(container.textContent).toContain("Deleted in HubSpot");
  });
});

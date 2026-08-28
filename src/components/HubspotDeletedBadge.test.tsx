import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HubspotDeletedBadge } from "./HubspotDeletedBadge.js";

describe("HubspotDeletedBadge", () => {
  it("renders nothing when the company is live (no flag at all)", () => {
    const { container } = render(<HubspotDeletedBadge deletedAt={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for undefined", () => {
    const { container } = render(<HubspotDeletedBadge deletedAt={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the deleted badge for a HubSpot-era deletion", () => {
    // The wording is "Deleted in CRM", not "Deleted in HubSpot": the same
    // badge now covers both eras, and after the cutover a client removed
    // from monday would otherwise be labelled with the name of a system
    // that no longer exists.
    const { container } = render(
      <HubspotDeletedBadge deletedAt="2026-06-06T12:00:00.000Z" />
    );
    expect(container.textContent).toContain("Deleted in CRM");
  });

  it("renders the deleted badge for a monday-era deletion", () => {
    // `hubspotDeletedAt` is written only by the HubSpot deletion webhook
    // and freezes the moment HubSpot is switched off. Without reading
    // `crmDeletedAt` too, a client deleted in monday would look perfectly
    // live in the admin — and the purge action would be unreachable.
    const { container } = render(
      <HubspotDeletedBadge deletedAt={null} crmDeletedAt="2026-08-27T12:00:00.000Z" />
    );
    expect(container.textContent).toContain("Deleted in CRM");
  });

  it("shows a WEAKER amber badge for 'not seen on the board', not a deletion", () => {
    // Absence from a backfill is an observation, not a confirmed deletion:
    // it can also mean a paging glitch or a permissions change. It must
    // never look like — or be treated as — a deletion, because the purge
    // guard deliberately refuses to accept it.
    const { container } = render(
      <HubspotDeletedBadge deletedAt={null} missingSince="2026-08-27T12:00:00.000Z" />
    );
    expect(container.textContent).toContain("Not found in CRM");
    expect(container.textContent).not.toContain("Deleted");
  });

  it("a confirmed deletion outranks a missing-since observation", () => {
    const { container } = render(
      <HubspotDeletedBadge
        deletedAt={null}
        crmDeletedAt="2026-08-27T12:00:00.000Z"
        missingSince="2026-08-26T12:00:00.000Z"
      />
    );
    expect(container.textContent).toContain("Deleted in CRM");
    expect(container.textContent).not.toContain("Not found");
  });
});

describe("HubspotDeletedBadge — archived is not deleted", () => {
  it("shows a neutral 'Archived in CRM' badge, never 'Deleted'", () => {
    // monday reports archiving through the same signal as deletion, but
    // archiving is reversible and does NOT unlock the purge. A red
    // "Deleted" badge next to a refusing Remove button is the bug this
    // prevents.
    const { container } = render(
      <HubspotDeletedBadge
        deletedAt={null}
        crmDeletedAt="2026-08-27T12:00:00.000Z"
        crmDeletedReason="archived"
      />
    );
    expect(container.textContent).toContain("Archived in CRM");
    expect(container.textContent).not.toContain("Deleted");
  });

  it("still shows a deletion when monday reported an actual delete", () => {
    const { container } = render(
      <HubspotDeletedBadge
        deletedAt={null}
        crmDeletedAt="2026-08-27T12:00:00.000Z"
        crmDeletedReason="deleted"
      />
    );
    expect(container.textContent).toContain("Deleted in CRM");
  });

  it("a HubSpot-era deletion outranks an 'archived' reason", () => {
    // hubspotDeletedAt is only ever written by the HubSpot deletion
    // webhook — a real deletion. A stale monday reason must not downgrade
    // it to the softer badge.
    const { container } = render(
      <HubspotDeletedBadge
        deletedAt="2026-06-06T12:00:00.000Z"
        crmDeletedAt="2026-08-27T12:00:00.000Z"
        crmDeletedReason="archived"
      />
    );
    expect(container.textContent).toContain("Deleted in CRM");
  });
});

/**
 * Phase 8 Stage 4 — EventHistoryPanel rendering tests.
 *
 * Covers:
 *   - loading / error / empty / populated states
 *   - the toggle (collapsed default → expanded after click)
 *   - actor label fallbacks (system / displayName only / email only)
 *   - event-type → label + colour mapping
 *   - per-event meta inline (noteId for synced, error for sync_failed,
 *     download flag for pdf_downloaded)
 *
 * Time-sensitive helpers (`X ago`) are exercised loosely — we don't
 * fix the clock here, just assert the row renders.
 */

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EventHistoryPanel } from "./EventHistoryPanel.js";
import type { PublicEvent } from "../api/types.js";

const baseEvent: PublicEvent = {
  id: "ev-1",
  eventType: "created",
  meta: {},
  actorUserId: "u-1",
  actorDisplayName: "Alice Petrenko",
  actorEmail: "alice@bsg.test",
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString() // 5m ago
};

describe("EventHistoryPanel — collapse / expand", () => {
  it("renders collapsed by default", () => {
    render(<EventHistoryPanel events={[baseEvent]} />);
    // Header always visible.
    expect(screen.getByText(/^History/)).toBeInTheDocument();
    // Row content NOT visible while collapsed.
    expect(screen.queryByText(/^Created$/i)).toBeNull();
  });

  it("expands on header click and shows the row", () => {
    render(<EventHistoryPanel events={[baseEvent]} />);
    fireEvent.click(screen.getByRole("button", { name: /^History/i }));
    expect(screen.getByText(/^Created$/i)).toBeInTheDocument();
    expect(screen.getByText(/Alice Petrenko/)).toBeInTheDocument();
  });

  it("opens by default when defaultOpen=true", () => {
    render(<EventHistoryPanel events={[baseEvent]} defaultOpen />);
    expect(screen.getByText(/^Created$/i)).toBeInTheDocument();
  });
});

describe("EventHistoryPanel — states", () => {
  it("shows loading text", () => {
    render(<EventHistoryPanel events={[]} isLoading defaultOpen />);
    expect(screen.getByText(/Loading events…/i)).toBeInTheDocument();
  });

  it("shows error text", () => {
    render(<EventHistoryPanel events={[]} isError defaultOpen />);
    expect(screen.getByText(/Failed to load events/i)).toBeInTheDocument();
  });

  it("shows empty text when no events", () => {
    render(<EventHistoryPanel events={[]} defaultOpen />);
    expect(screen.getByText(/No events yet/i)).toBeInTheDocument();
  });
});

describe("EventHistoryPanel — actor labels", () => {
  it("renders 'system' when actorUserId is null", () => {
    render(
      <EventHistoryPanel
        events={[
          {
            ...baseEvent,
            actorUserId: null,
            actorDisplayName: null,
            actorEmail: null
          }
        ]}
        defaultOpen
      />
    );
    expect(screen.getByText("system")).toBeInTheDocument();
  });

  it("renders displayName + email when both present", () => {
    render(<EventHistoryPanel events={[baseEvent]} defaultOpen />);
    expect(
      screen.getByText("Alice Petrenko (alice@bsg.test)")
    ).toBeInTheDocument();
  });

  it("falls back to email when displayName is blank", () => {
    render(
      <EventHistoryPanel
        events={[{ ...baseEvent, actorDisplayName: "" }]}
        defaultOpen
      />
    );
    expect(screen.getByText("alice@bsg.test")).toBeInTheDocument();
  });
});

describe("EventHistoryPanel — per-event meta", () => {
  it("renders noteId on synced_to_hubspot", () => {
    render(
      <EventHistoryPanel
        events={[
          {
            ...baseEvent,
            eventType: "synced_to_hubspot",
            meta: { noteId: "12345" }
          }
        ]}
        defaultOpen
      />
    );
    expect(screen.getByText(/noteId: 12345/i)).toBeInTheDocument();
    expect(screen.getByText(/Synced to HubSpot/i)).toBeInTheDocument();
  });

  it("renders error string on sync_failed", () => {
    render(
      <EventHistoryPanel
        events={[
          {
            ...baseEvent,
            eventType: "sync_failed",
            meta: { error: "HubSpot rate-limited" }
          }
        ]}
        defaultOpen
      />
    );
    expect(screen.getByText(/error: HubSpot rate-limited/i)).toBeInTheDocument();
    expect(screen.getByText(/Sync to HubSpot failed/i)).toBeInTheDocument();
  });

  it("renders 'saved as file' / 'viewed inline' on pdf_downloaded", () => {
    render(
      <EventHistoryPanel
        events={[
          {
            ...baseEvent,
            id: "ev-saved",
            eventType: "pdf_downloaded",
            meta: { download: true }
          },
          {
            ...baseEvent,
            id: "ev-inline",
            eventType: "pdf_downloaded",
            meta: { download: false }
          }
        ]}
        defaultOpen
      />
    );
    expect(screen.getByText(/saved as file/i)).toBeInTheDocument();
    expect(screen.getByText(/viewed inline/i)).toBeInTheDocument();
  });
});

describe("EventHistoryPanel — count badge in header", () => {
  it("shows the count when there are events", () => {
    render(
      <EventHistoryPanel
        events={[baseEvent, { ...baseEvent, id: "ev-2" }]}
      />
    );
    // Collapsed header includes "(2)"
    expect(screen.getByText(/^History \(2\)/i)).toBeInTheDocument();
  });

  it("omits the count when there are zero events", () => {
    render(<EventHistoryPanel events={[]} />);
    // No parenthesised count when empty.
    expect(screen.getByText(/^History\s*$/)).toBeInTheDocument();
  });
});

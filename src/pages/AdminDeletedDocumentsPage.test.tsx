/**
 * Sprint 9.M T1 — coverage for the previously untested super_admin
 * deleted-documents page.
 *
 * Renders three states:
 *   - loading
 *   - empty (no soft-deleted docs)
 *   - populated (rows with reason + deletedAt + Open link)
 *
 * The Restore action lives on `/documents/:number` (not on this
 * page), so the only outbound action tested here is the row's
 * "Open →" link routing to the document detail.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import * as documentsApi from "../api/documents.js";
import type { PublicDocument } from "../api/types.js";
import { AdminDeletedDocumentsPage } from "./AdminDeletedDocumentsPage.js";

const baseFixture = (overrides: Partial<PublicDocument> = {}): PublicDocument => ({
  id: "doc-1",
  number: "BSG-7100024-XXXXXX",
  companyId: "co-1",
  companyName: "Acme Ltd",
  hubspotDealId: null,
  calculatorConfigId: null,
  scope: "offer",
  payload: { schemaVersion: 1 },
  addendum: null,
  hubspotSyncState: "not_synced",
  hubspotNoteId: null,
  createdByUserId: "u-1",
  deletedAt: "2026-05-20T10:00:00.000Z",
  deletedByUserId: "u-1",
  deletionReason: "duplicate",
  deletionNote: null,
  createdAt: "2026-05-15T10:00:00.000Z",
  updatedAt: "2026-05-20T10:00:00.000Z",
  ...overrides
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminDeletedDocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("AdminDeletedDocumentsPage — rendering", () => {
  it("shows the loading state initially", () => {
    vi.spyOn(documentsApi, "listDocuments").mockReturnValue(
      new Promise(() => {
        /* never resolves → stays loading */
      })
    );
    renderPage();
    expect(screen.getByText(/loading deleted documents/i)).toBeInTheDocument();
  });

  it("shows the empty state when no soft-deleted rows", async () => {
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValueOnce({
      items: [],
      nextCursor: null,
      limit: 50
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/no soft-deleted documents/i)).toBeInTheDocument();
    });
  });

  it("renders rows with reason + Open → link", async () => {
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValueOnce({
      items: [
        baseFixture({ number: "BSG-7100024-A1B2C3", deletionReason: "duplicate" }),
        baseFixture({
          id: "doc-2",
          number: "BSG-7100025-X9Y8Z7",
          deletionReason: "client_request"
        })
      ],
      nextCursor: null,
      limit: 50
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("BSG-7100024-A1B2C3")).toBeInTheDocument();
    });
    expect(screen.getByText("BSG-7100025-X9Y8Z7")).toBeInTheDocument();
    expect(screen.getByText(/^Duplicate$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Client request$/i)).toBeInTheDocument();

    const links = screen.getAllByRole("link", { name: /open →$/i });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/documents/BSG-7100024-A1B2C3");
  });

  it("calls listDocuments with includeDeleted='only'", async () => {
    const spy = vi.spyOn(documentsApi, "listDocuments").mockResolvedValueOnce({
      items: [],
      nextCursor: null,
      limit: 50
    });
    renderPage();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][0]).toMatchObject({ includeDeleted: "only" });
  });

  it("surfaces a backend error message", async () => {
    vi.spyOn(documentsApi, "listDocuments").mockRejectedValueOnce(
      Object.assign(new Error("Database unavailable"), {
        name: "ApiError",
        code: "INTERNAL_ERROR",
        status: 500
      })
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
    // Suppress unused warning for fireEvent import.
    void fireEvent;
  });

  it("indicates 'has note' breadcrumb via tooltip dot when deletionNote is set", async () => {
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValueOnce({
      items: [
        baseFixture({
          number: "BSG-7100099-XXXXXX",
          deletionNote: "Client refused to sign"
        })
      ],
      nextCursor: null,
      limit: 50
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("BSG-7100099-XXXXXX")).toBeInTheDocument();
    });
    // The "(·)" dot has a title attribute carrying the note content
    // — only visible to super_admin on hover.
    const dot = screen.getByTitle("Client refused to sign");
    expect(dot).toBeInTheDocument();
  });
});

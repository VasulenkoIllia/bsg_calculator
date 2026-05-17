/**
 * DocumentsListPage integration tests — focused on the new
 * CompanyFilter behaviour and the basic table rendering states.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import * as companiesApi from "../api/companies.js";
import * as documentsApi from "../api/documents.js";
import type { PublicCompany, PublicDocument } from "../api/types.js";
import { DocumentsListPage } from "./DocumentsListPage.js";

const fixtureCompany = (overrides: Partial<PublicCompany> = {}): PublicCompany => ({
  id: "11111111-1111-1111-1111-111111111111",
  hubspotCompanyId: "hs-co-1",
  name: "Acme",
  companyType: "direct_client",
  segmentType: "SMB",
  lifecycleStage: "customer",
  hsTaskLabel: null,
  hubspotCreatedAt: "2026-01-01T00:00:00.000Z",
  hubspotModifiedAt: "2026-05-01T00:00:00.000Z",
  lastSyncedAt: "2026-05-15T00:00:00.000Z",
  ...overrides
});

const fixtureDocument = (overrides: Partial<PublicDocument> = {}): PublicDocument => ({
  id: "22222222-2222-2222-2222-222222222222",
  number: "BSG-7100001-512587",
  companyId: "11111111-1111-1111-1111-111111111111",
  hubspotDealId: null,
  calculatorConfigId: null,
  scope: "offer",
  payload: { schemaVersion: 1 },
  addendum: null,
  hubspotSyncState: "not_synced",
  hubspotNoteId: null,
  createdByUserId: "user-1",
  createdAt: "2026-05-17T00:00:00.000Z",
  updatedAt: "2026-05-17T00:00:00.000Z",
  ...overrides
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DocumentsListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DocumentsListPage — base rendering", () => {
  it("loads and displays documents", async () => {
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValueOnce({
      items: [fixtureDocument({ number: "BSG-7100001-512587", scope: "offer" })],
      nextCursor: null,
      limit: 25
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("BSG-7100001-512587")).toBeInTheDocument();
      expect(screen.getByText("Offer")).toBeInTheDocument();
    });
  });

  it("shows empty-state copy with no filters", async () => {
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValueOnce({
      items: [],
      nextCursor: null,
      limit: 25
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no documents yet/i)).toBeInTheDocument();
    });
  });

  it("shows filter-aware empty-state when search query is active", async () => {
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue({
      items: [],
      nextCursor: null,
      limit: 25
    });

    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/BSG-71/i), {
      target: { value: "doesnotexist" }
    });

    await waitFor(() => {
      expect(
        screen.getByText(/no documents match the current filters/i)
      ).toBeInTheDocument();
    });
  });
});

describe("DocumentsListPage — CompanyFilter", () => {
  it("picks a company from typeahead suggestions and renders the chip", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [fixtureCompany({ id: "co-1", name: "Acme Inc" })],
      nextCursor: null,
      limit: 10
    });
    vi.spyOn(documentsApi, "listDocuments").mockResolvedValue({
      items: [],
      nextCursor: null,
      limit: 25
    });

    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/at least 2 letters/i), {
      target: { value: "Ac" }
    });
    await waitFor(() => screen.getByText("Acme Inc"));
    fireEvent.click(screen.getByText("Acme Inc"));

    // Chip is shown + clear button is present.
    await waitFor(() => {
      expect(screen.getByText(/× clear/i)).toBeInTheDocument();
    });
  });

  it("clearing the company filter restores the unfiltered view", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [fixtureCompany({ id: "co-1", name: "Acme Inc" })],
      nextCursor: null,
      limit: 10
    });
    const docSpy = vi.spyOn(documentsApi, "listDocuments").mockResolvedValue({
      items: [],
      nextCursor: null,
      limit: 25
    });

    renderPage();

    // Pick a company → chip appears, useDocuments re-queries with companyId.
    fireEvent.change(screen.getByPlaceholderText(/at least 2 letters/i), {
      target: { value: "Ac" }
    });
    await waitFor(() => screen.getByText("Acme Inc"));
    fireEvent.click(screen.getByText("Acme Inc"));
    await waitFor(() => screen.getByText(/× clear/i));

    // Click "× clear" → chip gone, typeahead input back.
    fireEvent.click(screen.getByText(/× clear/i));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/at least 2 letters/i)).toBeInTheDocument();
      expect(screen.queryByText(/× clear/i)).not.toBeInTheDocument();
    });

    // listDocuments was called both with and without companyId.
    const calledWithCompany = docSpy.mock.calls.some(
      ([params]) => params?.companyId === "co-1"
    );
    const calledWithoutCompany = docSpy.mock.calls.some(
      ([params]) => !params?.companyId
    );
    expect(calledWithCompany).toBe(true);
    expect(calledWithoutCompany).toBe(true);
  });
});

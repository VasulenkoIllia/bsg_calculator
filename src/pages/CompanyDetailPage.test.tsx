/**
 * CompanyDetailPage integration tests.
 *
 * Wraps the page in MemoryRouter at /companies/:id so useParams
 * resolves to the test fixture id, then stubs companies.getCompany
 * + listCompanyDeals to drive the three core scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "../api/client.js";
import * as companiesApi from "../api/companies.js";
import type { PublicCompany, PublicDeal } from "../api/types.js";
import { CompanyDetailPage } from "./CompanyDetailPage.js";

const fixtureCompany = (overrides: Partial<PublicCompany> = {}): PublicCompany => ({
  id: "11111111-1111-1111-1111-111111111111",
  hubspotCompanyId: "hs-co-1",
  name: "Acme Inc",
  companyType: "direct_client",
  segmentType: "SMB",
  lifecycleStage: "customer",
  hsTaskLabel: null,
  hubspotCreatedAt: "2026-01-01T00:00:00.000Z",
  hubspotModifiedAt: "2026-05-01T00:00:00.000Z",
  lastSyncedAt: "2026-05-15T00:00:00.000Z",
  ...overrides
});

const fixtureDeal = (overrides: Partial<PublicDeal> = {}): PublicDeal => ({
  id: "22222222-2222-2222-2222-222222222222",
  hubspotDealId: "hs-deal-1",
  hubspotCompanyId: "hs-co-1",
  name: "Phase 1 onboarding",
  stage: "appointmentscheduled",
  pipelineId: "default",
  amount: "5000",
  currency: "EUR",
  clientLabel: null,
  agentLabel: null,
  businessVertical: "iGaming",
  hubspotCreatedAt: "2026-02-01T00:00:00.000Z",
  hubspotModifiedAt: "2026-05-10T00:00:00.000Z",
  lastSyncedAt: "2026-05-15T00:00:00.000Z",
  ...overrides
});

function renderAt(id: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/companies/${id}`]}>
        <Routes>
          <Route path="/companies/:id" element={<CompanyDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(companiesApi, "getCompany").mockReset();
  vi.spyOn(companiesApi, "listCompanyDeals").mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CompanyDetailPage — header", () => {
  it("renders company info + deals once both queries resolve", async () => {
    vi.spyOn(companiesApi, "getCompany").mockResolvedValueOnce(
      fixtureCompany({ name: "Acme Inc", segmentType: "SMB", lifecycleStage: "customer" })
    );
    vi.spyOn(companiesApi, "listCompanyDeals").mockResolvedValueOnce({
      items: [fixtureDeal({ name: "Phase 1 onboarding" })],
      nextCursor: null,
      limit: 25
    });

    renderAt("11111111-1111-1111-1111-111111111111");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Acme Inc" })).toBeInTheDocument();
      expect(screen.getByText("Phase 1 onboarding")).toBeInTheDocument();
    });
    // Sanity: segment + lifecycle rendered in the dl.
    expect(screen.getByText("SMB")).toBeInTheDocument();
    expect(screen.getByText("customer")).toBeInTheDocument();
  });

  it("renders an error message when the company query fails", async () => {
    vi.spyOn(companiesApi, "getCompany").mockRejectedValueOnce(
      new ApiError("NOT_FOUND", "Company missing", 404)
    );
    vi.spyOn(companiesApi, "listCompanyDeals").mockResolvedValueOnce({
      items: [],
      nextCursor: null,
      limit: 25
    });

    renderAt("missing-id");

    await waitFor(() => {
      expect(screen.getByText(/Company missing/i)).toBeInTheDocument();
    });
  });
});

describe("CompanyDetailPage — deals table", () => {
  it("shows empty-state when no deals", async () => {
    vi.spyOn(companiesApi, "getCompany").mockResolvedValueOnce(fixtureCompany());
    vi.spyOn(companiesApi, "listCompanyDeals").mockResolvedValueOnce({
      items: [],
      nextCursor: null,
      limit: 25
    });

    renderAt("11111111-1111-1111-1111-111111111111");

    await waitFor(() => {
      expect(screen.getByText(/no deals associated/i)).toBeInTheDocument();
    });
  });

  it("paginates deals via Load more", async () => {
    vi.spyOn(companiesApi, "getCompany").mockResolvedValueOnce(fixtureCompany());
    const spy = vi
      .spyOn(companiesApi, "listCompanyDeals")
      .mockResolvedValueOnce({
        items: [fixtureDeal({ id: "d1", name: "Deal-One" })],
        nextCursor: "deal-cursor-2",
        limit: 25
      })
      .mockResolvedValueOnce({
        items: [fixtureDeal({ id: "d2", name: "Deal-Two" })],
        nextCursor: null,
        limit: 25
      });

    renderAt("11111111-1111-1111-1111-111111111111");

    await waitFor(() => {
      expect(screen.getByText("Deal-One")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /load more deals/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /load more deals/i }));

    await waitFor(() => {
      expect(screen.getByText("Deal-Two")).toBeInTheDocument();
    });
    expect(spy).toHaveBeenNthCalledWith(2, "11111111-1111-1111-1111-111111111111", {
      cursor: "deal-cursor-2"
    });
    expect(screen.queryByRole("button", { name: /load more deals/i })).not.toBeInTheDocument();
  });

  it("formats amount with currency, falls back to em-dash on null", async () => {
    vi.spyOn(companiesApi, "getCompany").mockResolvedValueOnce(fixtureCompany());
    vi.spyOn(companiesApi, "listCompanyDeals").mockResolvedValueOnce({
      items: [
        fixtureDeal({ id: "d1", name: "WithMoney", amount: "1234", currency: "EUR" }),
        fixtureDeal({ id: "d2", name: "NoMoney", amount: null, currency: null })
      ],
      nextCursor: null,
      limit: 25
    });

    renderAt("11111111-1111-1111-1111-111111111111");

    await waitFor(() => {
      expect(screen.getByText("1234 EUR")).toBeInTheDocument();
    });
    // Plain dash for null amount (single em-dash cell).
    const rows = screen.getAllByRole("row");
    const noMoneyRow = rows.find(row => row.textContent?.includes("NoMoney"));
    expect(noMoneyRow?.textContent).toContain("—");
  });
});

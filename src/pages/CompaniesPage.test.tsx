/**
 * CompaniesPage integration tests.
 *
 * Stubs the companies endpoint (not React Query itself) so the hook
 * + UI integration is exercised in full. Covers the four user-visible
 * states + the pagination interaction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "../api/client.js";
import * as companiesApi from "../api/companies.js";
import type { PublicCompany } from "../api/types.js";
import { CompaniesPage } from "./CompaniesPage.js";

const fixtureCompany = (overrides: Partial<PublicCompany> = {}): PublicCompany => ({
  id: overrides.id ?? "11111111-1111-1111-1111-111111111111",
  hubspotCompanyId: "hs-1",
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

function renderPage() {
  // Fresh QueryClient per test so cache doesn't leak between cases.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CompaniesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(companiesApi, "listCompanies").mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CompaniesPage", () => {
  it("renders a loading row, then the first page of companies", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValueOnce({
      items: [fixtureCompany({ id: "a", name: "Alpha" }), fixtureCompany({ id: "b", name: "Beta" })],
      nextCursor: null,
      limit: 25
    });

    renderPage();

    expect(screen.getByText(/loading companies/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.getByText("Beta")).toBeInTheDocument();
    });
  });

  it("renders empty-state copy when no items + no search", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValueOnce({
      items: [],
      nextCursor: null,
      limit: 25
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no companies yet/i)).toBeInTheDocument();
    });
  });

  it("renders error-state with backend message", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockRejectedValueOnce(
      new ApiError("INTERNAL", "Database is down", 500)
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Database is down/i)).toBeInTheDocument();
    });
  });

  it("debounces search input and re-queries with the trimmed q", async () => {
    const spy = vi
      .spyOn(companiesApi, "listCompanies")
      .mockResolvedValue({ items: [fixtureCompany()], nextCursor: null, limit: 25 });

    renderPage();

    // Initial call has no q.
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ q: undefined, cursor: undefined, limit: undefined });
    });

    fireEvent.change(screen.getByPlaceholderText(/name contains/i), {
      target: { value: "Al" }
    });

    // After 300ms debounce, a new query fires with q="Al".
    await waitFor(
      () => {
        const lastCall = spy.mock.calls.at(-1);
        expect(lastCall?.[0]).toMatchObject({ q: "Al" });
      },
      { timeout: 1500 }
    );
  });

  it("paginates via Load more when nextCursor is present", async () => {
    const spy = vi
      .spyOn(companiesApi, "listCompanies")
      .mockResolvedValueOnce({
        items: [fixtureCompany({ id: "p1", name: "Page1" })],
        nextCursor: "cursor-2",
        limit: 25
      })
      .mockResolvedValueOnce({
        items: [fixtureCompany({ id: "p2", name: "Page2" })],
        nextCursor: null,
        limit: 25
      });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Page1")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => {
      expect(screen.getByText("Page2")).toBeInTheDocument();
    });
    // Second call carried the cursor returned by the first.
    expect(spy).toHaveBeenNthCalledWith(2, {
      q: undefined,
      cursor: "cursor-2",
      limit: undefined
    });
    // No further Load more button — we exhausted the chain.
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });
});

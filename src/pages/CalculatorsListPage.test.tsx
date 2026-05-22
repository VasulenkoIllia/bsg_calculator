/**
 * CalculatorsListPage tests — Sprint 6.7 audit C2 closure.
 *
 * Covers the rendering branches that the page itself owns:
 *   - initial loading state
 *   - empty state (no configs at all)
 *   - empty state when a search query has no match
 *   - populated state (rows with title + company link + Open link)
 *   - error state from listCalculatorConfigs
 *   - search-by-title debounces and triggers a refetch with `?q=`
 *
 * Backend wire-through (Sprint 6.6 ?q= filter, cross-company mode)
 * is covered by the server-side integration test in
 * server/tests/calculator-configs.integration.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import * as configsApi from "../api/calculator-configs.js";
import * as authApi from "../api/auth.js";
import { ApiError } from "../api/client.js";
import { AuthProvider } from "../contexts/AuthContext.js";
import type { PublicCalculatorConfig } from "../api/types.js";
import { CalculatorsListPage } from "./CalculatorsListPage.js";

const fixtureConfig = (
  overrides: Partial<PublicCalculatorConfig> = {}
): PublicCalculatorConfig => ({
  id: "cfg-1",
  companyId: "11111111-1111-1111-1111-111111111111",
  hubspotDealId: null,
  title: "Q1 onboarding draft",
  payload: { schemaVersion: 1 },
  createdByUserId: "user-1",
  createdAt: "2026-05-17T00:00:00.000Z",
  updatedAt: "2026-05-17T00:00:00.000Z",
  hubspotNoteId: null,
  hubspotSyncState: "not_synced",
  ...overrides
});

function renderPage() {
  // Sprint 9.R — page now reads useAuth().hasRole to hide
  // "+ New calculator" for read-only users. Default: cold-boot
  // refresh 401s (logged-out), so hasRole returns false. Individual
  // tests can override the refresh+me mocks to flip into "admin
  // logged-in" mode when they assert on the button being visible.
  vi.spyOn(authApi, "refresh").mockRejectedValue(
    new ApiError("AUTH_INVALID", "no", 401)
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <CalculatorsListPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CalculatorsListPage — base rendering", () => {
  it("renders the loading row before data arrives", () => {
    // Promise that never resolves → loading state stays visible.
    vi.spyOn(configsApi, "listCalculatorConfigs").mockReturnValue(
      new Promise(() => {
        /* intentionally never resolves */
      })
    );
    renderPage();
    expect(screen.getByText(/loading saved calculators/i)).toBeInTheDocument();
  });

  it("shows the 'no calculators yet' empty state when the API returns []", async () => {
    vi.spyOn(configsApi, "listCalculatorConfigs").mockResolvedValueOnce({
      items: [],
      nextCursor: null,
      limit: 25
    });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/no saved calculators yet/i)
      ).toBeInTheDocument();
    });
  });

  it("renders rows for each returned config (title + Open link)", async () => {
    vi.spyOn(configsApi, "listCalculatorConfigs").mockResolvedValueOnce({
      items: [
        fixtureConfig({ id: "cfg-a", title: "Alpha pricing" }),
        fixtureConfig({ id: "cfg-b", title: "Beta pricing" })
      ],
      nextCursor: null,
      limit: 25
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Alpha pricing")).toBeInTheDocument();
      expect(screen.getByText("Beta pricing")).toBeInTheDocument();
    });
    // Both rows expose an "Open →" link routing to /calc/:id.
    const openLinks = screen.getAllByRole("link", { name: /open →$/i });
    expect(openLinks).toHaveLength(2);
    expect(openLinks[0]).toHaveAttribute("href", "/calc/cfg-a");
    expect(openLinks[1]).toHaveAttribute("href", "/calc/cfg-b");
  });

  it("falls back to '(untitled)' when title is null", async () => {
    vi.spyOn(configsApi, "listCalculatorConfigs").mockResolvedValueOnce({
      items: [fixtureConfig({ title: null })],
      nextCursor: null,
      limit: 25
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/\(untitled\)/i)).toBeInTheDocument();
    });
  });

  it("surfaces a backend error message", async () => {
    vi.spyOn(configsApi, "listCalculatorConfigs").mockRejectedValueOnce(
      Object.assign(new Error("Database unavailable"), {
        name: "ApiError",
        code: "INTERNAL_ERROR",
        status: 500
      })
    );
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/failed to load calculators/i)
      ).toBeInTheDocument();
    });
  });
});

describe("CalculatorsListPage — search", () => {
  it("typing in the search input triggers a refetch with ?q=", async () => {
    const spy = vi
      .spyOn(configsApi, "listCalculatorConfigs")
      .mockResolvedValue({ items: [], nextCursor: null, limit: 25 });

    renderPage();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    // First call (initial mount) had no q.
    expect(spy.mock.calls[0][0]).toMatchObject({ q: undefined });

    fireEvent.change(
      screen.getByPlaceholderText(/search by title/i),
      { target: { value: "alpha" } }
    );

    // The debounce on the search input is 300ms; waitFor polls long
    // enough to see the refetch fire with the new q.
    await waitFor(
      () => {
        const lastCall = spy.mock.calls[spy.mock.calls.length - 1][0];
        expect(lastCall).toMatchObject({ q: "alpha" });
      },
      { timeout: 1_000 }
    );
  });

  it("renders the 'no match' empty state when the query returns []", async () => {
    const spy = vi
      .spyOn(configsApi, "listCalculatorConfigs")
      .mockResolvedValue({ items: [], nextCursor: null, limit: 25 });
    renderPage();
    await waitFor(() => expect(spy).toHaveBeenCalled());

    fireEvent.change(
      screen.getByPlaceholderText(/search by title/i),
      { target: { value: "doesnotexist" } }
    );

    await waitFor(
      () => {
        expect(
          screen.getByText(/no saved calculators match "doesnotexist"/i)
        ).toBeInTheDocument();
      },
      { timeout: 1_000 }
    );
  });
});

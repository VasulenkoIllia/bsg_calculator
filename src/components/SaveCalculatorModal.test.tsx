/**
 * SaveCalculatorModal integration tests.
 *
 * Stubs the listCompanies + listCompanyDeals + createCalculatorConfig
 * endpoints so the typeahead + dependent dropdown + POST flow is
 * exercised end-to-end through TanStack Query.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "../api/client.js";
import * as calculatorConfigsApi from "../api/calculator-configs.js";
import * as companiesApi from "../api/companies.js";
import { SaveCalculatorModal } from "./SaveCalculatorModal.js";
import type { PublicCompany, PublicDeal } from "../api/types.js";

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
  hubspotDeletedAt: null,
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

const samplePayload = { schemaVersion: 1, _note: "test" };

function renderModal(props: Partial<React.ComponentProps<typeof SaveCalculatorModal>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  const defaults: React.ComponentProps<typeof SaveCalculatorModal> = {
    open: true,
    onClose: vi.fn(),
    payload: samplePayload,
    onSaved: vi.fn()
  };
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <SaveCalculatorModal {...defaults} {...props} />
      </QueryClientProvider>
    ),
    props: { ...defaults, ...props }
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SaveCalculatorModal — rendering", () => {
  it("renders nothing when open=false", () => {
    const { container } = renderModal({ open: false });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders the form when open=true", () => {
    renderModal();
    expect(screen.getByRole("heading", { name: /save calculator/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/company/i)).toBeInTheDocument();
    // Save disabled until a company is selected.
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });
});

describe("SaveCalculatorModal — company typeahead", () => {
  it("shows suggestions after typing ≥ 2 chars", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [fixtureCompany({ name: "Acme Inc" }), fixtureCompany({ id: "id-2", name: "Acme Holdings" })],
      nextCursor: null,
      limit: 10
    });

    renderModal();
    fireEvent.change(screen.getByPlaceholderText(/click to browse/i), {
      target: { value: "Ac" }
    });

    await waitFor(() => {
      expect(screen.getByText("Acme Inc")).toBeInTheDocument();
      expect(screen.getByText("Acme Holdings")).toBeInTheDocument();
    });
  });

  it("clicking a suggestion selects the company + loads its deals", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [fixtureCompany()],
      nextCursor: null,
      limit: 10
    });
    vi.spyOn(companiesApi, "listCompanyDeals").mockResolvedValue({
      items: [fixtureDeal()],
      nextCursor: null,
      limit: 25
    });

    renderModal();
    fireEvent.change(screen.getByPlaceholderText(/click to browse/i), {
      target: { value: "Ac" }
    });
    await waitFor(() => screen.getByText("Acme Inc"));
    fireEvent.mouseDown(screen.getByText("Acme Inc"));

    await waitFor(() => {
      // Selected company chip is shown
      expect(screen.getByRole("button", { name: /change/i })).toBeInTheDocument();
      // Deals dropdown rendered
      expect(screen.getByText(/phase 1 onboarding/i)).toBeInTheDocument();
    });
  });
});

describe("SaveCalculatorModal — submit", () => {
  it("POSTs companyId + null deal when no deal selected", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [fixtureCompany()],
      nextCursor: null,
      limit: 10
    });
    vi.spyOn(companiesApi, "listCompanyDeals").mockResolvedValue({
      items: [fixtureDeal()],
      nextCursor: null,
      limit: 25
    });
    const createSpy = vi.spyOn(calculatorConfigsApi, "createCalculatorConfig").mockResolvedValue({
      id: "config-id-1",
      companyId: "11111111-1111-1111-1111-111111111111",
      hubspotDealId: null,
      title: null,
      payload: samplePayload,
      createdByUserId: "user-id",
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
      hubspotNoteId: null,
      hubspotSyncState: "not_synced" as const
    });

    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderModal({ onClose, onSaved });

    fireEvent.change(screen.getByPlaceholderText(/click to browse/i), {
      target: { value: "Ac" }
    });
    await waitFor(() => screen.getByText("Acme Inc"));
    fireEvent.mouseDown(screen.getByText("Acme Inc"));
    await waitFor(() => screen.getByRole("button", { name: /change/i }));

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        companyId: "11111111-1111-1111-1111-111111111111",
        hubspotDealId: null,
        title: null,
        payload: samplePayload
      });
      expect(onSaved).toHaveBeenCalledWith("config-id-1");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("includes the selected deal in the POST body", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [fixtureCompany()],
      nextCursor: null,
      limit: 10
    });
    vi.spyOn(companiesApi, "listCompanyDeals").mockResolvedValue({
      items: [fixtureDeal({ hubspotDealId: "deal-X" })],
      nextCursor: null,
      limit: 25
    });
    const createSpy = vi.spyOn(calculatorConfigsApi, "createCalculatorConfig").mockResolvedValue({
      id: "cfg-2",
      companyId: "11111111-1111-1111-1111-111111111111",
      hubspotDealId: "deal-X",
      title: "T1",
      payload: samplePayload,
      createdByUserId: "u",
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
      hubspotNoteId: null,
      hubspotSyncState: "not_synced" as const
    });

    renderModal();

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "T1" } });
    fireEvent.change(screen.getByPlaceholderText(/click to browse/i), {
      target: { value: "Ac" }
    });
    await waitFor(() => screen.getByText("Acme Inc"));
    fireEvent.mouseDown(screen.getByText("Acme Inc"));
    await waitFor(() => screen.getByText(/phase 1 onboarding/i));

    fireEvent.change(screen.getByLabelText(/^deal/i), { target: { value: "deal-X" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ hubspotDealId: "deal-X", title: "T1" })
      );
    });
  });

  it("renders ApiError message on backend failure", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [fixtureCompany()],
      nextCursor: null,
      limit: 10
    });
    vi.spyOn(companiesApi, "listCompanyDeals").mockResolvedValue({
      items: [],
      nextCursor: null,
      limit: 25
    });
    vi.spyOn(calculatorConfigsApi, "createCalculatorConfig").mockRejectedValue(
      new ApiError("VALIDATION_FAILED", "Cross-company deal reference", 400)
    );

    renderModal();
    fireEvent.change(screen.getByPlaceholderText(/click to browse/i), {
      target: { value: "Ac" }
    });
    await waitFor(() => screen.getByText("Acme Inc"));
    fireEvent.mouseDown(screen.getByText("Acme Inc"));
    await waitFor(() => screen.getByRole("button", { name: /change/i }));

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/cross-company/i);
    });
  });
});

describe("SaveCalculatorModal — close", () => {
  it("Cancel calls onClose without saving", () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

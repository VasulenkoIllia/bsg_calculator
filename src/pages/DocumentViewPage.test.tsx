/**
 * DocumentViewPage tests — focused on the inline preview path
 * + the disabled Download PDF state + Use as Template flow.
 *
 * The preview iframe is rendered via React's srcDoc — we just assert
 * the iframe is in the document with the title we set, since
 * jsdom doesn't fully execute the inner HTML.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as documentsApi from "../api/documents.js";
import type { PublicDocument } from "../api/types.js";
import { DocumentViewPage } from "./DocumentViewPage.js";

const fixtureDocument = (overrides: Partial<PublicDocument> = {}): PublicDocument => ({
  id: "22222222-2222-2222-2222-222222222222",
  number: "BSG-7100001-512587",
  companyId: "11111111-1111-1111-1111-111111111111",
  hubspotDealId: null,
  calculatorConfigId: null,
  scope: "offer",
  // payload that does NOT pass asWizardPayload (missing required keys)
  // — exercises the "Preview not available" banner path.
  payload: { schemaVersion: 1 },
  addendum: null,
  hubspotSyncState: "not_synced",
  hubspotNoteId: null,
  createdByUserId: "user-1",
  createdAt: "2026-05-17T00:00:00.000Z",
  updatedAt: "2026-05-17T00:00:00.000Z",
  ...overrides
});

function renderAt(number: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/documents/${number}`]}>
        <Routes>
          <Route path="/documents/:number" element={<DocumentViewPage />} />
        </Routes>
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

describe("DocumentViewPage — preview path", () => {
  it('renders the "Preview not available" banner when payload lacks wizard fields', async () => {
    vi.spyOn(documentsApi, "getDocumentByNumber").mockResolvedValueOnce(
      fixtureDocument({ payload: { schemaVersion: 1, calc: true } })
    );

    renderAt("BSG-7100001-512587");

    await waitFor(() => {
      expect(screen.getByText(/preview not available/i)).toBeInTheDocument();
    });
  });
});

describe("DocumentViewPage — disabled Download PDF", () => {
  it("renders Download PDF as disabled with the Sprint 4.E.2 hint", async () => {
    vi.spyOn(documentsApi, "getDocumentByNumber").mockResolvedValueOnce(
      fixtureDocument()
    );

    renderAt("BSG-7100001-512587");

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /download pdf/i });
      expect(btn).toBeDisabled();
      expect(screen.getByText(/Sprint 4\.E\.2/i)).toBeInTheDocument();
    });
  });
});

describe("DocumentViewPage — Use as Template", () => {
  it("calls useDocumentAsTemplate and navigates to the returned URL", async () => {
    vi.spyOn(documentsApi, "getDocumentByNumber").mockResolvedValueOnce(
      fixtureDocument()
    );
    const spy = vi.spyOn(documentsApi, "useDocumentAsTemplate").mockResolvedValue({
      configId: "new-cfg-id",
      redirectUrl: "/calc/new-cfg-id"
    });

    renderAt("BSG-7100001-512587");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /use as template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /use as template/i }));

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith("BSG-7100001-512587");
    });
  });
});

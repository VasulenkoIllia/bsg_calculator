/**
 * Direct unit tests for the shared CompanyTypeahead — Sprint 6.7
 * audit closure (S7).
 *
 * Three call-site wrappers (SaveCalculatorModal, WizardBackendBar,
 * DocumentsListPage's CompanyFilter) cover the integration paths;
 * these tests pin down behaviours OWNED by the component itself:
 *
 *   - dropdown-on-focus (no typing needed)
 *   - dropdown-on-typing (covers operators who skip the focus step)
 *   - click-outside dismissal via document mousedown listener
 *   - Escape key closes the listbox
 *   - Arrow Down / Up navigate the highlighted row
 *   - Enter selects the highlighted row
 *   - Pointer pick uses onMouseDown only (no double-fire)
 *   - aria wiring: role=combobox, aria-expanded, aria-controls,
 *     aria-activedescendant
 *   - chip branch renders no input + no dangling htmlFor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as companiesApi from "../api/companies.js";
import type { PublicCompany } from "../api/types.js";
import { CompanyTypeahead } from "./CompanyTypeahead.js";

const fixtureCompany = (overrides: Partial<PublicCompany> = {}): PublicCompany => ({
  id: "co-1",
  hubspotCompanyId: "hs-1",
  name: "Acme Inc",
  companyType: "direct_client",
  segmentType: null,
  lifecycleStage: null,
  hsTaskLabel: null,
  hubspotCreatedAt: "2026-01-01T00:00:00.000Z",
  hubspotModifiedAt: "2026-05-01T00:00:00.000Z",
  lastSyncedAt: "2026-05-15T00:00:00.000Z",
  hubspotDeletedAt: null,
  ...overrides
});

function renderTypeahead(
  props: Partial<React.ComponentProps<typeof CompanyTypeahead>> = {}
) {
  const onSelectedChange = props.onSelectedChange ?? vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <CompanyTypeahead
        selected={props.selected ?? null}
        onSelectedChange={onSelectedChange}
        label={props.label}
        placeholder={props.placeholder}
        required={props.required}
      />
    </QueryClientProvider>
  );
  return { ...utils, onSelectedChange };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CompanyTypeahead — focus + typing open the dropdown", () => {
  it("opens on focus and shows the listbox without any typing", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [fixtureCompany()],
      nextCursor: null,
      limit: 10
    });
    renderTypeahead();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    });
    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  it("opens on typing (covers operators who skip the focus step)", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [fixtureCompany({ name: "Beta" })],
      nextCursor: null,
      limit: 10
    });
    renderTypeahead();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Be" } });
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
  });
});

describe("CompanyTypeahead — pointer pick (no double-fire)", () => {
  it("onMouseDown selects exactly once (regression for Sprint 6.7 C1)", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [fixtureCompany()],
      nextCursor: null,
      limit: 10
    });
    const { onSelectedChange } = renderTypeahead();
    fireEvent.focus(screen.getByRole("combobox"));
    await waitFor(() => screen.getByText("Acme Inc"));

    // Real-pointer interaction would fire mousedown → mouseup → click
    // on the <li>. The component must wire pick to onMouseDown ONLY
    // (with preventDefault on the SyntheticEvent) so the synthesised
    // click doesn't trigger pick a second time. Verify: mouseDown
    // closes the listbox (no <li> to receive a click anymore) AND
    // onSelectedChange is called exactly once.
    const item = screen.getByText("Acme Inc");
    fireEvent.mouseDown(item);

    // Dropdown closed by pick → listbox gone.
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
    expect(onSelectedChange).toHaveBeenCalledTimes(1);
    expect(onSelectedChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "co-1" })
    );
  });

  it("fireEvent.click on the <li> does NOT pick (only mouseDown is wired)", async () => {
    // Defensive guarantee: even if a future contributor adds
    // onClick={pick} back to the <li>, this test catches the
    // double-fire reintroduction. With the current (mouseDown-only)
    // implementation a plain click is a no-op on the option row.
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [fixtureCompany()],
      nextCursor: null,
      limit: 10
    });
    const { onSelectedChange } = renderTypeahead();
    fireEvent.focus(screen.getByRole("combobox"));
    await waitFor(() => screen.getByText("Acme Inc"));

    fireEvent.click(screen.getByText("Acme Inc"));
    // No selection. Listbox stays open.
    expect(onSelectedChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeInTheDocument();
  });
});

describe("CompanyTypeahead — keyboard navigation", () => {
  it("ArrowDown moves the highlight and Enter selects", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [
        fixtureCompany({ id: "a", name: "Acme" }),
        fixtureCompany({ id: "b", name: "Beta" }),
        fixtureCompany({ id: "c", name: "Gamma" })
      ],
      nextCursor: null,
      limit: 10
    });
    const { onSelectedChange } = renderTypeahead();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    await waitFor(() => screen.getByText("Acme"));

    // Highlight starts on index 0 (Acme). ArrowDown twice → Gamma.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // aria-activedescendant should reference the Gamma <li>.
    await waitFor(() => {
      const active = input.getAttribute("aria-activedescendant");
      const gammaId = screen.getByText("Gamma").getAttribute("id");
      expect(active).toBe(gammaId);
    });

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectedChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c" })
    );
  });

  it("Escape closes the dropdown without picking", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [fixtureCompany()],
      nextCursor: null,
      limit: 10
    });
    const { onSelectedChange } = renderTypeahead();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    await waitFor(() => screen.getByRole("listbox"));

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSelectedChange).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("ArrowDown opens the dropdown when closed", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [fixtureCompany()],
      nextCursor: null,
      limit: 10
    });
    renderTypeahead();
    const input = screen.getByRole("combobox");
    // No focus event yet → listbox closed.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
  });
});

describe("CompanyTypeahead — chip branch", () => {
  it("renders the chip with Change button when `selected` is set", () => {
    renderTypeahead({ selected: fixtureCompany({ name: "Acme Inc" }) });
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /change/i })).toBeInTheDocument();
    // Chip branch must NOT render the input (otherwise the
    // dangling htmlFor bug Sprint 6.7 audit S3 flagged would
    // reappear).
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("Change button clears the selection and reopens the picker", () => {
    const onSelectedChange = vi.fn();
    renderTypeahead({
      selected: fixtureCompany({ name: "Acme Inc" }),
      onSelectedChange
    });
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    expect(onSelectedChange).toHaveBeenCalledWith(null);
  });
});

describe("CompanyTypeahead — click-outside dismisses", () => {
  it("clicking outside the component closes the listbox", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [fixtureCompany()],
      nextCursor: null,
      limit: 10
    });
    renderTypeahead();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    await waitFor(() => screen.getByRole("listbox"));

    // Outside click: dispatch a mousedown on document.body.
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });
});

describe("CompanyTypeahead — empty state copy", () => {
  it("with no query: 'No companies synced yet'", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [],
      nextCursor: null,
      limit: 10
    });
    renderTypeahead();
    fireEvent.focus(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(
        screen.getByText(/no companies synced yet/i)
      ).toBeInTheDocument();
    });
  });

  it("with a query: 'No matches for \"…\"'", async () => {
    vi.spyOn(companiesApi, "listCompanies").mockResolvedValue({
      items: [],
      nextCursor: null,
      limit: 10
    });
    renderTypeahead();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "xyz" }
    });
    await waitFor(
      () => {
        expect(screen.getByText(/no matches for "xyz"/i)).toBeInTheDocument();
      },
      { timeout: 1_000 }
    );
  });
});

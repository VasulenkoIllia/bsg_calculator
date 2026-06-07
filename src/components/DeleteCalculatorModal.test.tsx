/**
 * Cycle 2 — DeleteCalculatorModal tests (parity with
 * DeleteDocumentModal.test).
 *
 * Covers:
 *   - reason dropdown + note textarea render
 *   - 'Other' reason requires a non-empty note (client-side guard)
 *   - successful delete fires the onDeleted callback with reason + note
 *   - 409 / 502 errors surface inline without closing the modal
 *   - hasHubspotNote prop changes the warning copy
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "../api/client.js";
import * as configsApi from "../api/calculator-configs.js";
import { DeleteCalculatorModal } from "./DeleteCalculatorModal.js";

const FIXTURE_ID = "cfg-7f3a";

function mountModal(
  props: Partial<React.ComponentProps<typeof DeleteCalculatorModal>> = {}
) {
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  const utils = render(
    <DeleteCalculatorModal
      open
      calculatorId={FIXTURE_ID}
      calculatorTitle="Q1 pricing"
      hasHubspotNote
      onClose={onClose}
      onDeleted={onDeleted}
      {...props}
    />
  );
  return { ...utils, onClose, onDeleted };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("DeleteCalculatorModal — rendering", () => {
  it("renders with default 'client_request' reason + the title", () => {
    mountModal();
    expect(
      screen.getByRole("heading", { name: /Delete calculator/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Q1 pricing/)).toBeInTheDocument();
    const select = screen.getByLabelText(/^Reason/);
    expect((select as HTMLSelectElement).value).toBe("client_request");
  });

  it("shows the HubSpot warning when hasHubspotNote=true", () => {
    mountModal({ hasHubspotNote: true });
    expect(
      screen.getByText(/HubSpot Note will be PERMANENTLY deleted/i)
    ).toBeInTheDocument();
  });

  it("hides the HubSpot warning when hasHubspotNote=false", () => {
    mountModal({ hasHubspotNote: false });
    expect(screen.getByText(/No HubSpot Note is linked/i)).toBeInTheDocument();
  });

  it("falls back to (untitled) when title is null", () => {
    mountModal({ calculatorTitle: null });
    expect(screen.getByText(/\(untitled\)/)).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    mountModal({ open: false });
    expect(screen.queryByText(/Delete calculator/i)).toBeNull();
  });
});

describe("DeleteCalculatorModal — submit flow", () => {
  it("calls deleteCalculatorConfig with reason + note and fires onDeleted", async () => {
    const spy = vi
      .spyOn(configsApi, "deleteCalculatorConfig")
      .mockResolvedValueOnce(
        {} as Awaited<ReturnType<typeof configsApi.deleteCalculatorConfig>>
      );

    const { onDeleted } = mountModal();
    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "duplicate" }
    });
    fireEvent.change(screen.getByLabelText(/^Note/), {
      target: { value: "Superseded draft" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^Delete calculator$/i }));

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(FIXTURE_ID, {
        reason: "duplicate",
        note: "Superseded draft"
      });
    });
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("passes note=null when the textarea is empty", async () => {
    const spy = vi
      .spyOn(configsApi, "deleteCalculatorConfig")
      .mockResolvedValueOnce(
        {} as Awaited<ReturnType<typeof configsApi.deleteCalculatorConfig>>
      );

    mountModal();
    fireEvent.click(screen.getByRole("button", { name: /^Delete calculator$/i }));

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(FIXTURE_ID, {
        reason: "client_request",
        note: null
      });
    });
  });

  it("rejects 'other' reason without note (client-side guard)", async () => {
    const spy = vi.spyOn(configsApi, "deleteCalculatorConfig");
    mountModal();
    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "other" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^Delete calculator$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Note is required when reason is 'Other'/i)
      ).toBeInTheDocument();
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("DeleteCalculatorModal — server errors", () => {
  it("surfaces CALC_ALREADY_DELETED inline", async () => {
    vi.spyOn(configsApi, "deleteCalculatorConfig").mockRejectedValueOnce(
      new ApiError("CALC_ALREADY_DELETED", "already deleted", 409)
    );
    mountModal();
    fireEvent.click(screen.getByRole("button", { name: /^Delete calculator$/i }));

    await waitFor(() => {
      expect(screen.getByText(/already been deleted/i)).toBeInTheDocument();
    });
  });

  it("surfaces HUBSPOT_UNREACHABLE with retry hint", async () => {
    vi.spyOn(configsApi, "deleteCalculatorConfig").mockRejectedValueOnce(
      new ApiError("HUBSPOT_UNREACHABLE", "upstream", 502)
    );
    mountModal();
    fireEvent.click(screen.getByRole("button", { name: /^Delete calculator$/i }));

    await waitFor(() => {
      expect(screen.getByText(/HubSpot is unreachable/i)).toBeInTheDocument();
    });
  });
});

/**
 * Phase 8 Stage 5 — DeleteDocumentModal tests.
 *
 * Covers:
 *   - reason dropdown + note textarea render
 *   - 'Other' reason requires a non-empty note (client-side guard)
 *   - successful delete fires the onDeleted callback
 *   - 409 / 502 errors surface inline without closing the modal
 *   - hasHubspotNote prop changes the warning copy
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "../api/client.js";
import * as documentsApi from "../api/documents.js";
import { DeleteDocumentModal } from "./DeleteDocumentModal.js";

const FIXTURE_NUMBER = "BSG-7100001-512587";

function mountModal(props: Partial<React.ComponentProps<typeof DeleteDocumentModal>> = {}) {
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  const utils = render(
    <DeleteDocumentModal
      open
      documentNumber={FIXTURE_NUMBER}
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

describe("DeleteDocumentModal — rendering", () => {
  it("renders with default 'client_request' reason selected", () => {
    mountModal();
    expect(screen.getByText(/Delete document BSG-7100001-512587/i)).toBeInTheDocument();
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
    expect(
      screen.getByText(/No HubSpot Note is linked/i)
    ).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    mountModal({ open: false });
    expect(screen.queryByText(/Delete document/i)).toBeNull();
  });
});

describe("DeleteDocumentModal — submit flow", () => {
  it("calls deleteDocument with the chosen reason + note and fires onDeleted", async () => {
    const spy = vi
      .spyOn(documentsApi, "deleteDocument")
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof documentsApi.deleteDocument>>);

    const { onDeleted } = mountModal();
    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "duplicate" }
    });
    fireEvent.change(screen.getByLabelText(/^Note/), {
      target: { value: "Same as BSG-7100002-XX" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^Delete document$/i }));

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(FIXTURE_NUMBER, {
        reason: "duplicate",
        note: "Same as BSG-7100002-XX"
      });
    });
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("passes note=null when the textarea is empty", async () => {
    const spy = vi
      .spyOn(documentsApi, "deleteDocument")
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof documentsApi.deleteDocument>>);

    mountModal();
    fireEvent.click(screen.getByRole("button", { name: /^Delete document$/i }));

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(FIXTURE_NUMBER, {
        reason: "client_request",
        note: null
      });
    });
  });

  it("rejects 'other' reason without note (client-side guard)", async () => {
    const spy = vi.spyOn(documentsApi, "deleteDocument");
    mountModal();
    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "other" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^Delete document$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Note is required when reason is 'Other'/i)
      ).toBeInTheDocument();
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("DeleteDocumentModal — server errors", () => {
  it("surfaces DOCUMENT_ALREADY_DELETED inline", async () => {
    vi.spyOn(documentsApi, "deleteDocument").mockRejectedValueOnce(
      new ApiError("DOCUMENT_ALREADY_DELETED", "already deleted", 409)
    );
    mountModal();
    fireEvent.click(screen.getByRole("button", { name: /^Delete document$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/already been deleted/i)
      ).toBeInTheDocument();
    });
  });

  it("surfaces HUBSPOT_UNREACHABLE with retry hint", async () => {
    vi.spyOn(documentsApi, "deleteDocument").mockRejectedValueOnce(
      new ApiError("HUBSPOT_UNREACHABLE", "upstream", 502)
    );
    mountModal();
    fireEvent.click(screen.getByRole("button", { name: /^Delete document$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/HubSpot is unreachable/i)
      ).toBeInTheDocument();
    });
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog.js";

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ConfirmDialog open={false} title="t" message="m" onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders title + message + buttons when open", () => {
    render(
      <ConfirmDialog
        open
        title="Sync again to HubSpot?"
        message="This creates a new HubSpot Note."
        confirmLabel="Sync again"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("Sync again to HubSpot?")).toBeTruthy();
    expect(screen.getByText("This creates a new HubSpot Note.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sync again/ })).toBeTruthy();
  });

  it("calls onConfirm and onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="t"
        message="m"
        confirmLabel="Go"
        cancelLabel="Stop"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

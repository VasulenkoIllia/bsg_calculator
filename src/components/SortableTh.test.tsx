/**
 * Unit tests for SortableTh — Sprint 6.8.
 *
 * Covers:
 *   - Click cycles asc ↔ desc on the active column.
 *   - Click on an inactive column activates it as asc (the
 *     "show me from A first" default).
 *   - aria-sort reflects the current state (none / ascending /
 *     descending) for screen-reader users.
 *   - Inactive columns render the dim dash indicator.
 *   - Active columns render the solid triangle indicator.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SortableTh, type SortDirection } from "./SortableTh.js";

type Field = "name" | "created";

function setup({
  field = "name",
  activeField = "name",
  activeDirection = "asc"
}: {
  field?: Field;
  activeField?: Field;
  activeDirection?: SortDirection;
} = {}) {
  const onSortChange = vi.fn<(f: Field, d: SortDirection) => void>();
  // Sortable th must live inside a table for aria-sort to be valid;
  // wrap in a table/thead/tr so the rendered DOM passes a11y checks
  // and screen-readers see the expected scope.
  render(
    <table>
      <thead>
        <tr>
          <SortableTh
            field={field}
            activeField={activeField}
            activeDirection={activeDirection}
            onSortChange={onSortChange}
          >
            Header
          </SortableTh>
        </tr>
      </thead>
      <tbody />
    </table>
  );
  return { onSortChange };
}

describe("SortableTh", () => {
  it("renders the label as a clickable button", () => {
    setup();
    const button = screen.getByRole("button", { name: /header/i });
    expect(button).toBeInTheDocument();
  });

  it("sets aria-sort='ascending' on the active column when direction is asc", () => {
    setup({ activeDirection: "asc" });
    const th = screen.getByRole("columnheader");
    expect(th).toHaveAttribute("aria-sort", "ascending");
  });

  it("sets aria-sort='descending' on the active column when direction is desc", () => {
    setup({ activeDirection: "desc" });
    const th = screen.getByRole("columnheader");
    expect(th).toHaveAttribute("aria-sort", "descending");
  });

  it("sets aria-sort='none' on the inactive column", () => {
    setup({ field: "created", activeField: "name" });
    const th = screen.getByRole("columnheader");
    expect(th).toHaveAttribute("aria-sort", "none");
  });

  it("click on an inactive column activates it as 'asc'", () => {
    const { onSortChange } = setup({ field: "created", activeField: "name" });
    fireEvent.click(screen.getByRole("button", { name: /header/i }));
    expect(onSortChange).toHaveBeenCalledTimes(1);
    expect(onSortChange).toHaveBeenCalledWith("created", "asc");
  });

  it("click on the active column while asc → flips to desc", () => {
    const { onSortChange } = setup({
      field: "name",
      activeField: "name",
      activeDirection: "asc"
    });
    fireEvent.click(screen.getByRole("button", { name: /header/i }));
    expect(onSortChange).toHaveBeenCalledWith("name", "desc");
  });

  it("click on the active column while desc → flips back to asc", () => {
    const { onSortChange } = setup({
      field: "name",
      activeField: "name",
      activeDirection: "desc"
    });
    fireEvent.click(screen.getByRole("button", { name: /header/i }));
    expect(onSortChange).toHaveBeenCalledWith("name", "asc");
  });

  it("active column shows the ▲ solid indicator when asc", () => {
    setup({ activeDirection: "asc" });
    // The button label is "Header ▲" once the indicator renders.
    const button = screen.getByRole("button", { name: /header/i });
    expect(button.textContent).toContain("▲");
  });

  it("active column shows the ▼ solid indicator when desc", () => {
    setup({ activeDirection: "desc" });
    const button = screen.getByRole("button", { name: /header/i });
    expect(button.textContent).toContain("▼");
  });

  it("inactive column shows the dim ↕ 'sortable' hint", () => {
    // Sprint 7.0 UX polish: changed from `—` (read as decorative
    // punctuation) to `↕` (reads as "this column is sortable").
    setup({ field: "created", activeField: "name" });
    const button = screen.getByRole("button", { name: /header/i });
    expect(button.textContent).toContain("↕");
  });

  it("Sprint 6.9 S9: clicking an inactive column ALWAYS starts asc, regardless of the previous active direction", () => {
    // Sprint 6.9 audit S9: locks the contract that switching to a
    // NEW column resets the direction. Without this, a parent that
    // forgot to reset sortDir on column-change could carry "desc"
    // into the new column unexpectedly, surfacing as a sort/cursor
    // mismatch + 400 on the next page.
    const { onSortChange } = setup({
      field: "created",
      activeField: "name",
      activeDirection: "desc"
    });
    fireEvent.click(screen.getByRole("button", { name: /header/i }));
    expect(onSortChange).toHaveBeenCalledTimes(1);
    // Even though active direction was "desc", clicking the
    // inactive column must surface as "asc" — that's the
    // SortableTh contract.
    expect(onSortChange).toHaveBeenCalledWith("created", "asc");
  });
});

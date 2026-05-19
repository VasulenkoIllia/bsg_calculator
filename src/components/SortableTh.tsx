/**
 * Clickable table header that toggles sort direction.
 *
 * Sprint 6.8 — used by /documents and /calculators listing pages.
 * Mirrors the backend's `?sort=field:dir` contract:
 *
 *   - Click while inactive    → activate as `asc`
 *   - Click while `asc`       → switch to `desc`
 *   - Click while `desc`      → switch back to `asc` (the column
 *                                stays sorted; no "off" state — the
 *                                operator can pick another column to
 *                                effectively un-sort the current one)
 *
 * Sprint 7.0 UX: stronger active-state styling so the operator
 * actually NOTICES the column is sortable. Pre-7.0 the inactive
 * indicator was an em-dash (—) which read as decorative punctuation;
 * the up/down ↕ glyph reads as "this is sortable, click me".
 *   - Active column:  bold-text + blue tint cell-bg + filled ▲/▼ in
 *                     blue-700 + slate-900 label
 *   - Inactive column: regular weight + dim ↕ in slate-400
 *
 * Aria-sort is set to "ascending" / "descending" / "none" so
 * screen-readers announce the table-sort state.
 *
 * Backend pairing: the `?sort=` cursor encodes the active sort spec.
 * Flipping `sort` invalidates the cursor (400 on mismatch); the
 * frontend query hooks include `sort` in the queryKey so TanStack
 * Query starts a fresh page chain on every sort change.
 */

import { type ReactNode } from "react";

export type SortDirection = "asc" | "desc";

export interface SortableThProps<TField extends string> {
  field: TField;
  /**
   * Currently-active sort. When `activeField !== field`, the column
   * renders the inactive (dim sort-indicator) glyph.
   */
  activeField: TField;
  activeDirection: SortDirection;
  onSortChange: (field: TField, direction: SortDirection) => void;
  /** Cell content. Usually the column label string. */
  children: ReactNode;
  className?: string;
  /**
   * If true, align the chevron + text to the right. Used for columns
   * like a numeric "Updated" timestamp. Defaults to left-aligned.
   */
  align?: "left" | "right";
  /**
   * Sprint 7.0: optional tooltip surfaced via `title=` on the button.
   * Used by the "Deal" column to explain "HubSpot deal id or
   * company-level if the draft is not pinned to a specific deal".
   */
  tooltip?: string;
}

export function SortableTh<TField extends string>({
  field,
  activeField,
  activeDirection,
  onSortChange,
  children,
  className = "",
  align = "left",
  tooltip
}: SortableThProps<TField>) {
  const isActive = activeField === field;
  // When the user clicks an already-active column, just flip direction.
  // When they click an INACTIVE column, default to ascending — that's
  // the natural "show me from A first" intent.
  const handleClick = () => {
    const nextDir: SortDirection = isActive
      ? activeDirection === "asc"
        ? "desc"
        : "asc"
      : "asc";
    onSortChange(field, nextDir);
  };

  const ariaSort: "ascending" | "descending" | "none" = isActive
    ? activeDirection === "asc"
      ? "ascending"
      : "descending"
    : "none";

  // Sprint 7.0: brighter chevrons + visible inactive indicator.
  // Active column gets a filled arrow in blue-700; inactive shows
  // the ↕ "sortable" hint in slate-400 so the operator can tell
  // the column is interactive even when not the active sort.
  const indicator = isActive ? (
    <span aria-hidden="true" className="text-blue-700 text-sm leading-none">
      {activeDirection === "asc" ? "▲" : "▼"}
    </span>
  ) : (
    <span aria-hidden="true" className="text-slate-400 text-sm leading-none">
      ↕
    </span>
  );

  const justify = align === "right" ? "justify-end" : "justify-start";
  // Active state highlights the cell so the column is obviously the
  // sort key — works alongside the indicator for users who don't
  // notice colour-only state changes.
  const cellBg = isActive ? "bg-blue-50" : "";
  const labelColour = isActive
    ? "text-slate-900 font-bold"
    : "text-slate-600 font-semibold";

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"} ${cellBg} ${className}`}
    >
      <button
        type="button"
        onClick={handleClick}
        title={tooltip}
        className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-wide hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200 rounded ${labelColour} ${justify}`}
      >
        <span>{children}</span>
        {indicator}
      </button>
    </th>
  );
}

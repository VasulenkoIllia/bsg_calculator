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
 * The chevron triangles are unicode (▲/▼) with a centred dim dash
 * when the column is NOT the active sort. Aria-sort is set to
 * "ascending" / "descending" / "none" so screen-readers announce
 * the table-sort state.
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
   * renders the inactive (dim dash) indicator.
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
}

export function SortableTh<TField extends string>({
  field,
  activeField,
  activeDirection,
  onSortChange,
  children,
  className = "",
  align = "left"
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

  // Active state: solid arrow in slate-900. Inactive: dim slate-300 dash.
  const indicator = isActive ? (
    <span aria-hidden="true" className="text-slate-900">
      {activeDirection === "asc" ? "▲" : "▼"}
    </span>
  ) : (
    <span aria-hidden="true" className="text-slate-300">
      —
    </span>
  );

  const justify = align === "right" ? "justify-end" : "justify-start";

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 rounded ${justify}`}
      >
        <span>{children}</span>
        {indicator}
      </button>
    </th>
  );
}

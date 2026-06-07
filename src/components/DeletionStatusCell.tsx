/**
 * Shared "Status" table cell for soft-deletable rows, used by BOTH list
 * pages (DocumentsListPage + CalculatorsListPage). Renders an Active /
 * Deleted badge, the human reason, and an optional inline Restore button
 * (the caller decides visibility — e.g. super_admin only).
 *
 * Extracted from two byte-identical local `StatusCell` copies. Takes
 * primitives (not a DTO) so it stays decoupled from the document vs
 * calculator-config row shapes. This is a list-level presentational
 * cell — NOT the frozen calculator sticky toolbar / domain.
 */

import { humanReason, type DeletionReason } from "../shared/deletionReason.js";

export function DeletionStatusCell({
  deletedAt,
  deletionReason,
  onRestore,
  restoring
}: {
  deletedAt: string | null;
  deletionReason: DeletionReason | null;
  /** Restore handler, or null to hide the button (e.g. non-super_admin). */
  onRestore: (() => void) | null;
  restoring: boolean;
}) {
  if (deletedAt) {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
          Deleted
        </span>
        {deletionReason ? (
          <span className="text-xs text-slate-500">
            {humanReason(deletionReason)}
          </span>
        ) : null}
        {onRestore ? (
          <button
            type="button"
            onClick={onRestore}
            disabled={restoring}
            className="mt-0.5 w-fit rounded border border-green-500 bg-white px-2 py-0.5 text-[10px] font-semibold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {restoring ? "Restoring…" : "Restore"}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
      Active
    </span>
  );
}

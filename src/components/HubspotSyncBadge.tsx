/**
 * Shared HubSpot-sync status pill used by BOTH list pages
 * (DocumentsListPage + CalculatorsListPage) so the two tables render
 * the sync state identically. Extracted from the inline JSX that used
 * to live only in DocumentsListPage.
 *
 * The five states mirror `documents.hubspot_sync_state` /
 * `calculator_configs.hubspot_sync_state`:
 *   - not_synced     → neutral "Not synced"
 *   - synced         → green "Synced"
 *   - delete_pending → amber "Deleting…" (Note tear-down in flight)
 *   - delete_failed  → red "Delete failed" (operator can Retry)
 *   - failed         → red "Failed"
 */

export type HubspotSyncState =
  | "not_synced"
  | "synced"
  | "failed"
  | "delete_pending"
  | "delete_failed";

const PILL_BASE = "rounded-full px-2 py-0.5 text-xs font-medium";

export function HubspotSyncBadge({ state }: { state: HubspotSyncState }) {
  switch (state) {
    case "not_synced":
      return (
        <span className={`${PILL_BASE} bg-slate-100 text-slate-600`}>
          Not synced
        </span>
      );
    case "synced":
      return (
        <span className={`${PILL_BASE} bg-emerald-100 text-emerald-700`}>
          Synced
        </span>
      );
    case "delete_pending":
      return (
        <span className={`${PILL_BASE} bg-amber-100 text-amber-700`}>
          Deleting…
        </span>
      );
    case "delete_failed":
      return (
        <span className={`${PILL_BASE} bg-red-100 text-red-700`}>
          Delete failed
        </span>
      );
    case "failed":
    default:
      return (
        <span className={`${PILL_BASE} bg-red-100 text-red-700`}>Failed</span>
      );
  }
}

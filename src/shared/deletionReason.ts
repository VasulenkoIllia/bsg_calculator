/**
 * Single source of truth for the soft-delete REASON vocabulary used by
 * BOTH documents and calculator-configs on the frontend.
 *
 * Before this module the 5-member reason enum + its humanizer were
 * copy-pasted across DocumentsListPage, CalculatorsListPage,
 * DocumentViewPage and both delete modals — which had already drifted
 * ("Replaced by new" vs "Replaced by new version"). Mirrors the server
 * `documents.deletion_reason` / `calculator_configs.deletion_reason`
 * CHECK constraints (identical 5 values on both tables).
 */

export const DELETION_REASONS = [
  "client_request",
  "created_in_error",
  "replaced_by_new_version",
  "duplicate",
  "other"
] as const;

export type DeletionReason = (typeof DELETION_REASONS)[number];

/**
 * Compact, operator-facing label for a reason. Used by the Status-cell
 * "Deleted" badge on the list pages and the soft-delete banner on the
 * document detail page. ONE canonical label per reason (no skew).
 */
export function humanReason(reason: DeletionReason): string {
  switch (reason) {
    case "client_request":
      return "Client request";
    case "created_in_error":
      return "Created in error";
    case "replaced_by_new_version":
      return "Replaced by new version";
    case "duplicate":
      return "Duplicate";
    case "other":
      return "Other";
    default: {
      const _exhaustive: never = reason;
      return String(_exhaustive);
    }
  }
}

/**
 * Dropdown options for the delete modals. The "other" label flags that a
 * note is required (the server-side Zod refine enforces it).
 */
export const REASON_OPTIONS: { value: DeletionReason; label: string }[] = [
  { value: "client_request", label: "Client request" },
  { value: "created_in_error", label: "Created in error" },
  { value: "replaced_by_new_version", label: "Replaced by new version" },
  { value: "duplicate", label: "Duplicate" },
  { value: "other", label: "Other (note required)" }
];

import { formatDateTime } from "../shared/format.js";

// Red pill shown on a company the CRM deleted while it still owned work —
// we retain the row locally (the documents→company FK is RESTRICT,
// protecting legal records) and flag it instead. Renders nothing when the
// company is live. The marker is auto-cleared by a successful re-sync if
// the company is restored upstream.
//
// Reads BOTH era flags: `hubspotDeletedAt` is written only by the HubSpot
// deletion webhook and freezes when HubSpot is switched off, so a client
// deleted in monday would otherwise show as perfectly live.
export function HubspotDeletedBadge({
  deletedAt,
  crmDeletedAt,
  crmDeletedReason,
  missingSince,
  className = "",
}: {
  deletedAt: string | null | undefined;
  crmDeletedAt?: string | null;
  /**
   * monday reports archiving and deletion through the same signal. They
   * are NOT the same thing here: archiving is reversible and does not
   * unlock the purge, so showing both as "Deleted in CRM" would leave an
   * operator staring at a red badge next to a disabled Remove button with
   * no way to tell why.
   */
  crmDeletedReason?: "deleted" | "archived" | null;
  /**
   * Absence from a backfill — a WEAKER signal than a deletion event, shown
   * in amber rather than red. It is an observation: the item may simply
   * have been unreadable on that pass.
   */
  missingSince?: string | null;
  className?: string;
}) {
  const confirmed = deletedAt ?? crmDeletedAt ?? null;
  // Archived only counts as the weaker state when it is the ONLY signal:
  // a HubSpot-era deletion is a real deletion regardless.
  const archived =
    !deletedAt && Boolean(crmDeletedAt) && crmDeletedReason === "archived";
  if (archived) {
    return (
      <span
        className={[
          "inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        title={`Archived in the CRM on ${formatDateTime(crmDeletedAt!)}. Archiving is reversible — restore it in monday to bring it back.`}
      >
        Archived in CRM
      </span>
    );
  }
  if (!confirmed && missingSince) {
    return (
      <span
        className={[
          "inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        title={`Not seen on its CRM board since ${formatDateTime(missingSince)}. This is an observation, not a confirmed deletion.`}
      >
        Not found in CRM
      </span>
    );
  }
  if (!confirmed) return null;
  return (
    <span
      className={[
        "inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      title={`Deleted in the CRM on ${formatDateTime(confirmed)}`}
    >
      Deleted in CRM
    </span>
  );
}

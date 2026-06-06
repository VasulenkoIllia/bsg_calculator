import { formatDateTime } from "../shared/format.js";

// Red pill shown on a company that HubSpot DELETED (or merged away) while
// it still owned documents — so we retained the row locally (the
// documents→company FK is RESTRICT, protecting legal records) and flagged
// it instead. Renders nothing when the company is live in HubSpot
// (`deletedAt` null/undefined). The marker is auto-cleared by any
// successful re-sync if the company is restored upstream.
export function HubspotDeletedBadge({
  deletedAt,
  className = ""
}: {
  deletedAt: string | null | undefined;
  className?: string;
}) {
  if (!deletedAt) return null;
  return (
    <span
      className={[
        "inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      title={`Deleted in HubSpot on ${formatDateTime(deletedAt)}`}
    >
      Deleted in HubSpot
    </span>
  );
}

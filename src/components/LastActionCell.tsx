/**
 * Sprint 9.N — "Last action" cell renderer for the documents +
 * calculator-configs listings.
 *
 * Renders the latest event from the entity's audit log as:
 *
 *   <event-type label>
 *   <actor display name> · <relative time>
 *
 * Colour-coded by event type (green = success, red = failure,
 * slate = neutral) — same mapping as the EventHistoryPanel.
 *
 * The component is intentionally compact (~3-line cell) so it fits
 * inside the listing table without expanding row height too much.
 * Tooltips on hover surface the full event timestamp + actor email
 * for an operator who wants more detail without opening the doc.
 */

import type { PublicLastEvent } from "../api/types.js";

interface LastActionCellProps {
  event: PublicLastEvent | null | undefined;
}

const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  pdf_downloaded: "PDF downloaded",
  synced_to_hubspot: "Synced",
  sync_failed: "Sync failed",
  deleted: "Deleted",
  restored: "Restored",
  deletion_reason_edited: "Reason edited"
};

const EVENT_BADGE: Record<string, string> = {
  created: "bg-blue-100 text-blue-700",
  pdf_downloaded: "bg-slate-100 text-slate-700",
  synced_to_hubspot: "bg-green-100 text-green-700",
  sync_failed: "bg-red-100 text-red-700",
  deleted: "bg-red-100 text-red-700",
  restored: "bg-green-100 text-green-700",
  deletion_reason_edited: "bg-amber-100 text-amber-700"
};

/**
 * Human-friendly relative time ("just now", "5m ago", "3h ago",
 * "2d ago", then fall back to a locale date). Avoids pulling in a
 * date library for a single helper. Mirrors the helper inside
 * EventHistoryPanel — kept duplicated rather than extracted because
 * both files use it locally and the function is 6 lines.
 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const delta = now - then;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  if (delta < 30 * 86_400_000) return `${Math.floor(delta / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function actorLabel(ev: PublicLastEvent): string {
  if (!ev.actorUserId) return "system";
  if (ev.actorDisplayName && ev.actorDisplayName.trim()) return ev.actorDisplayName;
  return ev.actorEmail ?? "system";
}

export function LastActionCell({ event }: LastActionCellProps) {
  if (!event) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  const label = EVENT_LABEL[event.eventType] ?? event.eventType;
  const badge = EVENT_BADGE[event.eventType] ?? "bg-slate-100 text-slate-700";
  const fullTooltip =
    event.actorEmail && event.actorDisplayName
      ? `${event.actorDisplayName} (${event.actorEmail}) · ${event.createdAt}`
      : event.createdAt;
  return (
    <div className="flex flex-col gap-0.5" title={fullTooltip}>
      <span
        className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge}`}
      >
        {label}
      </span>
      <span className="text-xs text-slate-500">
        {actorLabel(event)} · {relativeTime(event.createdAt)}
      </span>
    </div>
  );
}

/**
 * Phase 8 Stage 4 — generic event-log "History" panel.
 *
 * Renders a reverse-chronological list of audit events on the
 * detail pages for documents and calc-configs. Both backends speak
 * the same `PublicEvent` DTO, so this component is entity-agnostic
 * — pass the events array (already fetched by the caller via
 * react-query) and we render.
 *
 * UX contract:
 *   - Collapsed by default; click the header to expand. Avoids
 *     pushing the primary doc/calc content down when the operator
 *     just wants to look at the calc itself.
 *   - Each row: `<actorLabel>` · `<event label>` · `<time ago>`
 *     with an optional inline meta line ("noteId: 12345").
 *   - Empty state (newly created entity with no actions yet —
 *     should only briefly happen on a hard race between insert
 *     and event-log fetch) reads "No events yet".
 */

import { useState } from "react";
import type { PublicEvent } from "../api/types.js";

interface EventHistoryPanelProps {
  events: PublicEvent[];
  isLoading?: boolean;
  isError?: boolean;
  /** Default false — operator clicks to expand. */
  defaultOpen?: boolean;
}

const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  pdf_downloaded: "PDF downloaded",
  synced_to_hubspot: "Synced to HubSpot",
  sync_failed: "Sync to HubSpot failed",
  // Stage 5 will add 'deleted' / 'restored' here.
  deleted: "Deleted",
  restored: "Restored"
};

/**
 * Picks a small badge colour per event type so the timeline reads
 * at a glance: green = success, red = failure, slate = neutral.
 */
function eventBadgeClasses(eventType: string): string {
  switch (eventType) {
    case "synced_to_hubspot":
    case "created":
    case "restored":
      return "bg-green-100 text-green-700";
    case "sync_failed":
    case "deleted":
      return "bg-red-100 text-red-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

/**
 * Human-readable relative time. Stays simple — we don't need a
 * dedicated library for a "X ago" string here (would pull in
 * date-fns + locale data for a feature that occupies one row).
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

function actorLabel(ev: PublicEvent): string {
  if (!ev.actorUserId) return "system";
  if (ev.actorDisplayName && ev.actorDisplayName.trim()) {
    return ev.actorEmail
      ? `${ev.actorDisplayName} (${ev.actorEmail})`
      : ev.actorDisplayName;
  }
  return ev.actorEmail ?? "system";
}

/**
 * One-liner inline meta for the row sub-label. Each event type
 * shows whatever context is most useful for the operator without
 * dragging the full JSON onto the screen.
 */
function metaLine(ev: PublicEvent): string | null {
  const meta = ev.meta ?? {};
  switch (ev.eventType) {
    case "synced_to_hubspot":
      return meta.noteId ? `noteId: ${String(meta.noteId)}` : null;
    case "sync_failed":
      return meta.error ? `error: ${String(meta.error)}` : null;
    case "pdf_downloaded":
      return meta.download === true ? "saved as file" : "viewed inline";
    default:
      return null;
  }
}

export function EventHistoryPanel({
  events,
  isLoading = false,
  isError = false,
  defaultOpen = false
}: EventHistoryPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      aria-label="History"
      className="mt-6 rounded-2xl border border-slate-200 bg-white"
    >
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
      >
        <span>History {events.length > 0 ? `(${events.length})` : ""}</span>
        <span className="text-slate-400" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-4 py-3">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading events…</p>
          ) : isError ? (
            <p className="text-sm text-red-600">Failed to load events.</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-slate-500">No events yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {events.map(ev => {
                const meta = metaLine(ev);
                return (
                  <li key={ev.id} className="flex flex-col gap-1 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${eventBadgeClasses(ev.eventType)}`}
                      >
                        {EVENT_LABEL[ev.eventType] ?? ev.eventType}
                      </span>
                      <span className="text-slate-700">{actorLabel(ev)}</span>
                      <span className="text-slate-400" title={ev.createdAt}>
                        · {relativeTime(ev.createdAt)}
                      </span>
                    </div>
                    {meta ? (
                      <p className="ml-1 truncate text-xs text-slate-500" title={meta}>
                        {meta}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

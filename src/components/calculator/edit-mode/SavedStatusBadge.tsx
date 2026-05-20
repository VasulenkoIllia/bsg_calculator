/**
 * "Saved · 2s ago" badge for CalculatorPage edit-mode (`/calc/:id`).
 *
 * Owns its own 5-second tick interval so the relative-time label
 * stays fresh without forcing a re-render of the whole calculator
 * tree. Reports the auto-save mutation state (pending / errored /
 * saved-with-timestamp / unsaved) inline so the operator can trust
 * that changes are persisting.
 *
 * `savedAtIso` is a plain ISO string (not a Date object) on purpose —
 * the Sprint 6.1 hotfix replaced a `useState<Date | null>` pattern
 * that produced "Maximum update depth exceeded" loops via repeated
 * `new Date(string)` calls in an effect that mutated state on every
 * render. Parsing on each render here is the right side of that
 * trade-off: cheap derived computation vs. stored mutable state.
 *
 * Sprint 6.F.2 extracted from CalculatorPage.tsx (was an inline
 * subcomponent in a 680-LOC page file).
 */

import { useEffect, useState } from "react";

export function SavedStatusBadge({
  configTitle,
  isPending,
  isError,
  errorMessage,
  savedAtIso
}: {
  configTitle: string;
  isPending: boolean;
  isError: boolean;
  errorMessage?: string;
  /**
   * ISO timestamp string (or null). Parsed to Date inside this
   * component on each render — derived data, not stored. Avoids the
   * "new Date() in useEffect → setState → loop" trap from Sprint 6.1.
   */
  savedAtIso: string | null;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  const tag = (() => {
    if (isPending) {
      return { label: "Saving…", cls: "bg-blue-50 border-blue-200 text-blue-800" };
    }
    if (isError) {
      return {
        label: `Save failed: ${errorMessage ?? "unknown error"}`,
        cls: "bg-red-50 border-red-200 text-red-800"
      };
    }
    if (!savedAtIso) {
      return {
        label: "Unsaved",
        cls: "bg-slate-100 border-slate-200 text-slate-600"
      };
    }
    return {
      label: `Saved · ${formatRelativeTime(new Date(savedAtIso))}`,
      cls: "bg-emerald-50 border-emerald-200 text-emerald-800"
    };
  })();

  return (
    <div
      role="status"
      className={`mb-3 flex items-center justify-between rounded-lg border px-4 py-2 text-sm ${tag.cls}`}
    >
      <span className="truncate font-semibold">{configTitle}</span>
      <span aria-live="polite" className="ml-3 shrink-0 text-xs font-medium">
        {tag.label}
      </span>
    </div>
  );
}

function formatRelativeTime(when: Date): string {
  const ageMs = Date.now() - when.getTime();
  if (ageMs < 5_000) return "just now";
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1_000)}s ago`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h ago`;
  return when.toLocaleDateString();
}

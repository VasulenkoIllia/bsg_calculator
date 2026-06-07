import type { ReactNode } from "react";

/**
 * Small reusable confirmation modal. Used for non-destructive "are you
 * sure?" prompts (e.g. re-syncing an already-synced item creates a NEW
 * HubSpot Note). For destructive deletes we keep the dedicated modals
 * (DeleteDocumentModal / DeleteCompanyModal) that capture reason/context.
 */
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: "primary" | "danger";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmTone = "primary",
  pending = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  if (!open) return null;
  const confirmClass =
    confirmTone === "danger"
      ? "border-red-600 bg-red-600 hover:bg-red-700"
      : "border-blue-600 bg-blue-600 hover:bg-blue-700";
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={e => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <header>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <div className="mt-1 text-sm text-slate-500">{message}</div>
        </header>
        <footer className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${confirmClass}`}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

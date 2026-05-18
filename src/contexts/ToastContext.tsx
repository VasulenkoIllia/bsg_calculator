/**
 * Global toast notifications.
 *
 * Sprint 6.3: replaces the per-page inline toast state pattern
 * (CalculatorPage's `savedToast` useState, WizardPage's
 * `wizardActionMessage`, SaveModal local `submitError`) with a single
 * app-wide provider + hook. Operator now sees mutation feedback in a
 * consistent place (top-right) regardless of which page fired it.
 *
 * Why custom (not react-hot-toast / sonner): adds ~80 LOC vs. a 5KB
 * dependency, integrates cleanly with our existing Tailwind palette,
 * and the API surface we need is tiny (success / error / info +
 * dismiss). If we ever need queue-management, swipe-to-dismiss or
 * action-buttons-in-toasts, swap in a library.
 *
 * Design choices:
 *   - Toasts auto-dismiss (default 4s). Error toasts get 6s because
 *     they tend to carry more text and operators want time to read.
 *   - Stack vertically, newest on top.
 *   - Render via a viewport component pinned with `fixed` so toasts
 *     float over any page content.
 *   - useToast() exposes notify methods; the provider holds the list.
 *   - No portal — toasts live inside the React tree under the
 *     provider so they pick up Tailwind theming naturally.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  /**
   * Auto-dismiss timeout in ms. `null` keeps the toast pinned until
   * the user dismisses manually — used for fatal errors that need
   * acknowledgement.
   */
  timeoutMs: number | null;
  createdAt: number;
}

interface ToastContextValue {
  toasts: Toast[];
  notify: (kind: ToastKind, message: string, timeoutMs?: number | null) => void;
  success: (message: string, timeoutMs?: number | null) => void;
  error: (message: string, timeoutMs?: number | null) => void;
  info: (message: string, timeoutMs?: number | null) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_TIMEOUTS: Record<ToastKind, number> = {
  success: 4_000,
  info: 4_000,
  error: 6_000
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Stable id generator — using a ref instead of crypto.randomUUID()
  // so the provider works under SSR (no `crypto.randomUUID` in older
  // node) and is allocation-cheap. Monotonic + tab-local — collisions
  // across tabs don't matter (each tab has its own provider).
  const idCounterRef = useRef(0);
  const nextId = () => {
    idCounterRef.current += 1;
    return `t-${Date.now()}-${idCounterRef.current}`;
  };

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const notify = useCallback(
    (kind: ToastKind, message: string, timeoutMs: number | null = DEFAULT_TIMEOUTS[kind]) => {
      const id = nextId();
      const toast: Toast = {
        id,
        kind,
        message,
        timeoutMs,
        createdAt: Date.now()
      };
      // Newest on top → unshift instead of push.
      setToasts(prev => [toast, ...prev]);
    },
    []
  );

  const success = useCallback(
    (message: string, timeoutMs?: number | null) => notify("success", message, timeoutMs),
    [notify]
  );
  const error = useCallback(
    (message: string, timeoutMs?: number | null) => notify("error", message, timeoutMs),
    [notify]
  );
  const info = useCallback(
    (message: string, timeoutMs?: number | null) => notify("info", message, timeoutMs),
    [notify]
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, notify, success, error, info, dismiss, dismissAll }),
    [toasts, notify, success, error, info, dismiss, dismissAll]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error(
      "useToast() must be called inside <ToastProvider> — wrap the App tree at the top level."
    );
  }
  return ctx;
}

// ─── Viewport ─────────────────────────────────────────────────────

function ToastViewport({
  toasts,
  onDismiss
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      // role=region + aria-live=polite so screen readers announce the
      // toast contents when they appear, without interrupting the
      // operator's current focus.
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  // Auto-dismiss timer. The `toast.id` in the dep array means
  // remounting (same id, replaced via state) re-arms the timer.
  // Using the stable `onDismiss` callback dep means we don't
  // accidentally restart the timer on each provider re-render.
  useEffect(() => {
    if (toast.timeoutMs === null) return;
    const handle = window.setTimeout(() => onDismiss(toast.id), toast.timeoutMs);
    return () => window.clearTimeout(handle);
  }, [toast.id, toast.timeoutMs, onDismiss]);

  const styles = (() => {
    switch (toast.kind) {
      case "success":
        return {
          container: "border-emerald-200 bg-emerald-50 text-emerald-900",
          icon: "✓",
          iconCls: "text-emerald-600"
        };
      case "error":
        return {
          container: "border-red-200 bg-red-50 text-red-900",
          icon: "✕",
          iconCls: "text-red-600"
        };
      case "info":
        return {
          container: "border-blue-200 bg-blue-50 text-blue-900",
          icon: "i",
          iconCls: "text-blue-600"
        };
    }
  })();

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      // pointer-events-auto re-enables clicks on the toast itself
      // (the viewport is pointer-events-none so clicks pass through
      // empty space onto the page beneath).
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg ${styles.container}`}
    >
      <span
        aria-hidden
        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${styles.iconCls}`}
      >
        {styles.icon}
      </span>
      <p className="flex-1 break-words leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded p-0.5 text-current/60 transition hover:bg-black/5 hover:text-current"
        aria-label="Dismiss notification"
      >
        <span aria-hidden className="block h-4 w-4 text-center text-xs leading-4">
          ✕
        </span>
      </button>
    </div>
  );
}

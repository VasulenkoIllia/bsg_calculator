/**
 * Sprint 9.P — idle-timeout warning modal.
 *
 * Mounted globally inside AppShell. Reads `useIdleTimeout(enabled)`
 * where `enabled = !!auth.user`. Renders:
 *   - Nothing while the user is active.
 *   - A modal with a countdown when the warning stage fires.
 *   - Calls `auth.logout()` when stage flips to `expired`.
 *
 * The countdown text is the only thing that animates inside the
 * modal — minimum visual noise so an operator returning to their
 * desk sees "оп, в мене 30 секунд" rather than a panic alert.
 */

import { useEffect, type ReactElement } from "react";
import { useAuth } from "../contexts/AuthContext.js";
import { useIdleTimeout } from "../hooks/useIdleTimeout.js";

export function IdleTimeoutWarning(): ReactElement | null {
  const { user, logout } = useAuth();
  // The hook itself owns the timer; we just react to its `stage`.
  // Disabled when logged-out — there's no session to time out.
  const { status, extend } = useIdleTimeout(!!user);

  // When the hook flips to "expired", trigger a real logout.
  // useEffect (not inline) so we don't call setState during render.
  useEffect(() => {
    if (status.stage === "expired") {
      void logout();
    }
  }, [status.stage, logout]);

  if (!user || status.stage !== "warning") return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-timeout-title"
      aria-describedby="idle-timeout-body"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-amber-300 bg-white p-6 shadow-xl">
        <h2 id="idle-timeout-title" className="text-lg font-semibold text-slate-900">
          Сесія закінчиться через {status.secondsRemaining} с
        </h2>
        <p id="idle-timeout-body" className="text-sm text-slate-600">
          Ви не активні певний час. Якщо нічого не натиснете, вас буде
          автоматично вилогінено для безпеки. Натисніть{" "}
          <strong>«Залишитись»</strong>, щоб продовжити сесію.
        </p>
        <footer className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Вийти зараз
          </button>
          <button
            type="button"
            onClick={extend}
            autoFocus
            className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Залишитись
          </button>
        </footer>
      </div>
    </div>
  );
}

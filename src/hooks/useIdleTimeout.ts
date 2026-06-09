/**
 * Sprint 9.P — idle-timeout hook.
 *
 * Listens to user-activity events on `window`. After
 * `IDLE_TIMEOUT_MIN` minutes of zero activity, returns
 * `{ stage: "expired" }` so the caller can call `auth.logout()`.
 * `IDLE_WARNING_SEC` seconds before that deadline, returns
 * `{ stage: "warning", secondsRemaining }` so the caller can
 * render a "session about to expire" modal with a countdown.
 *
 * Lifecycle:
 *   - The hook resets its internal timer on every activity event.
 *   - Activity events are throttled to once per second via a
 *     timestamp ref (cheap; avoids one re-render per mousemove).
 *   - The "warning" stage is sticky: once the warning fires, the
 *     countdown does NOT reset on further activity — the operator
 *     MUST click "Stay signed in" (which calls `extend()`).
 *
 * Disabled when `enabled === false` (e.g. on the login page,
 * where there's no session to time out). The caller is responsible
 * for that gate — typically `enabled = !!auth.user`.
 *
 * Why FE-only:
 *   - Speed of implementation (no DB migration, no server changes).
 *   - The threat model is physical-access ("colleague sat at your
 *     unlocked laptop"). The 12h absolute server-side cap closes
 *     the long-tail; this hook closes the short-tail.
 *   - Bypass via DevTools is in scope only for a more sophisticated
 *     attacker who already has physical access — at which point the
 *     idle timer is the last of many concerns.
 */

import { useCallback, useEffect, useRef, useState } from "react";
// `useRef` stays because `lastActivityRef` (the canonical activity
// timestamp) needs to survive re-renders without triggering them.
// `useCallback` is still used by `extend()` so the consumer's
// reference identity is stable.
import {
  ACTIVITY_THROTTLE_MS,
  IDLE_TIMEOUT_MIN,
  IDLE_WARNING_SEC
} from "../config/idleTimeout.js";

/**
 * The DOM events we treat as "user is alive at the keyboard".
 *
 * `visibilitychange` is intentionally NOT here — a hidden tab is
 * not the same as an inactive operator (they may be reading another
 * window). The page-visibility behaviour is a separate decision.
 */
const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "click",
  "touchstart",
  "scroll"
] as const;

export type IdleStage =
  | { stage: "active" }
  | { stage: "warning"; secondsRemaining: number }
  | { stage: "expired" };

interface UseIdleTimeoutResult {
  /** Current stage. The component renders the warning modal when stage === "warning". */
  status: IdleStage;
  /** "Stay signed in" handler — resets the timer to fresh-idle. */
  extend: () => void;
}

export function useIdleTimeout(enabled: boolean): UseIdleTimeoutResult {
  const [status, setStatus] = useState<IdleStage>({ stage: "active" });

  // Timestamp of the last accepted activity event. A ref instead of
  // state so the throttle check is synchronous + doesn't trigger
  // re-renders. We re-read this every tick of the heartbeat below.
  const lastActivityRef = useRef<number>(Date.now());

  // Public `extend()` — called from the "Stay signed in" button.
  // Resets the activity stamp + flips status back to "active" so
  // the warning modal closes.
  const extend = useCallback(() => {
    lastActivityRef.current = Date.now();
    setStatus({ stage: "active" });
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Hard reset so a logout → login cycle starts cleanly.
      lastActivityRef.current = Date.now();
      setStatus({ stage: "active" });
      return;
    }

    // ─── Activity listener ────────────────────────────────────────
    // Throttled via the lastActivityRef timestamp. We deliberately
    // do NOT freeze updates while `status === "warning"` — keeping
    // the ref fresh means the next `extend()` plus subsequent ticks
    // see a recent timestamp, so the warning won't immediately re-
    // fire on the next heartbeat.
    const timeoutMs = IDLE_TIMEOUT_MIN * 60 * 1000;
    const warningMs = IDLE_WARNING_SEC * 1000;

    // Single source of truth for "given how long we've been idle, what
    // stage are we in?". Called by the 1s heartbeat AND immediately on
    // tab re-focus so a throttled background tab can't silently skip the
    // warning window and jump straight from active → expired.
    const evaluate = () => {
      const idleFor = Date.now() - lastActivityRef.current;
      const remaining = timeoutMs - idleFor;
      if (remaining <= 0) {
        setStatus({ stage: "expired" });
      } else if (remaining <= warningMs) {
        setStatus({
          stage: "warning",
          secondsRemaining: Math.ceil(remaining / 1000)
        });
      } else {
        // active — only update state if we were previously showing the
        // warning (cheap no-op for steady-state).
        setStatus(prev => (prev.stage === "active" ? prev : { stage: "active" }));
      }
    };

    let lastThrottle = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastThrottle < ACTIVITY_THROTTLE_MS) return;
      lastThrottle = now;
      // Don't reset the activity stamp while the warning is open —
      // the warning's countdown should keep ticking even if the user
      // is wiggling their mouse. They must explicitly click "Stay
      // signed in" (which calls `extend()`).
      setStatus(currentStatus => {
        if (currentStatus.stage === "active") {
          lastActivityRef.current = now;
        }
        return currentStatus;
      });
    };

    // Activity events on `window`. NOTE: events inside the PDF-preview
    // iframe (DocumentViewPage / wizard PreviewStep) do NOT bubble out to
    // `window` — handled separately by `handleWindowBlur` below.
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    // PDF-preview iframe engagement. When the operator clicks into the
    // sandboxed preview iframe, the parent window blurs and
    // `document.activeElement` becomes that <iframe>. We can't observe
    // scroll/clicks inside a sandboxed iframe, but treating "focus moved
    // into the preview" as activity stops the timer from advancing the
    // moment they start reading. Checked on a macrotask because
    // activeElement updates after the blur fires.
    const handleWindowBlur = () => {
      window.setTimeout(() => {
        const el = document.activeElement;
        if (el && el.tagName === "IFRAME") {
          lastActivityRef.current = Date.now();
        }
      }, 0);
    };
    window.addEventListener("blur", handleWindowBlur);

    // When the tab becomes visible again, the browser may have throttled
    // the 1s heartbeat to ~1 tick/minute while hidden — so the warning
    // window could have been skipped entirely. Re-evaluate immediately on
    // re-focus so the operator reliably SEES the warning (or is cleanly
    // logged out) instead of silently jumping active → expired. This is
    // the fix for "logged out without ever seeing the warning".
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") evaluate();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // ─── Heartbeat ────────────────────────────────────────────────
    const heartbeatId = setInterval(evaluate, 1000);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(heartbeatId);
    };
  }, [enabled]);

  return { status, extend };
}

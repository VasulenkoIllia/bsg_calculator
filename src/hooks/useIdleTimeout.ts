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

  // The heartbeat interval fires once per second; cheap. The state
  // transitions happen here, so the React effect cleanup can clear
  // a single timer cleanly.
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

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

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    // ─── Heartbeat ────────────────────────────────────────────────
    // Once per second, check time-since-last-activity and transition
    // the stage if a threshold has been crossed.
    const timeoutMs = IDLE_TIMEOUT_MIN * 60 * 1000;
    const warningMs = IDLE_WARNING_SEC * 1000;

    heartbeatRef.current = setInterval(() => {
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
        // active — only update state if we were previously
        // showing the warning (cheap no-op for steady-state).
        setStatus(prev => (prev.stage === "active" ? prev : { stage: "active" }));
      }
    }, 1000);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [enabled, resetActivity]);

  return { status, extend };
}

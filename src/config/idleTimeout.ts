/**
 * Sprint 9.P — idle-timeout constants.
 *
 * Centralised so the hook (useIdleTimeout) and the warning modal
 * (IdleTimeoutWarning) read the same values. If we ever need to
 * tune the cadence per role, swap these for a `useIdleConfig`
 * hook that looks at `useAuth().user.role`.
 *
 * The threat model: an operator leaves their browser logged in
 * and walks away from the machine (lunch, meeting, end of day).
 * 30 minutes of zero `mousemove`/`keydown`/`click`/`touchstart`
 * activity forces a logout; 1 minute before the deadline, a
 * warning modal lets them extend with one click.
 *
 * The 12-hour absolute cap is enforced server-side via the
 * `JWT_REFRESH_EXPIRES=12h` env knob, NOT here — `useIdleTimeout`
 * only worries about activity-based logout. If you change one,
 * sanity-check the other.
 */

/** Total minutes of inactivity before forced logout. */
export const IDLE_TIMEOUT_MIN = 30;

/** Seconds before the deadline when the warning modal opens. */
export const IDLE_WARNING_SEC = 60;

/**
 * Throttle for activity callbacks. Without this, every mouse
 * movement would fire a state update + timer reset; at 60fps that
 * is ~3,600 setState calls per minute. 1000ms means at most 1
 * timer reset per second per active operator — invisible to UX,
 * cheap on the renderer.
 */
export const ACTIVITY_THROTTLE_MS = 1000;

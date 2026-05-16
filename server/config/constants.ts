/**
 * Shared compile-time constants.
 *
 * These are NOT env-knobs — they're security or contract boundaries
 * that should not be tuned per deployment. Putting them here gives
 * every module a single import path and makes their values easy to
 * audit.
 */

/**
 * Refresh-token rotation grace window. Tokens revoked within this
 * many ms are still honoured (with access-token-only response, no
 * new refresh) to absorb multi-tab race conditions. See
 * `phase_08_backend_plan.md` §9 and `docs/decisions.md` →
 * "Phase 8 architectural conventions".
 */
export const REFRESH_GRACE_WINDOW_MS = 10_000;

/**
 * Refresh-token cookie name. Centralised so the auth router and
 * controllers agree on the name without string duplication.
 */
export const REFRESH_COOKIE_NAME = "bsg_refresh";

/**
 * Refresh-token cookie path scope. Limits where browsers send the
 * cookie. NOTE: any future refresh endpoint MUST mount under this
 * path or the cookie won't reach it.
 */
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

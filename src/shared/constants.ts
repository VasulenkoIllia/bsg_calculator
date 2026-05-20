/**
 * Project-wide tunables exposed as named constants so call sites
 * stay grep-able and a future tuning round can move them all in
 * one place rather than chasing magic numbers across the tree.
 */

// ─── TanStack Query defaults (used in main.tsx) ────────────────────
/**
 * `staleTime` for the global QueryClient. Listings (companies, deals)
 * rarely change while the operator is staring at them; 30s collapses
 * the "tab focus + route remount" double-fetch into one.
 */
export const QUERY_STALE_TIME_MS = 30_000;

/**
 * `gcTime` for the global QueryClient. Keep responses cached for 5
 * minutes after the last subscriber unmounts so back-button feels
 * instant. Tune up only if memory starts mattering at our payload sizes.
 */
export const QUERY_GC_TIME_MS = 5 * 60_000;

// ─── Search debounce (used by CompaniesPage and any future search) ─
/**
 * Delay between the last keystroke and the actual API call when a
 * user types in a search box. 300ms is the long-standing "feels
 * instant but doesn't fire per keystroke" sweet spot.
 */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Shared "badge-lag" polling policy for HubSpot auto-sync.
 *
 * Single source of truth used by BOTH `useDocument` and
 * `useCalculatorConfig` so the two CANNOT diverge.
 *
 * Context: with `AUTO_SYNC_TO_HUBSPOT=true` the backend syncs a freshly
 * created document/calc to HubSpot ~1-3s after create (fire-and-forget).
 * There is NO intermediate "syncing" badge state — the badge sits on
 * `not_synced` until the background sync flips it to `synced`/`failed`.
 * Without a nudge the detail page would show a stale `not_synced` badge
 * for the full staleTime, and the operator might click the one-click
 * "Sync" (no confirm) and mint a DUPLICATE Note.
 *
 * `shouldPollSyncBadge` returns the refetch interval (ms) while the
 * entity is still `not_synced` AND was created within the last 60s, so
 * the badge catches the auto-sync flip quickly. It self-terminates
 * (returns `false`) once the entity leaves `not_synced` OR ages past
 * 60s — so an already-synced, failed, or never-synced (auto-sync off)
 * entity does NOT poll forever.
 */

export interface SyncPollableEntity {
  hubspotSyncState: string;
  createdAt: string;
}

/** Window (ms) after `createdAt` during which we poll a not_synced entity. */
export const SYNC_BADGE_POLL_WINDOW_MS = 60_000;
/** Poll cadence (ms) inside the window. */
export const SYNC_BADGE_POLL_INTERVAL_MS = 2_500;

export function shouldPollSyncBadge(
  entity: SyncPollableEntity | undefined
): number | false {
  if (!entity) return false;
  const ageMs = Date.now() - new Date(entity.createdAt).getTime();
  return entity.hubspotSyncState === "not_synced" &&
    ageMs < SYNC_BADGE_POLL_WINDOW_MS
    ? SYNC_BADGE_POLL_INTERVAL_MS
    : false;
}

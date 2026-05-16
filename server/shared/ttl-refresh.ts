/**
 * Generic TTL-driven background refresh.
 *
 * Pattern (previously duplicated in companies.service +
 * deals.service): when an operator GETs a HubSpot-cached row whose
 * `last_synced_at` is older than `HUBSPOT_SYNC_TTL_SECONDS`, we serve
 * from cache AND kick a non-blocking refetch. The next request
 * (~5s+) sees fresh data.
 *
 * This helper unifies the "guard → setImmediate → log on error"
 * boilerplate; each call site supplies its entity-specific refresh
 * callback.
 *
 * Safety:
 * - The async callback inside setImmediate is wrapped with
 *   `void (async () => { try { ... } catch { ... } })()` so unhandled
 *   rejections cannot escape the inner try/catch (defence-in-depth;
 *   the try/catch covers everything anyway).
 * - Returns Promise<void> that resolves synchronously after queuing
 *   the work — caller need not await.
 */

import { logger } from "../middleware/logger";

export interface TtlRefreshConfig {
  /** Last successful sync timestamp on the cached row. */
  lastSyncedAt: Date;
  /** TTL in milliseconds. <= 0 disables refresh entirely. */
  ttlMs: number;
  /** When false, refresh is skipped (e.g. no HubSpot token in dev). */
  enabled: boolean;
  /** Fire-and-forget background work to perform. Errors are caught + logged. */
  refresh: () => Promise<void>;
  /** Log message used on background error (e.g. "[deals] TTL refresh"). */
  logLabel: string;
  /**
   * Structured context attached to log lines (e.g.
   * `{ hubspotDealId: row.hubspotDealId }`). Helps debugging which
   * entity's refresh failed.
   */
  logContext: Record<string, unknown>;
}

export function scheduleTtlRefresh(config: TtlRefreshConfig): Promise<void> {
  if (!config.enabled) return Promise.resolve();
  if (config.ttlMs <= 0) return Promise.resolve();

  const ageMs = Date.now() - config.lastSyncedAt.getTime();
  if (ageMs < config.ttlMs) return Promise.resolve();

  setImmediate(() => {
    void (async () => {
      try {
        await config.refresh();
        logger.info(
          { ageMs, ...config.logContext },
          `${config.logLabel}: row refreshed`
        );
      } catch (err) {
        logger.warn(
          { err: (err as Error).message, ageMs, ...config.logContext },
          `${config.logLabel}: HubSpot fetch failed`
        );
      }
    })();
  });

  return Promise.resolve();
}

/**
 * Sprint 9.M D1 — best-effort event-log helpers.
 *
 * Before this helper, every event-recording call site (10+ across
 * `documents.service`, `documents.sync.service`, `pdf.controller`,
 * `calculator-configs.service`, `calculator-configs.sync.service`)
 * wrapped the `insertDocumentEvent` / `insertCalcConfigEvent` call
 * in identical try/catch + `logger.warn` blocks:
 *
 *   try {
 *     await insertDocumentEvent({...});
 *   } catch (eventErr) {
 *     logger.warn(
 *       { documentId, err: (eventErr as Error).message },
 *       "[X] failed to record Y event"
 *     );
 *   }
 *
 * Why best-effort: events are an audit niceity, not a transactional
 * invariant. A failed event INSERT (e.g. DB blip while the upstream
 * HubSpot operation succeeded) should NOT roll back or fail the
 * primary operation. We log WARN and move on; ops can replay from
 * server logs if a single event slips.
 *
 * Why one helper instead of two: the two repository insert functions
 * (`insertDocumentEvent`, `insertCalcConfigEvent`) have different
 * input shapes due to the `documentId` vs `calculatorConfigId` field
 * naming. Rather than abstract the FK column (which would obscure
 * the JOIN target in callers), we expose ONE helper that accepts a
 * pre-bound thunk. Callers pass a `() => insertDocumentEvent({...})`
 * — the helper's only job is to swallow + log on failure.
 */

import { logger } from "../../middleware/logger";

export interface BestEffortEventOptions {
  /**
   * Short label that prefixes the WARN log line, e.g.
   * "documents:sync" or "calc-config:auto-sync". Helps ops grep
   * for which subsystem dropped the event when scanning logs.
   */
  label: string;
  /**
   * Additional structured context attached to the log entry. The
   * entity id, document number, note id, etc. — whatever the
   * caller wants to surface for a future debugging session.
   */
  context: Record<string, unknown>;
}

/**
 * Run an event-insert and swallow any failure with a single WARN
 * log line. Returns nothing — the caller never branches on the
 * outcome (that's the whole point of "best-effort").
 *
 * Usage:
 *   await tryRecordEvent(
 *     () => insertDocumentEvent({
 *       documentId: doc.id,
 *       eventType: "synced_to_hubspot",
 *       actorUserId,
 *       meta: { noteId }
 *     }),
 *     { label: "documents:sync", context: { documentId: doc.id, noteId } }
 *   );
 */
export async function tryRecordEvent(
  insert: () => Promise<unknown>,
  options: BestEffortEventOptions
): Promise<void> {
  try {
    await insert();
  } catch (eventErr) {
    logger.warn(
      {
        ...options.context,
        err: (eventErr as Error).message
      },
      `[${options.label}] failed to record event`
    );
  }
}

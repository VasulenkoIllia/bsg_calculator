/**
 * Phase 8 Stage 4 — events repository.
 *
 * Two parallel data sources (documents + calculator_configs) sharing
 * the same operation set:
 *   - `insertDocumentEvent` / `insertCalcConfigEvent` — accept an
 *     optional `tx` so the caller can write the event in the SAME
 *     transaction as the state change it records (used by
 *     createDocument / createCalculatorConfig for atomicity).
 *   - `listDocumentEvents` / `listCalcConfigEvents` — JOIN with
 *     `users` so the row carries the actor's `displayName + email`
 *     for the FE History panel without an N+1.
 *
 * Why two parallel sets instead of one parameterized helper:
 *   - Drizzle's table refs are nominal — `documentEvents` and
 *     `calculatorConfigEvents` aren't structurally substitutable in
 *     TS. The boilerplate cost is one repo function per direction;
 *     trying to abstract would force `sql`-tagged template strings
 *     that lose the schema-derived typings.
 */

import { desc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "../../db/client";
import {
  calculatorConfigEvents,
  documentEvents,
  users,
  type CalcConfigEventType,
  type CalculatorConfigEvent,
  type DocumentEvent,
  type DocumentEventType
} from "../../db/schema";

/**
 * Row shape returned by listDocumentEvents / listCalcConfigEvents.
 * Mirrors the audit-trail row exposed via the public DTO — actor
 * surfaces as `displayName + email` (or `null` for system events
 * where the actor user was deleted at some point).
 */
export interface EventRowWithActor {
  id: string;
  eventType: string;
  meta: unknown;
  createdAt: Date;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
}

// ────────────────────────────────────────────────────────────────────
// Documents
// ────────────────────────────────────────────────────────────────────

export interface InsertDocumentEventInput {
  documentId: string;
  eventType: DocumentEventType;
  actorUserId: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Insert one document event. Pass `tx` to attach the insert to the
 * caller's transaction (used by createDocument so the 'created'
 * event lands atomically with the documents row); omit to use the
 * global pool connection (used by post-commit recorders like
 * sync.service after the HubSpot round-trip).
 *
 * Returns the inserted row — useful in tests for assertion on
 * `created_at` ordering. Production callers usually `void` the result.
 */
export async function insertDocumentEvent(
  input: InsertDocumentEventInput,
  tx: DbOrTx = db
): Promise<DocumentEvent> {
  const rows = await tx
    .insert(documentEvents)
    .values({
      documentId: input.documentId,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      meta: input.meta ?? {}
    })
    .returning();
  if (rows.length !== 1) {
    throw new Error("[events] insertDocumentEvent returned no row");
  }
  return rows[0];
}

/**
 * Sprint 9.M M2 — cap the result set so a heavily-used document
 * (many sync retries, many PDF downloads) doesn't return thousands
 * of rows to the FE History panel. 200 events ≈ years of activity
 * for a single document at realistic usage; sufficient for the
 * intended "recent activity" UX. If we ever need older events,
 * Stage 6 can add cursor pagination matching the documents pattern.
 */
const EVENT_LIST_LIMIT = 200;

export async function listDocumentEvents(documentId: string): Promise<EventRowWithActor[]> {
  const rows = await db
    .select({
      id: documentEvents.id,
      eventType: documentEvents.eventType,
      meta: documentEvents.meta,
      createdAt: documentEvents.createdAt,
      actorUserId: documentEvents.actorUserId,
      actorDisplayName: users.displayName,
      actorEmail: users.email
    })
    .from(documentEvents)
    .leftJoin(users, eq(users.id, documentEvents.actorUserId))
    .where(eq(documentEvents.documentId, documentId))
    .orderBy(desc(documentEvents.createdAt), desc(documentEvents.id))
    .limit(EVENT_LIST_LIMIT);
  return rows;
}

// ────────────────────────────────────────────────────────────────────
// Calculator configs
// ────────────────────────────────────────────────────────────────────

export interface InsertCalcConfigEventInput {
  calculatorConfigId: string;
  eventType: CalcConfigEventType;
  actorUserId: string | null;
  meta?: Record<string, unknown>;
}

export async function insertCalcConfigEvent(
  input: InsertCalcConfigEventInput,
  tx: DbOrTx = db
): Promise<CalculatorConfigEvent> {
  const rows = await tx
    .insert(calculatorConfigEvents)
    .values({
      calculatorConfigId: input.calculatorConfigId,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      meta: input.meta ?? {}
    })
    .returning();
  if (rows.length !== 1) {
    throw new Error("[events] insertCalcConfigEvent returned no row");
  }
  return rows[0];
}

export async function listCalcConfigEvents(
  calculatorConfigId: string
): Promise<EventRowWithActor[]> {
  const rows = await db
    .select({
      id: calculatorConfigEvents.id,
      eventType: calculatorConfigEvents.eventType,
      meta: calculatorConfigEvents.meta,
      createdAt: calculatorConfigEvents.createdAt,
      actorUserId: calculatorConfigEvents.actorUserId,
      actorDisplayName: users.displayName,
      actorEmail: users.email
    })
    .from(calculatorConfigEvents)
    .leftJoin(users, eq(users.id, calculatorConfigEvents.actorUserId))
    .where(eq(calculatorConfigEvents.calculatorConfigId, calculatorConfigId))
    .orderBy(desc(calculatorConfigEvents.createdAt), desc(calculatorConfigEvents.id))
    .limit(EVENT_LIST_LIMIT);
  return rows;
}

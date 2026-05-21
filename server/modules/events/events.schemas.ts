/**
 * Phase 8 Stage 4 — public DTO schema for an event-log entry.
 *
 * Same shape on the wire for both document_events and
 * calculator_config_events — the only thing that differs between
 * the two is the entity column on the underlying table (and the
 * allowed `eventType` values, which we don't constrain in the DTO
 * — the FE renders whatever the server returns).
 *
 * `meta` is intentionally a permissive object: each event type
 * carries its own context-specific fields (`{noteId}` on
 * `synced_to_hubspot`, `{error}` on `sync_failed`, etc.). The FE
 * History panel reads optimistically.
 *
 * `actorUserId / actorDisplayName / actorEmail` are nullable for
 * system events (e.g. `sync_failed` triggered by a background
 * auto-sync) or for events where the original actor user has been
 * deleted (ON DELETE SET NULL on the FK).
 */

import { z } from "zod";

export const publicEventSchema = z.object({
  id: z.string().uuid(),
  eventType: z.string(),
  meta: z.record(z.unknown()),
  actorUserId: z.string().uuid().nullable(),
  actorDisplayName: z.string().nullable(),
  actorEmail: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true })
});
export type PublicEvent = z.infer<typeof publicEventSchema>;

export const eventsListResponseSchema = z.object({
  items: z.array(publicEventSchema)
});
export type EventsListResponse = z.infer<typeof eventsListResponseSchema>;

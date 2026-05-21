/**
 * Phase 8 Stage 4 — events service.
 *
 * Pure read-side. The write paths live in:
 *   - `documents.service.createDocument` (created)
 *   - `documents.sync.service.syncDocumentToHubspot` (synced / failed)
 *   - `pdf.controller.downloadPdfController` (pdf_downloaded)
 *   - `calculator-configs.service.createCalculatorConfig` (created)
 *   - `calculator-configs.sync.service` (synced / failed)
 *
 * This service is the single read-side adapter that the HTTP layer
 * uses to project the repo row → public DTO.
 */

import {
  listCalcConfigEvents,
  listDocumentEvents,
  type EventRowWithActor
} from "./events.repository";
import { findByNumber } from "../documents/documents.repository";
import { findById as findCalculatorConfigById } from "../calculator-configs/calculator-configs.repository";
import { NotFoundError } from "../../shared/errors";
import { parseDtoOrInternalError } from "../../shared/dto-parse";
import {
  publicEventSchema,
  type PublicEvent
} from "./events.schemas";

function toPublic(row: EventRowWithActor): PublicEvent {
  return parseDtoOrInternalError(
    publicEventSchema,
    {
      id: row.id,
      eventType: row.eventType,
      // Mongo/Drizzle gives back the JSONB cell as an `unknown`; we
      // project as-is, the DTO schema validates it's a plain object.
      meta:
        row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
          ? (row.meta as Record<string, unknown>)
          : {},
      actorUserId: row.actorUserId,
      actorDisplayName: row.actorDisplayName,
      actorEmail: row.actorEmail,
      createdAt: row.createdAt.toISOString()
    },
    "events.toPublic"
  );
}

/**
 * Resolve a document by BSG number (the URL param the FE uses) and
 * return its events. 404 if the document doesn't exist — keeps the
 * "lookup by number then list" semantics symmetric with every other
 * /documents/:number endpoint.
 */
export async function listDocumentEventsByNumber(
  number: string
): Promise<PublicEvent[]> {
  const doc = await findByNumber(number);
  if (!doc) throw new NotFoundError("Document");
  const rows = await listDocumentEvents(doc.id);
  return rows.map(toPublic);
}

/**
 * Resolve a calc-config by UUID and return its events. 404 if the
 * id is unknown.
 */
export async function listCalcConfigEventsById(
  id: string
): Promise<PublicEvent[]> {
  const calc = await findCalculatorConfigById(id);
  if (!calc) throw new NotFoundError("Calculator config");
  const rows = await listCalcConfigEvents(calc.id);
  return rows.map(toPublic);
}

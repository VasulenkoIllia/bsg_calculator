/**
 * Phase 8 Stage 4 — events HTTP controllers.
 *
 *   GET /api/v1/documents/:number/events         → list document events
 *   GET /api/v1/calculator-configs/:id/events    → list calc-config events
 *
 * Both wired by their respective router files (NOT a standalone
 * events router) so the URL hierarchy reads as entity-first:
 *   /documents/BSG-XXX/events  not  /events/document/BSG-XXX
 *
 * Auth: `requireAuth()` only. Per the Phase 8 capability matrix,
 * any authenticated user can READ events. The write paths are gated
 * by the parent endpoints (sync = admin, etc.).
 */

import type { Request, Response } from "express";
import { parseUuidParam } from "../../shared/uuid-param";
import {
  listCalcConfigEventsById,
  listDocumentEventsByNumber
} from "./events.service";

export async function listDocumentEventsController(
  req: Request,
  res: Response
): Promise<void> {
  const number = req.params.number;
  // Sprint 9.M B5/B6 — pass the caller's role through so soft-deleted
  // documents are 404'd for non-super_admin. Mirrors the gate on
  // getDocumentByNumber.
  const items = await listDocumentEventsByNumber(
    number,
    req.user?.role ?? "user"
  );
  res.status(200).json({ items });
}

export async function listCalcConfigEventsController(
  req: Request,
  res: Response
): Promise<void> {
  const id = parseUuidParam(req, "id");
  const items = await listCalcConfigEventsById(id);
  res.status(200).json({ items });
}

/**
 * Fail-loud column resolution.
 *
 * WHY THIS EXISTS: between 2026-08-22 and 2026-08-27 the operator rebuilt
 * the boards and FOUR of the columns this integration maps onto were
 * deleted and replaced (`Company type`, `Lifecycle Stage`, `Partner Status`
 * and `Deal Stage` — all dropdowns, all now status columns with new ids).
 * Nothing announced it. A mapper with hardcoded ids would have written
 * NULL over `company_type`, `lifecycle_stage` and `stage` on 72 rows and
 * reported a successful sync.
 *
 * So ids are never trusted on their own:
 *   1. try the remembered id (fast path, exact);
 *   2. fall back to title + type, which survives a delete-and-recreate;
 *   3. required column unresolved or ambiguous -> THROW at boot.
 *      Optional column unresolved -> mark unavailable and, crucially,
 *      the mapper then LEAVES THE EXISTING VALUE ALONE rather than
 *      nulling it.
 */

import { logger } from "../../middleware/logger";
import { CrmUnreachableError } from "../../shared/errors";
import { monday } from "./monday.client";
import type { MondayColumn } from "./monday.types";

export interface ColumnSpec {
  /** Our stable name for the field. */
  key: string;
  /** Title as it reads in the monday UI. Survives a delete-and-recreate. */
  title: string;
  /** Column type monday reports. Guards against a same-titled wrong column. */
  type: string;
  /** Last known id — a hint, never the sole authority. */
  hintId?: string;
  /**
   * Required columns stop the sync when missing. Only mark a column
   * required when its absence makes the data WRONG rather than merely
   * incomplete — today that is exactly one column, the deal's link to its
   * company. Everything else is display detail.
   */
  required?: boolean;
}

export interface ResolvedColumns {
  boardId: string;
  /** key -> column id. Absent key = unresolved optional column. */
  byKey: Map<string, string>;
  /** Columns we could not resolve, for the health surface. */
  unresolved: string[];
}

export const COMPANY_COLUMNS: ColumnSpec[] = [
  { key: "status", title: "Status", type: "status", hintId: "color_mm6hp7ht" },
  { key: "segmentType", title: "Segment Type", type: "dropdown", hintId: "dropdown_mm6bzwfm" },
  { key: "deals", title: "Deals", type: "board_relation", hintId: "board_relation_mm6b3w0h" },
  { key: "bsgId", title: "BSG ID", type: "text", hintId: "text_mm6md0ww" }
];

export const AGENT_COLUMNS: ColumnSpec[] = [
  { key: "partnerStatus", title: "Partner Status", type: "status", hintId: "color_mm6hgbtv" },
  { key: "segmentType", title: "Segment Type", type: "dropdown", hintId: "dropdown_mm6bhbc8" },
  { key: "lifecycleStage", title: "Lifecycle Stage", type: "dropdown", hintId: "dropdown_mm6bqxnr" },
  { key: "legacyHubspotId", title: "Id", type: "text", hintId: "text_mm6b8spx" },
  { key: "bsgId", title: "BSG ID", type: "text", hintId: "text_mm6mrvtb" }
];

export const DEAL_COLUMNS: ColumnSpec[] = [
  {
    key: "company",
    title: "Company (M)",
    type: "board_relation",
    hintId: "board_relation_mm6bmb7",
    // The ONLY required column in the whole integration. Without it a
    // deal has no parent, and `deals.hubspot_company_id` is NOT NULL —
    // so a missing link is not a cosmetic gap, it is an unusable row.
    // Note the board carries a SECOND relation to the same board
    // ("link to Companies (M) (Gateway)", added 2026-08-25); the
    // operator confirmed this one is authoritative.
    required: true
  },
  { key: "agent", title: "Agent (A)", type: "board_relation", hintId: "board_relation_mm6b5w6q" },
  { key: "status", title: "Status", type: "status", hintId: "color_mm6hfzy3" },
  { key: "orderRef", title: "Order Reference Number", type: "text", hintId: "text_mm6b2j7s" }
];

function resolveOne(
  spec: ColumnSpec,
  columns: MondayColumn[],
  boardId: string
): { id: string | null; how: string } {
  // 1. remembered id, but only if the type still matches — a recreated
  //    column can reuse an id shape while being a different thing.
  if (spec.hintId) {
    const byId = columns.find(c => c.id === spec.hintId);
    if (byId && byId.type === spec.type) return { id: byId.id, how: "id" };
    if (byId && byId.type !== spec.type) {
      logger.warn(
        { boardId, key: spec.key, hintId: spec.hintId, expected: spec.type, actual: byId.type },
        "[monday:columns] remembered id now points at a DIFFERENT column type — ignoring it"
      );
    }
  }

  // 2. title + type.
  const byTitle = columns.filter(c => c.title.trim() === spec.title && c.type === spec.type);
  if (byTitle.length === 1) {
    return { id: byTitle[0].id, how: spec.hintId ? "title (id changed)" : "title" };
  }
  if (byTitle.length > 1) {
    // Never guess between duplicates — that is how a mapper silently
    // starts reading the wrong column.
    logger.error(
      { boardId, key: spec.key, title: spec.title, candidates: byTitle.map(c => c.id) },
      "[monday:columns] AMBIGUOUS — several columns share this title and type"
    );
    return { id: null, how: "ambiguous" };
  }
  return { id: null, how: "missing" };
}

export async function resolveBoardColumns(
  boardId: string,
  specs: ColumnSpec[]
): Promise<ResolvedColumns> {
  const columns = await monday.listBoardColumns(boardId);
  if (columns.length === 0) {
    throw new CrmUnreachableError(
      `monday board ${boardId} returned no columns — the board id is wrong, or the token cannot see it.`,
      { boardId }
    );
  }

  const byKey = new Map<string, string>();
  const unresolved: string[] = [];

  for (const spec of specs) {
    const { id, how } = resolveOne(spec, columns, boardId);
    if (id) {
      byKey.set(spec.key, id);
      if (how !== "id") {
        logger.warn(
          { boardId, key: spec.key, resolvedId: id, hintId: spec.hintId, how },
          "[monday:columns] resolved by title — the column id changed since it was last recorded. " +
            "Update the hintId in monday.columns.ts so the fast path works again."
        );
      }
      continue;
    }

    unresolved.push(spec.key);
    if (spec.required) {
      throw new CrmUnreachableError(
        `monday board ${boardId}: required column "${spec.title}" (${spec.type}) is ${how}. ` +
          "Refusing to sync — proceeding would write incomplete rows and report success.",
        { boardId, key: spec.key, title: spec.title, how }
      );
    }
    logger.error(
      { boardId, key: spec.key, title: spec.title, type: spec.type, how },
      "[monday:columns] optional column unresolved — the mapper will PRESERVE existing values for it rather than nulling them"
    );
  }

  logger.info(
    { boardId, resolved: byKey.size, unresolved: unresolved.length },
    "[monday:columns] column map ready"
  );
  return { boardId, byKey, unresolved };
}

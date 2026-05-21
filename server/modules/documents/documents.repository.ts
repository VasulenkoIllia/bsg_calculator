/**
 * Documents DB access.
 *
 * Two transactional paths:
 *   - `insertDocumentWithNumber(tx, body)` — call inside a TX after
 *     `allocateNextNumber(tx)`. The TX serialises numbering allocation
 *     with the document INSERT so a rollback returns the number to
 *     the pool.
 *   - `findById / findByNumber / list / patchSyncState` — non-TX
 *     reads used by the GET endpoints.
 *
 * Sprint 6.8: list endpoint now JOINs companies (mirrors Sprint 6.7
 * on /calculator-configs) AND accepts a per-column SortSpec. The
 * cursor predicate switches shape per chosen sort field.
 */

import { and, asc, desc, eq, gt, ilike, lt, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "../../db/client";
import {
  calculatorConfigs,
  companies,
  documents,
  type CalculatorConfig,
  type Document,
  type NewDocument
} from "../../db/schema";
import {
  assertCursorValueIsIsoDate,
  type SortSpec,
  type SortedCursor
} from "../../shared/sorted-pagination";

/**
 * Sprint 6.8: list-endpoint row shape that carries the parent company
 * name alongside the document row. Surfaced on the listing DTO so the
 * /documents page can render a Company column without N+1 lookups.
 */
export interface DocumentWithCompanyName extends Document {
  companyName: string;
}

/**
 * Whitelist of sortable columns on /documents. Encoded as a const
 * tuple so `parseSortQuery` can both validate input and feed the
 * type system.
 */
export const documentSortFields = [
  "number",
  "companyName",
  "scope",
  "hubspotSyncState",
  "createdAt"
] as const;
export type DocumentSortField = (typeof documentSortFields)[number];

export async function findById(id: string): Promise<Document | undefined> {
  const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return rows[0];
}

export async function findByNumber(number: string): Promise<Document | undefined> {
  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.number, number))
    .limit(1);
  return rows[0];
}

/**
 * Phase 9 — patch a document's HubSpot sync state + note id after a
 * Note write-back attempt. Used by the sync service:
 *   - `state='synced'` + `noteId='...'` after a successful POST /notes
 *   - `state='failed'` + `noteId=null` after an unrecoverable error
 *
 * Returns the updated row; undefined if no row matched (caller can
 * surface a NotFoundError).
 */
export async function updateDocumentHubspotSync(
  id: string,
  patch: {
    // Phase 8 Stage 5 widened the enum with the two delete-flow
    // transition states. The caller passes whichever is appropriate
    // for the operation in flight.
    hubspotSyncState:
      | "not_synced"
      | "synced"
      | "failed"
      | "delete_pending"
      | "delete_failed";
    hubspotNoteId: string | null;
  }
): Promise<Document | undefined> {
  const rows = await db
    .update(documents)
    .set({
      hubspotSyncState: patch.hubspotSyncState,
      hubspotNoteId: patch.hubspotNoteId,
      updatedAt: new Date()
    })
    .where(eq(documents.id, id))
    .returning();
  return rows[0];
}

/**
 * Insert a document inside an open TX. The caller is expected to have
 * just allocated the BSG-XXXXX number via `allocateNextNumber(tx)` so
 * the two operations share the same transaction.
 */
export async function insertDocumentWithNumber(
  tx: DbOrTx,
  row: NewDocument
): Promise<Document> {
  const inserted = await tx.insert(documents).values(row).returning();
  if (inserted.length !== 1) {
    throw new Error("expected exactly one row from documents INSERT");
  }
  return inserted[0];
}

export interface ListDocumentsArgs {
  companyId?: string;
  hubspotDealId?: string;
  /** Sprint 6.4: filter to documents derived from this calc-config. */
  calculatorConfigId?: string;
  scope?: "offer" | "agreement" | "offer_and_agreement";
  q?: string;
  /** Sprint 6.8: clickable-header per-column sort. */
  sort: SortSpec<DocumentSortField>;
  cursor: SortedCursor | null;
  limit: number;
  /**
   * Phase 8 Stage 5 — soft-delete visibility:
   *   - "alive" (default): hide soft-deleted rows
   *   - "deleted_only": return ONLY soft-deleted rows (for the
   *     /admin/documents/deleted page)
   *   - "include_deleted": return both (super_admin debugging path)
   * The route layer gates "deleted_only" and "include_deleted" to
   * super_admin only.
   */
  deletedScope?: "alive" | "deleted_only" | "include_deleted";
}

/**
 * Escape `%` and `_` characters in a user-supplied LIKE pattern.
 * Without this, `q=%` would match every document via `ILIKE '%%%'`,
 * `q=_` would match every single-character position, etc. Drizzle
 * already parameterises the value (no SQL injection), but LIKE
 * metacharacters are interpreted by Postgres and need explicit
 * escaping.
 *
 * Backslash is the default LIKE escape character; we double-escape
 * it first so `\` in user input is treated as a literal `\`.
 */
function escapeLikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
}

/**
 * Map a SortSpec → drizzle column ref + direction wrapper. Returns the
 * `ORDER BY` clause as an array (sort key + id tiebreaker).
 *
 * For string columns we use `LOWER(...)` so a-z and A-Z interleave
 * naturally. The cursor's `value` is also lowercased on emit, so the
 * predicate composes correctly.
 */
function buildOrderByAndCursorPredicate(
  sort: SortSpec<DocumentSortField>,
  cursor: SortedCursor | null
) {
  // ORDER BY parts. Always include id as a tiebreaker to keep
  // pagination stable across duplicate sort values.
  const orderBy = [] as ReturnType<typeof asc>[];
  let cursorPredicate: ReturnType<typeof or> | undefined;

  const dirCol = sort.dir === "asc" ? asc : desc;
  const dirCmp = sort.dir === "asc" ? gt : lt;

  // Per-field SQL expression for ORDER BY and cursor comparison.
  // Strings use LOWER() for case-insensitive A-Z ordering.
  const exprByField: Record<DocumentSortField, ReturnType<typeof sql>> = {
    // Sprint 6.9 S6: number is uppercase fixed-format
    // (BSG-XXXXXXX-XXXXXX), so LOWER() is a no-op AND prevents the
    // `documents_number_lower_idx` from being used. Compare raw —
    // and the index migration covers the LOWER variant for the
    // string columns that actually need it.
    number: sql`${documents.number}`,
    companyName: sql`LOWER(${companies.name})`,
    scope: sql`LOWER(${documents.scope})`,
    hubspotSyncState: sql`LOWER(${documents.hubspotSyncState})`,
    // createdAt is a timestamp — no LOWER, compare directly.
    createdAt: sql`${documents.createdAt}`
  };
  const expr = exprByField[sort.field];

  orderBy.push(dirCol(expr));
  orderBy.push(dirCol(documents.id));

  if (cursor) {
    // For date sort, cursor.value is ISO; cast to timestamp for the
    // comparison so it matches the timestamp column. For string sorts,
    // cursor.value is already lowercased on emit.
    //
    // Sprint 6.9 C1: validate the ISO string BEFORE constructing the
    // Date. An invalid value here would otherwise either crash inside
    // Drizzle's parameter serialization (500) or silently coerce to
    // NULL (empty result). Either is a contract bug; this is the
    // single chokepoint that converts it into a clean 400.
    let cursorValueExpr;
    if (sort.field === "createdAt") {
      assertCursorValueIsIsoDate(cursor.value);
      cursorValueExpr = sql`${new Date(cursor.value)}::timestamptz`;
    } else {
      cursorValueExpr = sql`${cursor.value}`;
    }

    cursorPredicate = or(
      dirCmp(expr, cursorValueExpr),
      and(eq(expr, cursorValueExpr), dirCmp(documents.id, cursor.id))
    );
  }

  return { orderBy, cursorPredicate };
}

/**
 * Emit the string value that should be stored in the cursor for a
 * given row + sort field. Mirrors `buildOrderByAndCursorPredicate`'s
 * LOWER() so the predicate composes with the stored value.
 *
 * Sprint 6.9 S1: explicit `: string` return type + `assertNever`
 * default arm so adding a new entry to `DocumentSortField` without
 * updating this switch becomes a COMPILE error rather than a
 * silent undefined-returning function that corrupts the cursor.
 */
export function cursorValueForRow(
  row: DocumentWithCompanyName,
  field: DocumentSortField
): string {
  switch (field) {
    case "number":
      // Sprint 6.9 S6: documents.number is uppercase fixed-format
      // (BSG-XXXXXXX-XXXXXX); LOWER() in SQL is a no-op but the
      // cursor used to .toLowerCase() to match. We now sort by raw
      // value so the cursor stays uppercase too.
      return row.number;
    case "companyName":
      return row.companyName.toLowerCase();
    case "scope":
      return row.scope.toLowerCase();
    case "hubspotSyncState":
      return row.hubspotSyncState.toLowerCase();
    case "createdAt":
      return row.createdAt.toISOString();
    default: {
      const _exhaustive: never = field;
      throw new Error(`cursorValueForRow: unhandled sort field ${String(_exhaustive)}`);
    }
  }
}

export async function listDocuments(
  args: ListDocumentsArgs
): Promise<DocumentWithCompanyName[]> {
  const { orderBy, cursorPredicate } = buildOrderByAndCursorPredicate(
    args.sort,
    args.cursor
  );

  // Phase 8 Stage 5 — soft-delete filter. Default "alive" hides
  // deleted rows from every listing. The route layer gates
  // "deleted_only" / "include_deleted" to super_admin so a regular
  // operator can't peek at soft-deleted artefacts.
  const scope = args.deletedScope ?? "alive";
  const deletedFilter =
    scope === "alive"
      ? sql`${documents.deletedAt} IS NULL`
      : scope === "deleted_only"
        ? sql`${documents.deletedAt} IS NOT NULL`
        : undefined; // include_deleted → no filter

  const filters = [
    args.companyId ? eq(documents.companyId, args.companyId) : undefined,
    args.hubspotDealId ? eq(documents.hubspotDealId, args.hubspotDealId) : undefined,
    args.calculatorConfigId
      ? eq(documents.calculatorConfigId, args.calculatorConfigId)
      : undefined,
    args.scope ? eq(documents.scope, args.scope) : undefined,
    args.q ? ilike(documents.number, `%${escapeLikePattern(args.q)}%`) : undefined,
    deletedFilter,
    cursorPredicate
  ].filter((f): f is Exclude<typeof f, undefined> => f !== undefined);

  // Sprint 6.8: JOIN companies — needed both for the companyName
  // column on the DTO and for `ORDER BY companies.name` sort.
  const rows = await db
    .select({
      doc: documents,
      companyName: companies.name
    })
    .from(documents)
    .innerJoin(companies, eq(documents.companyId, companies.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(...orderBy)
    .limit(args.limit);

  return rows.map(r => ({ ...r.doc, companyName: r.companyName }));
}

/**
 * Helper used by Flow A (POST /documents with calculatorConfigId) to
 * fetch the source calc inside the same TX. Returns undefined if the
 * config doesn't exist or belongs to a different company — both are
 * surfaced as VALIDATION_FAILED at the service layer.
 */
export async function findCalculatorConfigById(
  tx: DbOrTx,
  id: string
): Promise<CalculatorConfig | undefined> {
  const rows = await tx
    .select()
    .from(calculatorConfigs)
    .where(eq(calculatorConfigs.id, id))
    .limit(1);
  return rows[0];
}

/**
 * Phase 8 Stage 5 — soft-delete a document.
 *
 * Sets `deleted_at = now()` + actor + reason + note in one UPDATE.
 * Also clears the HubSpot Note pointer (the linked Note has just
 * been hard-deleted via the HubSpot API by the service caller) and
 * resets sync state to 'not_synced' so the row reads as "nothing
 * upstream" rather than carrying a stale 'synced' badge.
 *
 * The CHECK constraint added in migration 0010 enforces that
 * deleted_at + deleted_by_user_id move together; passing only one
 * would fail at the DB layer.
 */
export async function softDeleteDocument(
  id: string,
  actorUserId: string,
  // Sprint 9.M S4 — typed narrow to match the Drizzle column's
  // `.$type<>()` annotation. Callers (documents.service.deleteDocument)
  // already validate via the Zod schema before this point.
  reason:
    | "client_request"
    | "created_in_error"
    | "replaced_by_new_version"
    | "duplicate"
    | "other",
  note: string | null
): Promise<Document | undefined> {
  const rows = await db
    .update(documents)
    .set({
      deletedAt: new Date(),
      deletedByUserId: actorUserId,
      deletionReason: reason,
      deletionNote: note,
      hubspotSyncState: "not_synced",
      hubspotNoteId: null,
      updatedAt: new Date()
    })
    .where(eq(documents.id, id))
    .returning();
  return rows[0];
}

/**
 * Phase 8 Stage 5 — clear the soft-delete fields. Used by the
 * restore endpoint (super_admin only). HubSpot side is NOT
 * re-created — operator manually re-syncs via the existing Sync
 * button if they want the document back on the customer timeline.
 *
 * Sprint 9.M B1 fix — also reset `hubspot_sync_state` to 'not_synced'.
 * If the row was previously soft-deleted from a `delete_failed`
 * state (or any failed-state state where state != 'not_synced'),
 * restoring would leave the badge showing "delete failed" / "failed"
 * with `hubspot_note_id = null` — incoherent (nothing left to retry).
 * Reset to 'not_synced' so the restored row reads as "alive,
 * unsynced, click Sync to push" — a clean recoverable state.
 */
export async function restoreDocument(
  id: string
): Promise<Document | undefined> {
  const rows = await db
    .update(documents)
    .set({
      deletedAt: null,
      deletedByUserId: null,
      deletionReason: null,
      deletionNote: null,
      hubspotSyncState: "not_synced",
      hubspotNoteId: null,
      updatedAt: new Date()
    })
    .where(eq(documents.id, id))
    .returning();
  return rows[0];
}


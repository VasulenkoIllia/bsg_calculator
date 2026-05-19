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
import type { SortSpec, SortedCursor } from "../../shared/sorted-pagination";

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
    number: sql`LOWER(${documents.number})`,
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
    const cursorValueExpr =
      sort.field === "createdAt"
        ? sql`${new Date(cursor.value)}::timestamptz`
        : sql`${cursor.value}`;

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
 */
export function cursorValueForRow(
  row: DocumentWithCompanyName,
  field: DocumentSortField
): string {
  switch (field) {
    case "number":
      return row.number.toLowerCase();
    case "companyName":
      return row.companyName.toLowerCase();
    case "scope":
      return row.scope.toLowerCase();
    case "hubspotSyncState":
      return row.hubspotSyncState.toLowerCase();
    case "createdAt":
      return row.createdAt.toISOString();
  }
}

export async function listDocuments(
  args: ListDocumentsArgs
): Promise<DocumentWithCompanyName[]> {
  const { orderBy, cursorPredicate } = buildOrderByAndCursorPredicate(
    args.sort,
    args.cursor
  );

  const filters = [
    args.companyId ? eq(documents.companyId, args.companyId) : undefined,
    args.hubspotDealId ? eq(documents.hubspotDealId, args.hubspotDealId) : undefined,
    args.calculatorConfigId
      ? eq(documents.calculatorConfigId, args.calculatorConfigId)
      : undefined,
    args.scope ? eq(documents.scope, args.scope) : undefined,
    args.q ? ilike(documents.number, `%${escapeLikePattern(args.q)}%`) : undefined,
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


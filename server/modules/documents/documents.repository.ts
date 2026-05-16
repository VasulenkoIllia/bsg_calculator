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
 */

import { and, desc, eq, ilike, lt, or } from "drizzle-orm";
import { db, type DbOrTx } from "../../db/client";
import {
  calculatorConfigs,
  documents,
  type CalculatorConfig,
  type Document,
  type NewDocument
} from "../../db/schema";
import type { Cursor } from "../../shared/pagination";

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
  scope?: "offer" | "agreement" | "offer_and_agreement";
  q?: string;
  cursor: Cursor | null;
  limit: number;
}

export async function listDocuments(args: ListDocumentsArgs): Promise<Document[]> {
  const filters = [
    args.companyId ? eq(documents.companyId, args.companyId) : undefined,
    args.hubspotDealId ? eq(documents.hubspotDealId, args.hubspotDealId) : undefined,
    args.scope ? eq(documents.scope, args.scope) : undefined,
    args.q ? ilike(documents.number, `%${args.q}%`) : undefined,
    args.cursor
      ? or(
          lt(documents.createdAt, new Date(args.cursor.createdAt)),
          and(
            eq(documents.createdAt, new Date(args.cursor.createdAt)),
            lt(documents.id, args.cursor.id)
          )
        )
      : undefined
  ].filter((f): f is Exclude<typeof f, undefined> => f !== undefined);

  return db
    .select()
    .from(documents)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(documents.createdAt), desc(documents.id))
    .limit(args.limit);
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

/**
 * Deals DB access.
 */

import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "../../db/client";
import { deals, type Deal, type NewDeal } from "../../db/schema";
import { expectSingle } from "../../shared/db-helpers";
import {
  assertCursorValueIsIsoDate,
  type SortSpec,
  type SortedCursor
} from "../../shared/sorted-pagination";

/**
 * Sprint 7.2: whitelist of sortable columns on /deals. Same pattern
 * as documents + companies + calculator-configs.
 */
export const dealSortFields = [
  "name",
  "stage",
  "businessVertical",
  "amount",
  "hubspotModifiedAt",
  "createdAt"
] as const;
export type DealSortField = (typeof dealSortFields)[number];

export function cursorValueForRow(row: Deal, field: DealSortField): string {
  switch (field) {
    case "name":
      return row.name.toLowerCase();
    case "stage":
      return (row.stage ?? "").toLowerCase();
    case "businessVertical":
      return (row.businessVertical ?? "").toLowerCase();
    case "amount":
      // pg numeric() → JS string. Lex-sort would break ('10' < '2'),
      // so we left-pad numerically for stable ordering. NULL → '' which
      // sorts before any padded number.
      return row.amount === null ? "" : row.amount.padStart(20, "0");
    case "hubspotModifiedAt":
      return row.hubspotModifiedAt.toISOString();
    case "createdAt":
      return row.createdAt.toISOString();
    default: {
      const _exhaustive: never = field;
      throw new Error(`cursorValueForRow: unhandled sort field ${String(_exhaustive)}`);
    }
  }
}

export async function findDealById(id: string): Promise<Deal | undefined> {
  const rows = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
  return rows[0];
}

export async function findDealByHubspotId(hubspotDealId: string): Promise<Deal | undefined> {
  const rows = await db
    .select()
    .from(deals)
    .where(eq(deals.hubspotDealId, hubspotDealId))
    .limit(1);
  return rows[0];
}

export interface ListDealsArgs {
  stage?: string;
  hubspotCompanyId?: string;
  businessVertical?: string;
  /** Sprint 7.2: clickable-header per-column sort. */
  sort: SortSpec<DealSortField>;
  cursor: SortedCursor | null;
  limit: number;
}

export async function listDeals(args: ListDealsArgs): Promise<Deal[]> {
  const conditions = [];
  if (args.stage) {
    conditions.push(eq(deals.stage, args.stage));
  }
  if (args.hubspotCompanyId) {
    conditions.push(eq(deals.hubspotCompanyId, args.hubspotCompanyId));
  }
  if (args.businessVertical) {
    conditions.push(eq(deals.businessVertical, args.businessVertical));
  }

  // Sprint 7.2: per-column sort. Same pattern as companies.repository.
  // `amount` is pg numeric() → string; we left-pad in the cursor for
  // numeric ordering, but SQL-side we cast to numeric so ORDER BY
  // orders by the actual value. NULLs are COALESCE'd to 0 to land at
  // the bottom of an ASC sort (consistent with the cursor value '').
  const sortExprByField: Record<DealSortField, ReturnType<typeof sql>> = {
    name: sql`LOWER(${deals.name})`,
    stage: sql`LOWER(COALESCE(${deals.stage}, ''))`,
    businessVertical: sql`LOWER(COALESCE(${deals.businessVertical}, ''))`,
    amount: sql`COALESCE(${deals.amount}, 0)`,
    hubspotModifiedAt: sql`${deals.hubspotModifiedAt}`,
    createdAt: sql`${deals.createdAt}`
  };
  const sortExpr = sortExprByField[args.sort.field];
  const dirCol = args.sort.dir === "asc" ? asc : desc;
  const dirCmp = args.sort.dir === "asc" ? gt : lt;

  if (args.cursor) {
    const isDateSort =
      args.sort.field === "createdAt" || args.sort.field === "hubspotModifiedAt";
    let cursorValueExpr;
    if (isDateSort) {
      assertCursorValueIsIsoDate(args.cursor.value);
      cursorValueExpr = sql`${new Date(args.cursor.value)}::timestamptz`;
    } else if (args.sort.field === "amount") {
      // Cursor value was padded for lex-sort; strip leading zeroes
      // for the SQL-side numeric comparison. Empty string → 0.
      const stripped = args.cursor.value.replace(/^0+/, "") || "0";
      cursorValueExpr = sql`${stripped}::numeric`;
    } else {
      cursorValueExpr = sql`${args.cursor.value}`;
    }

    conditions.push(
      or(
        dirCmp(sortExpr, cursorValueExpr),
        and(eq(sortExpr, cursorValueExpr), dirCmp(deals.id, args.cursor.id))
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(deals)
    .where(where)
    .orderBy(dirCol(sortExpr), dirCol(deals.id))
    .limit(args.limit);
}

/**
 * Delete a single deal by HubSpot natural key. Returns the deleted
 * row or undefined if no row matched. Accepts an optional transaction
 * handle so it can compose with cascading deletes.
 */
export async function deleteDealByHubspotId(
  hubspotDealId: string,
  tx: DbOrTx = db
): Promise<Deal | undefined> {
  const rows = await tx
    .delete(deals)
    .where(eq(deals.hubspotDealId, hubspotDealId))
    .returning();
  return rows[0];
}

/**
 * Delete ALL deals belonging to a company (by HubSpot company id).
 * Used by the webhook processor on `company.deletion` events as the
 * cascading first step before deleting the parent company — without
 * this, the company DELETE would fail with FK violation (RESTRICT).
 *
 * Accepts an optional transaction handle so the caller can wrap this
 * + the company delete in one atomic step.
 */
export async function deleteDealsByCompanyId(
  hubspotCompanyId: string,
  tx: DbOrTx = db
): Promise<number> {
  const rows = await tx
    .delete(deals)
    .where(eq(deals.hubspotCompanyId, hubspotCompanyId))
    .returning({ id: deals.id });
  return rows.length;
}

/** Upsert a deal row from the HubSpot mapper output. */
export async function upsertDeal(row: NewDeal): Promise<Deal> {
  const rows = await db
    .insert(deals)
    .values(row)
    .onConflictDoUpdate({
      target: deals.hubspotDealId,
      set: {
        hubspotCompanyId: row.hubspotCompanyId,
        name: row.name,
        stage: row.stage ?? null,
        pipelineId: row.pipelineId ?? null,
        amount: row.amount ?? null,
        currency: row.currency ?? null,
        clientLabel: row.clientLabel ?? null,
        agentLabel: row.agentLabel ?? null,
        businessVertical: row.businessVertical ?? null,
        hubspotCreatedAt: row.hubspotCreatedAt,
        hubspotModifiedAt: row.hubspotModifiedAt,
        hubspotRaw: row.hubspotRaw,
        lastSyncedAt: sql`now()`,
        updatedAt: sql`now()`
      }
    })
    .returning();
  return expectSingle(rows, "upsertDeal");
}

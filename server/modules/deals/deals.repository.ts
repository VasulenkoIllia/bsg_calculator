/**
 * Deals DB access.
 */

import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "../../db/client";
import { deals, type Deal, type NewDeal } from "../../db/schema";
import { expectSingle } from "../../shared/db-helpers";
import type { Cursor } from "../../shared/pagination";

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
  cursor: Cursor | null;
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
  if (args.cursor) {
    conditions.push(
      or(
        lt(deals.createdAt, new Date(args.cursor.createdAt)),
        and(
          eq(deals.createdAt, new Date(args.cursor.createdAt)),
          lt(deals.id, args.cursor.id)
        )
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(deals)
    .where(where)
    .orderBy(desc(deals.createdAt), desc(deals.id))
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

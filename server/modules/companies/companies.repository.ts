/**
 * Companies DB access.
 *
 * - Search via pg_trgm: WHERE name ILIKE '%q%' uses the GIN index.
 * - Filter by company_type.
 * - Cursor pagination on (createdAt DESC, id DESC) for stable
 *   ordering even when timestamps collide.
 * - Upsert via ON CONFLICT (hubspot_company_id) DO UPDATE for the
 *   backfill + webhook paths.
 */

import { and, asc, desc, eq, gt, ilike, lt, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "../../db/client";
import { companies, type Company, type NewCompany } from "../../db/schema";
import { expectSingle } from "../../shared/db-helpers";
import {
  assertCursorValueIsIsoDate,
  type SortSpec,
  type SortedCursor
} from "../../shared/sorted-pagination";

/**
 * Sprint 7.2: whitelist of sortable columns on /companies. Same
 * pattern as documents + calculator-configs (see those repositories
 * for the design notes around case-insensitive LOWER() sorts and
 * the cursor predicate that mirrors the ORDER BY).
 */
export const companySortFields = [
  "name",
  "segmentType",
  "lifecycleStage",
  "hubspotModifiedAt",
  "createdAt"
] as const;
export type CompanySortField = (typeof companySortFields)[number];

/**
 * Emit the cursor value for a row given the active sort field.
 * Mirrors `LOWER(COALESCE(col, ''))` used in ORDER BY so the
 * cursor predicate composes with the stored value.
 */
export function cursorValueForRow(row: Company, field: CompanySortField): string {
  switch (field) {
    case "name":
      return row.name.toLowerCase();
    case "segmentType":
      return (row.segmentType ?? "").toLowerCase();
    case "lifecycleStage":
      return (row.lifecycleStage ?? "").toLowerCase();
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

export async function findCompanyById(id: string): Promise<Company | undefined> {
  const rows = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return rows[0];
}

export async function findCompanyByHubspotId(
  hubspotCompanyId: string
): Promise<Company | undefined> {
  const rows = await db
    .select()
    .from(companies)
    .where(eq(companies.hubspotCompanyId, hubspotCompanyId))
    .limit(1);
  return rows[0];
}

export interface ListCompaniesArgs {
  q?: string;
  /** Sprint 7.2: clickable-header per-column sort. */
  sort: SortSpec<CompanySortField>;
  cursor: SortedCursor | null;
  limit: number;
}

export async function listCompanies(args: ListCompaniesArgs): Promise<Company[]> {
  const conditions = [];
  if (args.q) {
    // pg_trgm-backed substring search. ILIKE picks up the GIN index
    // when the predicate contains a literal-substring pattern.
    conditions.push(ilike(companies.name, `%${args.q}%`));
  }

  // Sprint 7.2: per-column sort. ORDER BY (chosen, id) keeps
  // pagination stable; the cursor predicate mirrors the ORDER BY.
  // String columns use LOWER() so a-z and A-Z interleave correctly
  // (case-insensitive A-Z UX). Nullable columns COALESCE to '' so
  // NULL/empty rows cluster at one end without breaking the
  // tuple comparison.
  const sortExprByField: Record<CompanySortField, ReturnType<typeof sql>> = {
    name: sql`LOWER(${companies.name})`,
    segmentType: sql`LOWER(COALESCE(${companies.segmentType}, ''))`,
    lifecycleStage: sql`LOWER(COALESCE(${companies.lifecycleStage}, ''))`,
    hubspotModifiedAt: sql`${companies.hubspotModifiedAt}`,
    createdAt: sql`${companies.createdAt}`
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
    } else {
      cursorValueExpr = sql`${args.cursor.value}`;
    }

    conditions.push(
      or(
        dirCmp(sortExpr, cursorValueExpr),
        and(eq(sortExpr, cursorValueExpr), dirCmp(companies.id, args.cursor.id))
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(companies)
    .where(where)
    .orderBy(dirCol(sortExpr), dirCol(companies.id))
    .limit(args.limit);
}

/**
 * Upsert a company row from the HubSpot mapper output. The
 * `hubspot_company_id` UNIQUE constraint is the conflict target.
 * Always bumps `last_synced_at` and `updated_at` to now().
 */
export async function upsertCompany(row: NewCompany): Promise<Company> {
  const rows = await db
    .insert(companies)
    .values(row)
    .onConflictDoUpdate({
      target: companies.hubspotCompanyId,
      set: {
        name: row.name,
        companyType: row.companyType ?? null,
        segmentType: row.segmentType ?? null,
        lifecycleStage: row.lifecycleStage ?? null,
        hsTaskLabel: row.hsTaskLabel ?? null,
        hubspotCreatedAt: row.hubspotCreatedAt,
        hubspotModifiedAt: row.hubspotModifiedAt,
        hubspotRaw: row.hubspotRaw,
        lastSyncedAt: sql`now()`,
        updatedAt: sql`now()`
      }
    })
    .returning();
  return expectSingle(rows, "upsertCompany");
}

/**
 * Delete a company row by its HubSpot natural key.
 *
 * IMPORTANT: deals.hubspot_company_id has FK ON DELETE RESTRICT, so
 * callers MUST delete the company's deals first (or wrap the two
 * deletes in a transaction) — see deleteDealsByCompanyId in
 * deals.repository.ts. This function is the single chokepoint for
 * company deletion so any future event/cache invalidation hooks
 * (Phase 9 outbound Note write-back) land here.
 *
 * Accepts an optional transaction handle so the caller can compose
 * with the cascading deal delete inside one TX.
 *
 * Returns the deleted row, or undefined if no row matched.
 */
export async function deleteCompanyByHubspotId(
  hubspotCompanyId: string,
  tx: DbOrTx = db
): Promise<Company | undefined> {
  const rows = await tx
    .delete(companies)
    .where(eq(companies.hubspotCompanyId, hubspotCompanyId))
    .returning();
  return rows[0];
}

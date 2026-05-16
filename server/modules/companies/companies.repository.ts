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

import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { companies, type Company, type NewCompany } from "../../db/schema";
import { expectSingle } from "../../shared/db-helpers";
import type { Cursor } from "../../shared/pagination";

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
  companyType?: string;
  cursor: Cursor | null;
  limit: number;
}

export async function listCompanies(args: ListCompaniesArgs): Promise<Company[]> {
  const conditions = [];
  if (args.q) {
    // pg_trgm-backed substring search. ILIKE picks up the GIN index
    // when the predicate contains a literal-substring pattern.
    conditions.push(ilike(companies.name, `%${args.q}%`));
  }
  if (args.companyType) {
    conditions.push(eq(companies.companyType, args.companyType));
  }
  if (args.cursor) {
    // Strict less-than on (createdAt, id) — keyset pagination.
    conditions.push(
      or(
        lt(companies.createdAt, new Date(args.cursor.createdAt)),
        and(
          eq(companies.createdAt, new Date(args.cursor.createdAt)),
          lt(companies.id, args.cursor.id)
        )
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(companies)
    .where(where)
    .orderBy(desc(companies.createdAt), desc(companies.id))
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

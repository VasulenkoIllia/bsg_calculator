/**
 * Calculator-configs DB access.
 *
 * Read side: list + by-id, ordered by (createdAt DESC, id DESC) for
 * stable pagination even when timestamps collide on multi-save bursts.
 *
 * Write side: insert + update. UPDATE sets `updatedAt = now()` so
 * the listings can render "last edited X ago" without a separate
 * touch-trigger.
 *
 * The "company AND (deal IS NULL OR deal = $dealId)" picker query
 * uses the composite index defined in the schema file.
 */

import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  calculatorConfigs,
  type CalculatorConfig,
  type NewCalculatorConfig
} from "../../db/schema";
import type { Cursor } from "../../shared/pagination";

export async function findById(id: string): Promise<CalculatorConfig | undefined> {
  const rows = await db
    .select()
    .from(calculatorConfigs)
    .where(eq(calculatorConfigs.id, id))
    .limit(1);
  return rows[0];
}

export async function insertCalculatorConfig(
  row: NewCalculatorConfig
): Promise<CalculatorConfig> {
  const inserted = await db.insert(calculatorConfigs).values(row).returning();
  if (inserted.length !== 1) {
    throw new Error("expected exactly one row from INSERT");
  }
  return inserted[0];
}

export interface UpdateCalculatorConfigPatch {
  hubspotDealId?: string | null;
  title?: string | null;
  payload: unknown;
}

export async function updateCalculatorConfig(
  id: string,
  patch: UpdateCalculatorConfigPatch
): Promise<CalculatorConfig | undefined> {
  const rows = await db
    .update(calculatorConfigs)
    .set({
      hubspotDealId: patch.hubspotDealId ?? null,
      title: patch.title ?? null,
      payload: patch.payload,
      updatedAt: new Date()
    })
    .where(eq(calculatorConfigs.id, id))
    .returning();
  return rows[0];
}

export async function deleteCalculatorConfig(id: string): Promise<boolean> {
  const rows = await db
    .delete(calculatorConfigs)
    .where(eq(calculatorConfigs.id, id))
    .returning({ id: calculatorConfigs.id });
  return rows.length > 0;
}

export interface ListCalculatorConfigsArgs {
  companyId: string;
  hubspotDealId?: string;
  showAll: boolean;
  cursor: Cursor | null;
  limit: number;
}

/**
 * List configs.
 *
 * Filter logic:
 *   - showAll = true: WHERE company_id = $1
 *   - showAll = false AND hubspotDealId provided:
 *       WHERE company_id = $1
 *         AND (hubspot_deal_id IS NULL OR hubspot_deal_id = $2)
 *   - showAll = false AND hubspotDealId omitted:
 *       WHERE company_id = $1 AND hubspot_deal_id IS NULL
 *       (= "company-level drafts only" — useful for the standalone
 *        wizard entry where no deal is selected yet)
 */
export async function listCalculatorConfigs(
  args: ListCalculatorConfigsArgs
): Promise<CalculatorConfig[]> {
  const dealFilter = args.showAll
    ? undefined
    : args.hubspotDealId
      ? or(
          isNull(calculatorConfigs.hubspotDealId),
          eq(calculatorConfigs.hubspotDealId, args.hubspotDealId)
        )
      : isNull(calculatorConfigs.hubspotDealId);

  const cursorFilter = args.cursor
    ? or(
        lt(calculatorConfigs.createdAt, new Date(args.cursor.createdAt)),
        and(
          eq(calculatorConfigs.createdAt, new Date(args.cursor.createdAt)),
          lt(calculatorConfigs.id, args.cursor.id)
        )
      )
    : undefined;

  const whereFilter = and(
    eq(calculatorConfigs.companyId, args.companyId),
    dealFilter,
    cursorFilter
  );

  return db
    .select()
    .from(calculatorConfigs)
    .where(whereFilter)
    .orderBy(desc(calculatorConfigs.createdAt), desc(calculatorConfigs.id))
    .limit(args.limit);
}

/**
 * Cross-company-deal validation helper. Returns true if the given
 * deal belongs to the given company. Used to reject configs that
 * would attach a deal to the wrong company.
 *
 * Reads `deals.hubspot_company_id` (natural FK) and resolves to
 * `companies.id` (UUID). One round-trip query.
 */
export async function dealBelongsToCompany(
  hubspotDealId: string,
  companyId: string
): Promise<boolean> {
  const rows = await db.execute<{ matches: number }>(sql`
    SELECT 1 AS matches
    FROM deals d
    JOIN companies c ON c.hubspot_company_id = d.hubspot_company_id
    WHERE d.hubspot_deal_id = ${hubspotDealId}
      AND c.id = ${companyId}
    LIMIT 1
  `);
  return rows.rows.length > 0;
}

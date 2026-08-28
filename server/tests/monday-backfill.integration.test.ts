/**
 * Backfill write paths, exercised against a real Postgres.
 *
 * These exist because the backfill shipped two blockers that the rest of
 * the suite could not see — it had no coverage at all, and both faults
 * live in raw SQL that only fails when Postgres actually parses it:
 *
 *   1. the bound-deal UPDATE wrote `deals.crm_deleted_reason`, a column
 *      migration 0021 created only on `companies`;
 *   2. the missing-sweep passed a JS array into `<> ALL(...)`, which
 *      drizzle expands to a row constructor — invalid Postgres.
 *
 * Both are one-line mistakes that a type-checker cannot catch, so the
 * tests below deliberately assert on EXECUTION, not on return values.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { ResolvedColumns } from "../modules/monday/monday.columns";
import type { MondayItem } from "../modules/monday/monday.types";
import {
  emptyStats,
  flagMissing,
  upsertOneCompany,
  upsertOneDeal
} from "../modules/monday/monday.backfill";

const COMPANIES_BOARD = "5102466967";
const DEALS_BOARD = "5102466996";

const COMPANY_LINK_COL = "board_relation_mm6bmb7";

const cols = (boardId: string): ResolvedColumns => ({
  boardId,
  byKey: new Map<string, string>([["company", COMPANY_LINK_COL]]),
  unresolved: []
});

function item(id: string, name: string): MondayItem {
  return {
    id,
    name,
    state: "active",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
    column_values: []
  } as unknown as MondayItem;
}

/**
 * A deal item carrying a Company (M) link. board_relation returns ids
 * only under `linked_item_ids` — `text` and `value` are both null — so
 * the fixture has to mirror that shape or the parent lookup finds
 * nothing and the deal is (correctly) skipped.
 */
function dealItem(id: string, name: string, companyItemId: string): MondayItem {
  const base = item(id, name) as unknown as { column_values: unknown[] };
  base.column_values = [
    { id: COMPANY_LINK_COL, type: "board_relation", text: null, value: null, linked_item_ids: [companyItemId] }
  ];
  return base as unknown as MondayItem;
}

/** Give the deal a parent that upsertOneDeal will accept. */
async function seedParentCompany(itemId: string): Promise<void> {
  await upsertOneCompany(item(itemId, `Parent ${itemId}`), COMPANIES_BOARD, cols(COMPANIES_BOARD));
}

beforeEach(async () => {
  await db.execute(sql`DELETE FROM documents`);
  await db.execute(sql`DELETE FROM deals`);
  await db.execute(sql`DELETE FROM companies`);
});

describe("upsertOneDeal — the UPDATE branch touches only columns that exist", () => {
  it("updates an already-bound deal without a SQL error", async () => {
    // The insert branch was always fine; the fault was in the UPDATE, so
    // the row has to exist and be bound BEFORE the assertion runs.
    await seedParentCompany("910900");
    await upsertOneDeal(dealItem("900001", "First pass", "910900"), DEALS_BOARD, cols(DEALS_BOARD));
    const after = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM deals WHERE crm_item_id = '900001'`
    );
    expect(Number(after.rows[0]?.n)).toBe(1);

    // Second pass = the UPDATE branch. Before the fix this threw
    // 'column "crm_deleted_reason" of relation "deals" does not exist'.
    await expect(
      upsertOneDeal(dealItem("900001", "Second pass", "910900"), DEALS_BOARD, cols(DEALS_BOARD))
    ).resolves.not.toThrow();

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM deals WHERE crm_item_id = '900001'`
    );
    expect(Number(rows.rows[0]?.n)).toBe(1);
  });

  it("clears crm_missing_since and crm_deleted_at when the item is seen alive", async () => {
    await seedParentCompany("910901");
    await upsertOneDeal(dealItem("900002", "Restored", "910901"), DEALS_BOARD, cols(DEALS_BOARD));
    await db.execute(sql`
      UPDATE deals SET crm_missing_since = now(), crm_deleted_at = now()
       WHERE crm_item_id = '900002'
    `);

    await upsertOneDeal(dealItem("900002", "Restored", "910901"), DEALS_BOARD, cols(DEALS_BOARD));

    const res = await db.execute<{ missing: string | null; deleted: string | null }>(sql`
      SELECT crm_missing_since AS missing, crm_deleted_at AS deleted
        FROM deals WHERE crm_item_id = '900002'
    `);
    expect(res.rows[0]?.missing).toBeNull();
    expect(res.rows[0]?.deleted).toBeNull();
  });
});

describe("flagMissing — the id list is a real Postgres array", () => {
  // 1 absent out of 40 bound = 2.5%, under the 5% abort ratio. The ratio
  // is real behaviour, so the fixture has to be a realistic population
  // rather than three rows.
  async function seedBoundCompanies(n: number): Promise<string[]> {
    const ids = Array.from({ length: n }, (_, i) => String(910100 + i));
    for (const id of ids) {
      await upsertOneCompany(item(id, `Co ${id}`), COMPANIES_BOARD, cols(COMPANIES_BOARD));
    }
    return ids;
  }

  it("runs with a multi-id seen-list and flags only the absent row", async () => {
    const ids = await seedBoundCompanies(40);
    // A single-element list happens to be valid as a row constructor, so
    // it would NOT have caught the bug — a long list is the whole point.
    const seen = ids.slice(0, 39);
    const abort = await flagMissing("companies", seen, emptyStats());
    expect(abort).toBeNull();

    const res = await db.execute<{ id: string }>(sql`
      SELECT crm_item_id AS id FROM companies WHERE crm_missing_since IS NOT NULL
    `);
    expect(res.rows.map(r => r.id)).toEqual([ids[39]]);
  });

  it("survives a seen-list far past the row-constructor comfort zone", async () => {
    const ids = await seedBoundCompanies(21);
    // 2000 ids: well past the point where a row constructor is plausible,
    // and a scale the board will reach long before the parameter ceiling.
    const many = [...ids, ...Array.from({ length: 2000 }, (_, i) => String(920000 + i))];
    await expect(flagMissing("companies", many, emptyStats())).resolves.toBeNull();

    const res = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM companies WHERE crm_missing_since IS NOT NULL
    `);
    expect(Number(res.rows[0]?.n)).toBe(0);
  });

  it("refuses to flag anything when the seen-list is empty and everything would match", async () => {
    // 1 of 1 bound rows absent = 100% > the 5% abort ratio. The sweep must
    // report an abort string and leave the row unflagged: a board that
    // failed to page is not 100 deletions.
    await upsertOneCompany(item("910060", "Solo"), COMPANIES_BOARD, cols(COMPANIES_BOARD));
    const abort = await flagMissing("companies", [], emptyStats());
    expect(abort).toMatch(/aborting without flagging/);

    const res = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM companies WHERE crm_missing_since IS NOT NULL
    `);
    expect(Number(res.rows[0]?.n)).toBe(0);
  });

  it("refuses to flag when nothing is bound yet", async () => {
    const abort = await flagMissing("deals", ["1", "2"], emptyStats());
    expect(abort).toMatch(/nothing is bound yet/);
  });
});

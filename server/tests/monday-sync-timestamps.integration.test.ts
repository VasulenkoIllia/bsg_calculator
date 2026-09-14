/**
 * Every sync must advance the two timestamps operators and the TTL refresh
 * rely on — not only the first insert.
 *
 * Found 2026-09-14 in production: last_synced_at on bound rows still read
 * 25 May / 2 June although the scheduled backfill touched every row daily,
 * so the TTL refresh treated every row as stale and re-read it from monday
 * on every single view, and the company page showed a "last synced" date
 * from May. The "CRM updated" column (hubspot_modified_at) likewise kept
 * the HubSpot-era or creation date instead of the last change in monday.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ResolvedColumns } from "../modules/monday/monday.columns";
import type { MondayItem } from "../modules/monday/monday.types";

vi.mock("../config/env", async importOriginal => {
  const actual = await importOriginal<typeof import("../config/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      CRM_PROVIDER: "monday",
      MONDAY_API_TOKEN: "test-monday-token",
      HUBSPOT_SYNC_TTL_SECONDS: 300
    }
  };
});

const { sql, eq } = await import("drizzle-orm");
const { db } = await import("../db/client");
const { companies } = await import("../db/schema");
const { monday } = await import("../modules/monday/monday.client");
const { upsertOneCompany, upsertOneDeal } = await import("../modules/monday/monday.backfill");
const { scheduleTtlRefresh } = await import("../modules/companies/companies.service");
const { flushDetachedWork } = await import("../shared/background-work");
const { clearColumnCache } = await import("../modules/monday/monday.column-cache");

const COMPANIES_BOARD = "5102466967";
const DEALS_BOARD = "5102466996";
const COMPANY_LINK_COL = "board_relation_mm6bmb7";
const OLD = "2026-05-25T19:08:00Z";

const cols = (boardId: string): ResolvedColumns => ({
  boardId,
  byKey: new Map<string, string>([["company", COMPANY_LINK_COL]]),
  unresolved: []
});

function item(id: string, name: string, updatedAt: string | null, companyItemId?: string): MondayItem {
  return {
    id,
    name,
    state: "active",
    created_at: "2026-08-18T00:00:00Z",
    updated_at: updatedAt,
    column_values: companyItemId
      ? [{ id: COMPANY_LINK_COL, type: "board_relation", text: null, value: null, linked_item_ids: [companyItemId] }]
      : []
  } as unknown as MondayItem;
}

async function stamps(table: "companies" | "deals", itemId: string) {
  const r = await db.execute<{ synced: string | Date; modified: string | Date }>(
    table === "companies"
      ? sql`SELECT last_synced_at AS synced, hubspot_modified_at AS modified
              FROM companies WHERE crm_item_id = ${itemId} AND crm_binding_role = 'primary'`
      : sql`SELECT last_synced_at AS synced, hubspot_modified_at AS modified
              FROM deals WHERE crm_item_id = ${itemId}`
  );
  return { synced: new Date(r.rows[0].synced), modified: new Date(r.rows[0].modified) };
}

/** Put a row back into the state production was in: both stamps from May. */
async function age(table: "companies" | "deals", itemId: string) {
  if (table === "companies") {
    await db.execute(sql`UPDATE companies SET last_synced_at = ${OLD}, hubspot_modified_at = ${OLD} WHERE crm_item_id = ${itemId}`);
  } else {
    await db.execute(sql`UPDATE deals SET last_synced_at = ${OLD}, hubspot_modified_at = ${OLD} WHERE crm_item_id = ${itemId}`);
  }
}

const justNow = (d: Date) => Date.now() - d.getTime() < 60_000;

beforeEach(async () => {
  clearColumnCache();
  vi.restoreAllMocks();
  await db.execute(sql`DELETE FROM documents`);
  await db.execute(sql`DELETE FROM deals`);
  await db.execute(sql`DELETE FROM companies`);
});

afterEach(async () => {
  await flushDetachedWork();
});

describe("company sync advances its timestamps", () => {
  it("bumps last_synced_at on every update, not only on insert", async () => {
    await upsertOneCompany(item("3170216043", "BPay Payments INC", "2026-08-24T00:00:00Z"), COMPANIES_BOARD, cols(COMPANIES_BOARD), "merchant");
    await age("companies", "3170216043");

    await upsertOneCompany(item("3170216043", "BPay Payments INC", "2026-08-24T00:00:00Z"), COMPANIES_BOARD, cols(COMPANIES_BOARD), "merchant");

    expect(justNow((await stamps("companies", "3170216043")).synced)).toBe(true);
  });

  it("writes the card's last change in monday into CRM updated", async () => {
    await upsertOneCompany(item("3170216043", "BPay Payments INC", "2026-08-24T00:00:00Z"), COMPANIES_BOARD, cols(COMPANIES_BOARD), "merchant");
    await age("companies", "3170216043");

    await upsertOneCompany(item("3170216043", "BPay Payments INC", "2026-09-09T02:47:00Z"), COMPANIES_BOARD, cols(COMPANIES_BOARD), "merchant");

    expect((await stamps("companies", "3170216043")).modified.toISOString()).toBe("2026-09-09T02:47:00.000Z");
  });

  it("keeps the previous CRM updated when monday sends no updated_at", async () => {
    // Overwriting it with NULL would violate NOT NULL; overwriting it with
    // now() would lie about when the card last changed.
    await upsertOneCompany(item("3170216043", "BPay Payments INC", "2026-08-24T00:00:00Z"), COMPANIES_BOARD, cols(COMPANIES_BOARD), "merchant");
    await age("companies", "3170216043");

    await upsertOneCompany(item("3170216043", "BPay Payments INC", null), COMPANIES_BOARD, cols(COMPANIES_BOARD), "merchant");

    expect((await stamps("companies", "3170216043")).modified.toISOString()).toBe("2026-05-25T19:08:00.000Z");
  });
});

describe("deal sync advances its timestamps", () => {
  it("bumps last_synced_at and CRM updated on every update", async () => {
    await upsertOneCompany(item("3170216043", "BPay Payments INC", "2026-08-24T00:00:00Z"), COMPANIES_BOARD, cols(COMPANIES_BOARD), "merchant");
    await upsertOneDeal(item("3170216855", "BPay Payments INC (662137)", "2026-08-24T00:00:00Z", "3170216043"), DEALS_BOARD, cols(DEALS_BOARD));
    await age("deals", "3170216855");

    await upsertOneDeal(item("3170216855", "BPay Payments INC (662137)", "2026-09-07T17:11:00Z", "3170216043"), DEALS_BOARD, cols(DEALS_BOARD));

    const s = await stamps("deals", "3170216855");
    expect(justNow(s.synced)).toBe(true);
    expect(s.modified.toISOString()).toBe("2026-09-07T17:11:00.000Z");
  });
});

describe("TTL refresh groups views into one re-read", () => {
  it("re-reads a stale company once, then not again within the TTL", async () => {
    // The behaviour the frozen timestamp broke: before the fix every view
    // re-read the row, because the refresh itself never made it fresh.
    vi.spyOn(monday, "listBoardColumns").mockResolvedValue([
      { id: "color_mm6hp7ht", title: "Status", type: "status", settings_str: "{}" },
      { id: "dropdown_mm6bzwfm", title: "Segment Type", type: "dropdown", settings_str: "{}" },
      { id: "board_relation_mm6b3w0h", title: "Deals", type: "board_relation", settings_str: "{}" },
      { id: "text_mm6md0ww", title: "BSG ID", type: "text", settings_str: "{}" }
    ] as never);
    await upsertOneCompany(item("3170216043", "BPay Payments INC", "2026-08-24T00:00:00Z"), COMPANIES_BOARD, cols(COMPANIES_BOARD), "merchant");
    await age("companies", "3170216043");
    const fetch = vi
      .spyOn(monday, "getItemsById")
      .mockResolvedValue(new Map([["3170216043", item("3170216043", "BPay Payments INC", "2026-09-09T02:47:00Z") as never]]));

    const [stale] = await db.select().from(companies).where(eq(companies.crmItemId, "3170216043"));
    await scheduleTtlRefresh(stale);
    await flushDetachedWork();
    expect(fetch).toHaveBeenCalledTimes(1);

    const [fresh] = await db.select().from(companies).where(eq(companies.crmItemId, "3170216043"));
    await scheduleTtlRefresh(fresh);
    await flushDetachedWork();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

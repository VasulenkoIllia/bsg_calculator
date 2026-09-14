/**
 * A deal must belong to the company its Company (M) link names — on every
 * sync, not only when it is first created.
 *
 * Before this was fixed, syncing a deal we already had updated its name
 * and stage but never its company. A deal re-linked to another merchant in
 * monday therefore stayed under the old one in our system forever, and
 * three deals imported during the migration were stuck under their
 * referring agents — BPay Payments INC (662137) was invisible in the
 * wizard for BPay (found 2026-09-14).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ResolvedColumns } from "../modules/monday/monday.columns";
import type { MondayItem } from "../modules/monday/monday.types";

vi.mock("../config/env", async importOriginal => {
  const actual = await importOriginal<typeof import("../config/env")>();
  return { ...actual, env: { ...actual.env, CRM_PROVIDER: "monday" } };
});

const { sql } = await import("drizzle-orm");
const { db } = await import("../db/client");
const { companies } = await import("../db/schema");
const { companyFixture } = await import("./fixtures/company");
const { upsertOneCompany, upsertOneDeal } = await import("../modules/monday/monday.backfill");

const COMPANIES_BOARD = "5102466967";
const DEALS_BOARD = "5102466996";
const COMPANY_LINK_COL = "board_relation_mm6bmb7";

const cols = (boardId: string): ResolvedColumns => ({
  boardId,
  byKey: new Map<string, string>([["company", COMPANY_LINK_COL]]),
  unresolved: []
});

function item(id: string, name: string, companyItemId?: string): MondayItem {
  return {
    id,
    name,
    state: "active",
    created_at: "2026-08-18T00:00:00Z",
    updated_at: "2026-08-24T00:00:00Z",
    column_values: companyItemId
      ? [{ id: COMPANY_LINK_COL, type: "board_relation", text: null, value: null, linked_item_ids: [companyItemId] }]
      : []
  } as unknown as MondayItem;
}

async function seedMerchant(itemId: string): Promise<string> {
  await upsertOneCompany(item(itemId, `Merchant ${itemId}`), COMPANIES_BOARD, cols(COMPANIES_BOARD), "merchant");
  const r = await db.execute<{ k: string }>(sql`
    SELECT hubspot_company_id AS k FROM companies
     WHERE crm_item_id = ${itemId} AND crm_binding_role = 'primary'
  `);
  return r.rows[0].k;
}

async function seedAgent(): Promise<string> {
  const [row] = await db
    .insert(companies)
    .values(
      companyFixture({
        hubspotCompanyId: "432059832522",
        name: "(A) ConsultiPay / Monepik Limited",
        companyType: "referring_partner",
        crmItemId: "3170235162",
        crmBoardId: "5102466950",
        crmBindingRole: "primary"
      })
    )
    .returning();
  return row.hubspotCompanyId;
}

/** A deal imported during the migration under the wrong company. */
async function seedRemappedDeal(parentKey: string, itemId: string, companyItemId: string | null) {
  await db.execute(sql`
    INSERT INTO deals (
      hubspot_deal_id, hubspot_company_id, name, stage,
      hubspot_created_at, hubspot_modified_at, hubspot_raw,
      crm_item_id, crm_board_id, crm_company_item_id, monday_raw,
      crm_created_at, crm_updated_at, last_synced_at
    ) VALUES (
      ${"hs-" + itemId}, ${parentKey}, 'BPay Payments INC (662137)', 'appointmentscheduled',
      now(), now(), '{}'::jsonb,
      ${itemId}, ${DEALS_BOARD}, ${companyItemId}, '{}'::jsonb,
      now(), now(), now()
    )
  `);
}

async function parentOf(itemId: string): Promise<string> {
  const r = await db.execute<{ k: string }>(sql`
    SELECT hubspot_company_id AS k FROM deals WHERE crm_item_id = ${itemId}
  `);
  return r.rows[0].k;
}

beforeEach(async () => {
  await db.execute(sql`DELETE FROM documents`);
  await db.execute(sql`DELETE FROM deals`);
  await db.execute(sql`DELETE FROM companies`);
});

describe("upsertOneDeal — a deal follows its Company (M) link", () => {
  it("applies a change of Company (M) made in monday after the deal was created", async () => {
    // The ongoing case: an operator re-links a deal to another merchant on
    // the board. First pass is the INSERT branch, second is the UPDATE one.
    const first = await seedMerchant("3170216043");
    const second = await seedMerchant("3170299999");
    await upsertOneDeal(item("3170216855", "BPay Payments INC (662137)", "3170216043"), DEALS_BOARD, cols(DEALS_BOARD));
    expect(await parentOf("3170216855")).toBe(first);

    await upsertOneDeal(item("3170216855", "BPay Payments INC (662137)", "3170299999"), DEALS_BOARD, cols(DEALS_BOARD));

    expect(await parentOf("3170216855")).toBe(second);
  });

  it("moves an imported deal stuck under its referring agent to the merchant", async () => {
    const agent = await seedAgent();
    const merchant = await seedMerchant("3170216043");
    await seedRemappedDeal(agent, "3170216855", "3170216043");

    await upsertOneDeal(item("3170216855", "BPay Payments INC (662137)", "3170216043"), DEALS_BOARD, cols(DEALS_BOARD));

    expect(await parentOf("3170216855")).toBe(merchant);
  });

  it("leaves the parent alone when Company (M) points at a card we have not bound", async () => {
    // Re-pointing to nothing would orphan the deal; keeping the old parent
    // is the only safe move until that company is bound.
    const agent = await seedAgent();
    await seedRemappedDeal(agent, "3170216855", "9999999999");

    await upsertOneDeal(item("3170216855", "BPay Payments INC (662137)", "9999999999"), DEALS_BOARD, cols(DEALS_BOARD));

    expect(await parentOf("3170216855")).toBe(agent);
  });

  it("leaves the parent alone when Company (M) is empty", async () => {
    const agent = await seedAgent();
    await seedRemappedDeal(agent, "3170216855", null);

    await upsertOneDeal(item("3170216855", "BPay Payments INC (662137)"), DEALS_BOARD, cols(DEALS_BOARD));

    expect(await parentOf("3170216855")).toBe(agent);
  });

  it("picks the PRIMARY row when the monday card is claimed by a duplicate pair", async () => {
    // Eight such pairs exist in production. Landing a deal on the alias
    // would hide it from the row operators actually use.
    const agent = await seedAgent();
    const primary = await seedMerchant("3170216043");
    await db.insert(companies).values(
      companyFixture({
        hubspotCompanyId: "436756899010",
        name: "(M) BPay Payments INC",
        crmItemId: "3170216043",
        crmBoardId: COMPANIES_BOARD,
        crmBindingRole: "alias"
      })
    );
    await seedRemappedDeal(agent, "3170216855", "3170216043");

    await upsertOneDeal(item("3170216855", "BPay Payments INC (662137)", "3170216043"), DEALS_BOARD, cols(DEALS_BOARD));

    expect(await parentOf("3170216855")).toBe(primary);
  });

  it("leaves a deal held by the ALIAS half of a duplicate pair where it is", async () => {
    // BSPOK: both rows bind to one monday card and the alias holds the
    // deal, deliberately (decided 2026-08-28). The deal is already under a
    // row bound to the right card, so it is not a mismatch and the sync
    // must not quietly move it onto the primary row.
    const primary = await seedMerchant("3170215994");
    const [alias] = await db
      .insert(companies)
      .values(
        companyFixture({
          hubspotCompanyId: "434572170473",
          name: "(M) BSPOK IT Solutions LTD",
          crmItemId: "3170215994",
          crmBoardId: COMPANIES_BOARD,
          crmBindingRole: "alias"
        })
      )
      .returning();
    await seedRemappedDeal(alias.hubspotCompanyId, "3170230001", "3170215994");

    await upsertOneDeal(item("3170230001", "BSPOK IT Solutions LTD (662129)", "3170215994"), DEALS_BOARD, cols(DEALS_BOARD));

    expect(await parentOf("3170230001")).toBe(alias.hubspotCompanyId);
    expect(await parentOf("3170230001")).not.toBe(primary);
  });

  it("is a no-op for a deal that is already under the right parent", async () => {
    const merchant = await seedMerchant("3170216043");
    await seedRemappedDeal(merchant, "3170216855", "3170216043");

    await upsertOneDeal(item("3170216855", "BPay Payments INC (662137)", "3170216043"), DEALS_BOARD, cols(DEALS_BOARD));

    expect(await parentOf("3170216855")).toBe(merchant);
  });
});

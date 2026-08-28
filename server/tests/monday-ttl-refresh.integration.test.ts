/**
 * TTL-refresh-on-read against monday — the self-healing path.
 *
 * The HubSpot era had this; the monday era did not, and that was a real
 * stability gap. Freshness rested entirely on webhooks, so a webhook
 * deleted on a board — or an event that burned its five retries — left a
 * row wrong indefinitely with nothing to notice.
 *
 * These tests pin the two properties that make it safe to run on every
 * stale read: it never fires for a row it cannot refresh, and it never
 * MUTATES anything on absence.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("../config/env", async importOriginal => {
  const actual = await importOriginal<typeof import("../config/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      CRM_PROVIDER: "monday",
      MONDAY_API_TOKEN: "test-monday-token",
      MONDAY_WEBHOOK_SECRET: "test_monday_webhook_secret",
      // 0 would disable the refresh entirely; 1s makes "stale" easy to set up.
      HUBSPOT_SYNC_TTL_SECONDS: 1
    }
  };
});

const { db } = await import("../db/client");
const { companies } = await import("../db/schema");
const { monday } = await import("../modules/monday/monday.client");
const { scheduleTtlRefresh } = await import("../modules/companies/companies.service");
const { companyFixture } = await import("./fixtures/company");
const { flushDetachedWork } = await import("../shared/background-work");
const { clearColumnCache } = await import("../modules/monday/monday.column-cache");

const ITEM_ID = "3170219470";
const BOARD = "5102466967";

function mondayItem(name: string, state = "active") {
  return {
    id: ITEM_ID,
    name,
    state,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
    column_values: []
  };
}

/** A row old enough to be past the 1s TTL. */
async function seedStale(overrides: Record<string, unknown> = {}) {
  const [row] = await db
    .insert(companies)
    .values(
      companyFixture({
        hubspotCompanyId: "ttl000000001",
        name: "Stale name",
        crmItemId: ITEM_ID,
        crmBoardId: BOARD,
        crmBindingRole: "primary",
        lastSyncedAt: new Date(Date.now() - 60_000),
        ...overrides
      })
    )
    .returning();
  return row;
}

beforeEach(() => {
  clearColumnCache();
  vi.restoreAllMocks();
  // Column resolution is not what these tests are about.
  vi.spyOn(monday, "listBoardColumns").mockResolvedValue([
    { id: "color_mm6hp7ht", title: "Status", type: "status", settings_str: "{}" },
    { id: "dropdown_mm6bzwfm", title: "Segment Type", type: "dropdown", settings_str: "{}" },
    { id: "board_relation_mm6b3w0h", title: "Deals", type: "board_relation", settings_str: "{}" },
    { id: "text_mm6md0ww", title: "BSG ID", type: "text", settings_str: "{}" }
  ] as never);
});

afterEach(async () => {
  await flushDetachedWork();
});

describe("monday TTL refresh — heals a stale row", () => {
  it("re-reads the item and applies it", async () => {
    const row = await seedStale();
    const fetch = vi
      .spyOn(monday, "getItemsById")
      .mockResolvedValue(new Map([[ITEM_ID, mondayItem("Fresh name") as never]]));

    await scheduleTtlRefresh(row);
    await flushDetachedWork();

    expect(fetch).toHaveBeenCalledWith([ITEM_ID]);
    const [after] = await db.select().from(companies).where(eq(companies.id, row.id));
    expect(after.name).toBe("Fresh name");
  });

  it("does NOT fire for a row that is still fresh", async () => {
    const row = await seedStale({ lastSyncedAt: new Date() });
    const fetch = vi.spyOn(monday, "getItemsById");

    await scheduleTtlRefresh(row);
    await flushDetachedWork();

    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("monday TTL refresh — the safety properties", () => {
  it("does NOT fire for an UNBOUND row", async () => {
    // The five test companies the remap could not match are exactly this
    // case. Without the guard every stale read of one would be a
    // guaranteed-miss API call.
    const row = await seedStale({ crmItemId: null, crmBoardId: null, crmBindingRole: null });
    const fetch = vi.spyOn(monday, "getItemsById");

    await scheduleTtlRefresh(row);
    await flushDetachedWork();

    expect(fetch).not.toHaveBeenCalled();
  });

  it("leaves the row COMPLETELY untouched when monday does not return the item", async () => {
    // Absence is not proof of deletion — a single-item fetch cannot tell
    // "deleted" from "permissions changed" or "transport failed". Only the
    // backfill, which reads a whole board and aborts on a suspicious
    // share, is allowed to draw that conclusion.
    const row = await seedStale();
    vi.spyOn(monday, "getItemsById").mockResolvedValue(new Map());

    await scheduleTtlRefresh(row);
    await flushDetachedWork();

    const [after] = await db.select().from(companies).where(eq(companies.id, row.id));
    expect(after.name).toBe("Stale name");
    expect(after.crmMissingSince).toBeNull();
    expect(after.crmDeletedAt).toBeNull();
    expect(after.crmItemId).toBe(ITEM_ID);
  });

  it("leaves the row untouched when the item is archived", async () => {
    // The archive/delete decision belongs to the webhook path, which
    // confirms against the API and honours the "archived is reversible"
    // rule. A refresh must not quietly duplicate that judgement.
    const row = await seedStale();
    vi.spyOn(monday, "getItemsById").mockResolvedValue(
      new Map([[ITEM_ID, mondayItem("Archived name", "archived") as never]])
    );

    await scheduleTtlRefresh(row);
    await flushDetachedWork();

    const [after] = await db.select().from(companies).where(eq(companies.id, row.id));
    expect(after.name).toBe("Stale name");
    expect(after.crmDeletedAt).toBeNull();
  });

  it("a failing refresh never propagates to the caller", async () => {
    // It runs detached behind a page view: an operator must never see a
    // 500 because a background refresh could not reach monday.
    const row = await seedStale();
    vi.spyOn(monday, "getItemsById").mockRejectedValue(new Error("monday is down"));

    await expect(scheduleTtlRefresh(row)).resolves.toBeUndefined();
    await flushDetachedWork();

    const [after] = await db.select().from(companies).where(eq(companies.id, row.id));
    expect(after.name).toBe("Stale name");
  });
});

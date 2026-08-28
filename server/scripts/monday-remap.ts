/**
 * Bind our rows to monday items — the remap.
 *
 *   npx tsx server/scripts/monday-remap.ts            # dry run (default)
 *   npx tsx server/scripts/monday-remap.ts --apply    # write, in ONE transaction
 *
 * Writes ONLY columns added by migrations 0020/0021. No statement in here
 * names `hubspot_company_id`, `hubspot_deal_id`, `company_id` or
 * `calculator_config_id` as a SET target, so no pre-existing foreign key
 * is exercised and nothing about the HubSpot chain changes. That is what
 * makes this reversible: `UPDATE ... SET crm_item_id = NULL` plus a
 * TRUNCATE of crm_id_map restores the exact prior state.
 *
 * Matching keys, in descending confidence:
 *   deals     — order reference number (28/28, deterministic)
 *   agents    — the HubSpot company id monday carries in its "Id" column
 *   companies — normalised name; reviewed by a human before --apply
 */

import { sql } from "drizzle-orm";
import { db, pool } from "../db/client";
import { env } from "../config/env";
import { logger } from "../middleware/logger";
import { monday } from "../modules/monday/monday.client";
import {
  AGENT_COLUMNS,
  COMPANY_COLUMNS,
  DEAL_COLUMNS,
  resolveBoardColumns,
  type ResolvedColumns
} from "../modules/monday/monday.columns";
import { agentLegacyHubspotId, dealOrderRef } from "../modules/monday/monday.mapper";
import type { MondayItem } from "../modules/monday/monday.types";

const APPLY = process.argv.includes("--apply");

// ─── name normalisation (mirrors scripts/monday-match.ts) ────────────
const stripPrefix = (s: string): string => s.replace(/^\s*\((?:m|a|t)\)\s*/i, "").trim();
const normStrict = (s: string): string => stripPrefix(s).toLowerCase().replace(/\s+/g, " ");
const normLoose = (s: string): string =>
  normStrict(s)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(ltd|limited|llc|inc|incorporated|corp|co|gmbh|oy|ab|sa|srl|pte|bv|nv|closed|on hold)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface Candidate {
  item: MondayItem;
  board: string;
  kind: "merchant" | "agent";
  cols: ResolvedColumns;
}

async function fetchAllItems(boardId: string, cols: ResolvedColumns, kind: "merchant" | "agent" | "deal") {
  const all: MondayItem[] = [];
  let cursor: string | null = null;
  const MAX_PAGES = 50;
  let page = 0;
  for (; page < MAX_PAGES; page++) {
    const res: { cursor?: string | null; items: MondayItem[] } = await monday.listBoardItems(
      boardId,
      cursor,
      100
    );
    // Recycle-bin items come back in full with state !== 'active'. Binding
    // to one would point a document at a card nobody can see.
    all.push(...res.items.filter(i => (i.state ?? "active") === "active"));
    cursor = res.cursor ?? null;
    if (!cursor) break;
  }
  // A truncated board here is worse than a crash: the unmatched rows look
  // like genuine "no candidate on the board" misses, an operator signs
  // them off, and the binding is silently wrong for the rows that were
  // never read. Raise rather than return a partial board.
  if (cursor) {
    throw new Error(
      `monday board ${boardId} (${kind}) still had more pages after ${MAX_PAGES} — refusing to remap against a partial board. Raise the page cap.`
    );
  }
  logger.info({ boardId, kind, items: all.length }, "[monday:remap] board loaded");
  return all;
}

async function main(): Promise<void> {
  if (!monday.isConfigured()) throw new Error("MONDAY_API_TOKEN is not set.");
  await monday.assertApiVersion();

  const companyCols = await resolveBoardColumns(env.MONDAY_BOARD_COMPANIES, COMPANY_COLUMNS);
  const agentCols = await resolveBoardColumns(env.MONDAY_BOARD_AGENTS, AGENT_COLUMNS);
  const dealCols = await resolveBoardColumns(env.MONDAY_BOARD_DEALS, DEAL_COLUMNS);

  const merchants = await fetchAllItems(env.MONDAY_BOARD_COMPANIES, companyCols, "merchant");
  const agents = await fetchAllItems(env.MONDAY_BOARD_AGENTS, agentCols, "agent");
  const deals = await fetchAllItems(env.MONDAY_BOARD_DEALS, dealCols, "deal");

  // ─── index monday side ─────────────────────────────────────────────
  const byStrict = new Map<string, Candidate[]>();
  const byLoose = new Map<string, Candidate[]>();
  const byLegacyId = new Map<string, Candidate>();
  const push = (m: Map<string, Candidate[]>, k: string, c: Candidate): void => {
    if (!k) return;
    const arr = m.get(k);
    if (arr) arr.push(c);
    else m.set(k, [c]);
  };
  for (const [items, board, kind, cols] of [
    [merchants, env.MONDAY_BOARD_COMPANIES, "merchant", companyCols],
    [agents, env.MONDAY_BOARD_AGENTS, "agent", agentCols]
  ] as const) {
    for (const item of items) {
      const c: Candidate = { item, board, kind, cols };
      push(byStrict, normStrict(item.name), c);
      push(byLoose, normLoose(item.name), c);
      const legacy = agentLegacyHubspotId(item, cols);
      if (legacy) byLegacyId.set(legacy, c);
    }
  }
  const dealByRef = new Map<string, MondayItem>();
  for (const item of deals) {
    const ref = dealOrderRef(item, dealCols);
    if (ref) dealByRef.set(ref, item);
  }

  // ─── our side ──────────────────────────────────────────────────────
  const ours = await db.execute<{
    id: string;
    hubspot_company_id: string;
    name: string;
    documents: number;
    calcs: number;
    deals: number;
  }>(sql`
    SELECT c.id, c.hubspot_company_id, c.name,
           (SELECT count(*)::int FROM documents d WHERE d.company_id = c.id) AS documents,
           (SELECT count(*)::int FROM calculator_configs k WHERE k.company_id = c.id) AS calcs,
           (SELECT count(*)::int FROM deals dl WHERE dl.hubspot_company_id = c.hubspot_company_id) AS deals
    FROM companies c ORDER BY c.name, c.hubspot_company_id
  `);

  interface Binding {
    localId: string;
    hubspotId: string;
    ourName: string;
    item: MondayItem;
    board: string;
    matchedBy: string;
    weight: number;
  }
  const bindings: Binding[] = [];
  const unmatched: string[] = [];

  for (const row of ours.rows) {
    let hit: Candidate | undefined;
    let how = "";
    const legacy = byLegacyId.get(row.hubspot_company_id);
    if (legacy) {
      hit = legacy;
      how = "hubspot_id";
    }
    if (!hit) {
      const s = byStrict.get(normStrict(row.name)) ?? [];
      if (s.length === 1) { hit = s[0]; how = "name_strict"; }
    }
    if (!hit) {
      const l = byLoose.get(normLoose(row.name)) ?? [];
      if (l.length === 1) { hit = l[0]; how = "name_loose"; }
    }
    if (!hit) {
      unmatched.push(`${row.name} (${row.hubspot_company_id}, докум.: ${row.documents})`);
      continue;
    }
    bindings.push({
      localId: row.id,
      hubspotId: row.hubspot_company_id,
      ourName: row.name,
      item: hit.item,
      board: hit.board,
      matchedBy: how,
      // Artifact weight decides which of two rows sharing one monday item
      // becomes 'primary'. Recency would be wrong: in four of the eight
      // duplicate pairs the NEWER row is the empty one.
      weight: row.documents * 100 + row.calcs * 10 + row.deals
    });
  }

  // primary vs alias, per monday item
  const perItem = new Map<string, Binding[]>();
  for (const b of bindings) {
    const arr = perItem.get(b.item.id);
    if (arr) arr.push(b);
    else perItem.set(b.item.id, [b]);
  }
  const role = new Map<string, "primary" | "alias">();
  const duplicates: Array<{ item: MondayItem; rows: Binding[] }> = [];
  for (const [itemId, rows] of perItem) {
    // TOTAL ordering. With weight alone, two rows of equal weight — four of
    // the eight duplicate pairs are 0 vs 0 — could swap places between
    // runs, so a re-run would try to make a different row 'primary' and hit
    // the partial unique index with a 23505 mid-transaction.
    const sorted = [...rows].sort(
      (a, b) => b.weight - a.weight || a.hubspotId.localeCompare(b.hubspotId)
    );
    sorted.forEach((b, i) => role.set(b.localId, i === 0 ? "primary" : "alias"));
    if (rows.length > 1) duplicates.push({ item: sorted[0].item, rows: sorted });
    void itemId;
  }

  // ─── report ────────────────────────────────────────────────────────
  console.log(`\nmonday: ${merchants.length} мерчантів · ${agents.length} агентів · ${deals.length} угод`);
  console.log(`наші:   ${ours.rows.length} компаній`);
  console.log(`\nЗМАТЧЕНО: ${bindings.length}   НЕ ЗМАТЧЕНО: ${unmatched.length}`);
  for (const u of unmatched) console.log(`   ✗ ${u}`);

  console.log(`\nДУБЛІ (кілька наших рядків → один item), головний обирається за вагою:`);
  for (const d of duplicates) {
    console.log(`   ${d.item.name}`);
    for (const r of d.rows) {
      console.log(`      ${role.get(r.localId)!.padEnd(7)} ${r.hubspotId}  вага=${r.weight}  (${r.ourName})`);
    }
  }

  const dealRows = await db.execute<{ id: string; hubspot_deal_id: string; name: string; order_ref: string | null }>(
    sql`SELECT id, hubspot_deal_id, name, NULLIF(hubspot_raw->>'order_reference_number','') AS order_ref FROM deals`
  );
  let dealMatched = 0;
  const dealMisses: string[] = [];
  const dealBind: Array<{ localId: string; hubspotId: string; item: MondayItem }> = [];
  for (const d of dealRows.rows) {
    const ref = d.order_ref ?? (d.name.match(/\((\d{5,8})\)/)?.[1] ?? null);
    const item = ref ? dealByRef.get(ref) : undefined;
    if (!item) { dealMisses.push(`${d.name} (ref=${ref ?? "—"})`); continue; }
    dealMatched += 1;
    dealBind.push({ localId: d.id, hubspotId: d.hubspot_deal_id, item });
  }
  console.log(`\nУГОДИ: зматчено ${dealMatched}/${dealRows.rows.length}`);
  for (const m of dealMisses) console.log(`   ✗ ${m}`);

  if (APPLY && dealMisses.length > 0 && !process.argv.includes("--allow-unmatched-deals")) {
    // A deal we cannot bind is a deal whose documents lose their pin at
    // the flip. Refuse rather than commit a partial binding; the override
    // exists so a deliberate decision is still possible, but it has to be
    // typed out.
    console.error(
      `\n❌ ${dealMisses.length} угод не зматчено — зупиняюсь. Перезапустіть із --allow-unmatched-deals, якщо це свідоме рішення.`
    );
    await pool.end();
    process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log(`\n[DRY RUN] нічого не записано. Запуск із --apply застосує це в одній транзакції.`);
    await pool.end();
    return;
  }

  // ─── apply ─────────────────────────────────────────────────────────
  await db.transaction(async tx => {
    const before = await tx.execute<{ c: number; d: number; doc: number; k: number }>(sql`
      SELECT (SELECT count(*) FROM companies) c, (SELECT count(*) FROM deals) d,
             (SELECT count(*) FROM documents) doc, (SELECT count(*) FROM calculator_configs) k
    `);

    for (const b of bindings) {
      const r = role.get(b.localId) ?? "primary";
      await tx.execute(sql`
        UPDATE companies
           SET crm_item_id = ${b.item.id},
               crm_board_id = ${b.board},
               crm_binding_role = ${r},
               legacy_hubspot_name = COALESCE(legacy_hubspot_name, name)
         WHERE id = ${b.localId}::uuid
      `);
      await tx.execute(sql`
        INSERT INTO crm_id_map (object_type, hubspot_id, crm_item_id, crm_board_id, matched_by, binding_role, local_id)
        VALUES ('company', ${b.hubspotId}, ${b.item.id}, ${b.board}, ${b.matchedBy}, ${r}, ${b.localId}::uuid)
        ON CONFLICT (object_type, hubspot_id) DO UPDATE
          SET crm_item_id = EXCLUDED.crm_item_id, matched_by = EXCLUDED.matched_by,
              binding_role = EXCLUDED.binding_role, applied_at = now()
      `);
    }

    // Deals BEFORE their children: documents.crm_deal_item_id references
    // deals.crm_item_id, and that FK validates on write.
    for (const d of dealBind) {
      const parent = firstLinked(d.item, dealCols);
      await tx.execute(sql`
        UPDATE deals
           SET crm_item_id = ${d.item.id},
               crm_board_id = ${env.MONDAY_BOARD_DEALS},
               crm_company_item_id = ${parent}
         WHERE id = ${d.localId}::uuid
      `);
      await tx.execute(sql`
        INSERT INTO crm_id_map (object_type, hubspot_id, crm_item_id, crm_board_id, matched_by, local_id)
        VALUES ('deal', ${d.hubspotId}, ${d.item.id}, ${env.MONDAY_BOARD_DEALS}, 'order_reference_number', ${d.localId}::uuid)
        ON CONFLICT (object_type, hubspot_id) DO UPDATE
          SET crm_item_id = EXCLUDED.crm_item_id, applied_at = now()
      `);
    }

    // Mirror each existing deal pin onto the monday chain.
    await tx.execute(sql`
      UPDATE documents d SET crm_deal_item_id = dl.crm_item_id
        FROM deals dl
       WHERE dl.hubspot_deal_id = d.hubspot_deal_id AND dl.crm_item_id IS NOT NULL
    `);
    await tx.execute(sql`
      UPDATE calculator_configs k SET crm_deal_item_id = dl.crm_item_id
        FROM deals dl
       WHERE dl.hubspot_deal_id = k.hubspot_deal_id AND dl.crm_item_id IS NOT NULL
    `);

    const after = await tx.execute<{ c: number; d: number; doc: number; k: number }>(sql`
      SELECT (SELECT count(*) FROM companies) c, (SELECT count(*) FROM deals) d,
             (SELECT count(*) FROM documents) doc, (SELECT count(*) FROM calculator_configs) k
    `);
    const [b0] = before.rows;
    const [a0] = after.rows;
    // RELATIVE counts, never hard-coded literals: the remap must not
    // create or destroy a single row, whatever the row counts happen to be.
    if (b0.c !== a0.c || b0.d !== a0.d || b0.doc !== a0.doc || b0.k !== a0.k) {
      throw new Error(
        `row counts changed during remap — rolling back. before=${JSON.stringify(b0)} after=${JSON.stringify(a0)}`
      );
    }
    // Every deal pin must have survived onto the new chain — on BOTH
    // tables. The same transaction writes calculator_configs pins, so
    // asserting on documents alone would let a whole class of loss commit
    // silently.
    const lost = await tx.execute<{ docs: number; calcs: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM documents
          WHERE hubspot_deal_id IS NOT NULL AND crm_deal_item_id IS NULL) AS docs,
        (SELECT count(*)::int FROM calculator_configs
          WHERE hubspot_deal_id IS NOT NULL AND crm_deal_item_id IS NULL) AS calcs
    `);
    const lostDocs = Number(lost.rows[0].docs);
    const lostCalcs = Number(lost.rows[0].calcs);
    if (lostDocs > 0 || lostCalcs > 0) {
      throw new Error(
        `${lostDocs} documents and ${lostCalcs} calc-configs kept a HubSpot deal pin but got no monday pin — rolling back.`
      );
    }
    console.log("\n✅ ЗАСТОСОВАНО (одна транзакція, перевірки пройдені)");
  });

  await pool.end();
}

function firstLinked(item: MondayItem, cols: ResolvedColumns): string | null {
  const id = cols.byKey.get("company");
  if (!id) return null;
  const cv = item.column_values.find(c => c.id === id);
  return cv?.linked_item_ids?.[0] ?? null;
}

main().catch(err => {
  logger.error({ err: (err as Error).message }, "[monday:remap] failed");
  console.error("❌", (err as Error).message);
  process.exit(1);
});

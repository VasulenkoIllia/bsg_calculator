/**
 * HubSpot → monday.com identity matching (READ-ONLY, dry-run).
 *
 * Pairs the rows we already have in Postgres (companies + deals, from the
 * restored prod copy) with the items the operator manually created in
 * monday.com. Produces a review report — it changes NOTHING, neither in
 * monday nor in the database.
 *
 * Usage:
 *   MATCH_DB_URL=postgres://bsg:bsg_dev_password@localhost:5433/bsg_prodcopy \
 *   npx tsx scripts/monday-match.ts
 *
 * Reads MONDAY_API_TOKEN from `.env` (never printed).
 *
 * Matching keys (in confidence order):
 *   deals     — `order_reference_number` (HubSpot) ↔ "Order Reference
 *               Number" text column / the "(NNNNNN)" suffix in the item
 *               name. Deterministic.
 *   agents    — HubSpot company id ↔ the "Id" text column on the
 *               Agents (A) board. Deterministic where filled.
 *   companies — normalised name (our "(M) Foo Ltd" ↔ monday "Foo Ltd").
 *               Needs human review.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

// ─── env ────────────────────────────────────────────────────────────
function loadDotenv(filePath: string): void {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadDotenv(resolve(process.cwd(), ".env"));

const TOKEN = process.env.MONDAY_API_TOKEN ?? "";
const DB_URL =
  process.env.MATCH_DB_URL ?? "postgres://bsg:bsg_dev_password@localhost:5433/bsg_prodcopy";
const OUT_DIR = process.env.MATCH_OUT_DIR ?? `${process.env.HOME}/bsg-dumps`;

if (!TOKEN) {
  console.error("MONDAY_API_TOKEN is not set in .env — aborting.");
  process.exit(1);
}

// Board ids from scripts/monday-inspect.ts (workspace "BlackStripe CRM").
const BOARD = {
  companies: "5102466967", // Companies (M) (Gateway)
  agents: "5102466950", // Agents (A)
  deals: "5102466996" // Deals (Gateway)
} as const;

const COL = {
  agentHubspotId: "text_mm6b8spx", // Agents (A) → "Id"
  dealOrderRef: "text_mm6b2j7s", // Deals → "Order Reference Number"
  dealCompanyRel: "board_relation_mm6bmb7", // Deals → "Company (M)"
  companyType: "dropdown_mm6b150e" // Companies (M) → "Company type"
} as const;

// ─── monday client (read-only, gentle) ──────────────────────────────
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

interface MondayItem {
  id: string;
  name: string;
  column_values: Array<{ id: string; text: string | null }>;
}

async function gql<T>(label: string, query: string, attempt = 0): Promise<T | null> {
  await sleep(1200);
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { Authorization: TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const text = await res.text();
  if (res.status === 429) {
    if (attempt < 3) {
      const wait = 8000 * (attempt + 1);
      console.error(`[${label}] 429 — waiting ${wait / 1000}s…`);
      await sleep(wait);
      return gql<T>(label, query, attempt + 1);
    }
    return null;
  }
  try {
    const json = JSON.parse(text) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length) {
      console.error(`[${label}] ${json.errors.map(e => e.message).join(" | ")}`);
    }
    return json.data ?? null;
  } catch {
    console.error(`[${label}] non-JSON response (HTTP ${res.status})`);
    return null;
  }
}

async function fetchBoardItems(boardId: string, label: string): Promise<MondayItem[]> {
  const all: MondayItem[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 20; page++) {
    const pageArgs: string = cursor
      ? `next_items_page (limit: 100, cursor: "${cursor}")`
      : `items_page (limit: 100)`;
    const query: string = cursor
      ? `query { ${pageArgs} { cursor items { id name column_values { id text } } } }`
      : `query { boards (ids: [${boardId}]) { ${pageArgs} { cursor items { id name column_values { id text } } } } }`;

    const data: Record<string, unknown> | null = await gql<Record<string, unknown>>(
      `${label}[p${page}]`,
      query
    );
    if (!data) break;

    interface ItemsPage {
      cursor: string | null;
      items: MondayItem[];
    }
    const node: ItemsPage | undefined = cursor
      ? (data.next_items_page as ItemsPage | undefined)
      : (data.boards as Array<{ items_page: ItemsPage }> | undefined)?.[0]?.items_page;
    if (!node) break;

    all.push(...node.items);
    cursor = node.cursor;
    if (!cursor) break;
  }
  return all;
}

function colText(item: MondayItem, columnId: string): string | null {
  const v = item.column_values.find(c => c.id === columnId)?.text;
  return v && v.length > 0 ? v : null;
}

// ─── normalisation ──────────────────────────────────────────────────
/** "(M) SKOGOS SOLUTIONS INC." → "skogos solutions inc." (punctuation kept) */
function normStrict(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^\s*\((?:m|a|t)\)\s*/i, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** "(M) ZenCreator (447290)" → "zencreator 447290" */
function normName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^\s*\((?:m|a|t)\)\s*/i, "") // BSG prefix (M)/(A)/(T)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Same, minus legal-form noise + trailing status words — looser pass. */
function normLoose(raw: string): string {
  return normName(raw)
    .replace(
      /\b(ltd|limited|llc|inc|incorporated|corp|co|gmbh|oy|ab|sa|srl|s r l|sp z o o|spzoo|pte|bv|nv|closed|on hold|test)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** "(662109)" anywhere in the string → "662109" */
function orderRefFromName(raw: string): string | null {
  const m = raw.match(/\((\d{5,8})\)/);
  return m ? m[1] : null;
}

// ─── main ───────────────────────────────────────────────────────────
interface DbCompany {
  hubspot_company_id: string;
  name: string;
  company_type: string | null;
  documents: number;
  calc_configs: number;
  deleted_in_hubspot: boolean;
}
interface DbDeal {
  hubspot_deal_id: string;
  name: string;
  order_ref: string | null;
  hubspot_company_id: string;
  docs: number;
  calcs: number;
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();

  const { rows: dbCompanies } = await client.query<DbCompany>(`
    SELECT c.hubspot_company_id, c.name, c.company_type,
           (SELECT count(*)::int FROM documents d WHERE d.company_id = c.id) AS documents,
           (SELECT count(*)::int FROM calculator_configs k WHERE k.company_id = c.id) AS calc_configs,
           (c.hubspot_deleted_at IS NOT NULL) AS deleted_in_hubspot
    FROM companies c ORDER BY c.name
  `);

  const { rows: dbDeals } = await client.query<DbDeal>(`
    SELECT d.hubspot_deal_id, d.name,
           NULLIF(d.hubspot_raw->>'order_reference_number', '') AS order_ref,
           d.hubspot_company_id,
           (SELECT count(*)::int FROM documents x WHERE x.hubspot_deal_id = d.hubspot_deal_id) AS docs,
           (SELECT count(*)::int FROM calculator_configs x WHERE x.hubspot_deal_id = d.hubspot_deal_id) AS calcs
    FROM deals d ORDER BY d.name
  `);
  await client.end();

  console.log(`DB: ${dbCompanies.length} companies, ${dbDeals.length} deals`);

  const mCompanies = await fetchBoardItems(BOARD.companies, "companies");
  const mAgents = await fetchBoardItems(BOARD.agents, "agents");
  const mDeals = await fetchBoardItems(BOARD.deals, "deals");
  console.log(
    `monday: ${mCompanies.length} companies, ${mAgents.length} agents, ${mDeals.length} deals`
  );

  // ── index monday items ────────────────────────────────────────────
  const byStrict = new Map<string, MondayItem[]>();
  const byExact = new Map<string, MondayItem[]>();
  const byLoose = new Map<string, MondayItem[]>();
  const byHubspotId = new Map<string, MondayItem>();
  const push = (map: Map<string, MondayItem[]>, k: string, v: MondayItem): void => {
    if (!k) return;
    const arr = map.get(k);
    if (arr) arr.push(v);
    else map.set(k, [v]);
  };

  for (const it of [...mCompanies, ...mAgents]) {
    push(byStrict, normStrict(it.name), it);
    push(byExact, normName(it.name), it);
    push(byLoose, normLoose(it.name), it);
    const hid = colText(it, COL.agentHubspotId);
    if (hid && /^\d{6,}$/.test(hid)) byHubspotId.set(hid, it);
  }
  const agentIds = new Set(mAgents.map(a => a.id));

  // ── match companies ───────────────────────────────────────────────
  type Row = Record<string, string | number | boolean | null>;
  const companyRows: Row[] = [];
  let exact = 0;
  let loose = 0;
  let ambiguous = 0;
  let missing = 0;
  const usedMondayIds = new Set<string>();

  for (const c of dbCompanies) {
    let hits = byHubspotId.has(c.hubspot_company_id)
      ? [byHubspotId.get(c.hubspot_company_id) as MondayItem]
      : [];
    let how = hits.length ? "hubspot_id" : "";

    if (!hits.length) {
      hits = byStrict.get(normStrict(c.name)) ?? [];
      how = hits.length ? "name_strict" : "";
    }
    if (!hits.length) {
      hits = byExact.get(normName(c.name)) ?? [];
      how = hits.length ? "name_exact" : "";
    }
    if (!hits.length) {
      hits = byLoose.get(normLoose(c.name)) ?? [];
      how = hits.length ? "name_loose" : "";
    }

    let status: string;
    if (hits.length === 1) {
      status = "MATCHED";
      if (how === "name_strict" || how === "name_exact" || how === "hubspot_id") exact++;
      else loose++;
      usedMondayIds.add(hits[0].id);
    } else if (hits.length > 1) {
      status = "AMBIGUOUS";
      ambiguous++;
    } else {
      status = "MISSING_IN_MONDAY";
      missing++;
    }

    companyRows.push({
      status,
      matched_by: how || "",
      hubspot_company_id: c.hubspot_company_id,
      our_name: c.name,
      monday_item_id: hits.length === 1 ? hits[0].id : "",
      monday_name: hits.length === 1 ? hits[0].name : hits.map(h => h.name).join(" | "),
      monday_board:
        hits.length === 1 ? (agentIds.has(hits[0].id) ? "Agents (A)" : "Companies (M)") : "",
      documents: c.documents,
      calc_configs: c.calc_configs,
      deleted_in_hubspot: c.deleted_in_hubspot,
      critical: c.documents > 0 && !c.deleted_in_hubspot
    });
  }

  const extraCompanies = [...mCompanies, ...mAgents].filter(i => !usedMondayIds.has(i.id));

  // ── match deals (deterministic via order reference) ───────────────
  const mDealByRef = new Map<string, MondayItem[]>();
  for (const it of mDeals) {
    const ref = colText(it, COL.dealOrderRef) ?? orderRefFromName(it.name);
    if (ref) push(mDealByRef, ref, it);
  }

  const dealRows: Row[] = [];
  let dealMatched = 0;
  let dealMissing = 0;
  const usedDealIds = new Set<string>();

  for (const d of dbDeals) {
    const ref = d.order_ref ?? orderRefFromName(d.name);
    const hits = ref ? (mDealByRef.get(ref) ?? []) : [];
    const status =
      hits.length === 1 ? "MATCHED" : hits.length > 1 ? "AMBIGUOUS" : "MISSING_IN_MONDAY";
    if (hits.length === 1) {
      dealMatched++;
      usedDealIds.add(hits[0].id);
    } else if (hits.length === 0) dealMissing++;

    dealRows.push({
      status,
      matched_by: hits.length ? "order_reference_number" : "",
      hubspot_deal_id: d.hubspot_deal_id,
      our_name: d.name,
      order_ref: ref,
      monday_item_id: hits.length === 1 ? hits[0].id : "",
      monday_name: hits.map(h => h.name).join(" | "),
      documents: d.docs,
      calc_configs: d.calcs
    });
  }
  const extraDeals = mDeals.filter(i => !usedDealIds.has(i.id));

  // ── report ────────────────────────────────────────────────────────
  const toCsv = (rows: Row[]): string => {
    if (!rows.length) return "";
    const head = Object.keys(rows[0]);
    const esc = (v: unknown): string => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [head.join(","), ...rows.map(r => head.map(h => esc(r[h])).join(","))].join("\n");
  };

  writeFileSync(`${OUT_DIR}/monday_match_companies.csv`, toCsv(companyRows), "utf8");
  writeFileSync(`${OUT_DIR}/monday_match_deals.csv`, toCsv(dealRows), "utf8");
  writeFileSync(
    `${OUT_DIR}/monday_match_extra.csv`,
    toCsv([
      ...extraCompanies.map(i => ({
        kind: "company",
        monday_item_id: i.id,
        monday_name: i.name,
        board: agentIds.has(i.id) ? "Agents (A)" : "Companies (M)"
      })),
      ...extraDeals.map(i => ({
        kind: "deal",
        monday_item_id: i.id,
        monday_name: i.name,
        board: "Deals (Gateway)"
      }))
    ]),
    "utf8"
  );

  const byMondayId = new Map<string, Row[]>();
  for (const r of companyRows) {
    if (r.status !== "MATCHED" || !r.monday_item_id) continue;
    const k = String(r.monday_item_id);
    const arr = byMondayId.get(k);
    if (arr) arr.push(r);
    else byMondayId.set(k, [r]);
  }
  const dupGroups = [...byMondayId.entries()].filter(([, rows]) => rows.length > 1);

  const criticalUnmatched = companyRows.filter(
    r => r.critical === true && r.status !== "MATCHED"
  );

  console.log("\n=== COMPANIES ===");
  console.log(`matched (exact/hubspot id) : ${exact}`);
  console.log(`matched (loose name)       : ${loose}`);
  console.log(`ambiguous                  : ${ambiguous}`);
  console.log(`missing in monday          : ${missing}`);
  console.log(`extra in monday            : ${extraCompanies.length}`);
  console.log(`⚠ CRITICAL unmatched       : ${criticalUnmatched.length}`);
  for (const r of criticalUnmatched) {
    console.log(`   [${r.status}] ${r.our_name} (docs: ${r.documents}) ${r.monday_name ?? ""}`);
  }

  console.log(`distinct monday items used : ${byMondayId.size}`);
  console.log(`⚠ our duplicates (N our rows → 1 monday item): ${dupGroups.length}`);
  for (const [mid, rows] of dupGroups) {
    const names = rows
      .map(r => `${r.hubspot_company_id}(docs:${r.documents})`)
      .join(" + ");
    console.log(`   monday ${mid} ← ${rows[0].our_name} : ${names}`);
  }

  console.log("\n=== DEALS ===");
  console.log(`matched (order ref) : ${dealMatched}`);
  console.log(`missing in monday   : ${dealMissing}`);
  console.log(`extra in monday     : ${extraDeals.length}`);

  console.log(`\nCSV → ${OUT_DIR}/monday_match_{companies,deals,extra}.csv`);
}

void main();

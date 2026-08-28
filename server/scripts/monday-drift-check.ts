/**
 * READ-ONLY drift check against the live monday account.
 *
 * Uses the PRODUCTION client and the PRODUCTION column specs, so it fails
 * in exactly the places the app would fail. Runs queries only — no
 * mutation is issued and nothing in monday is changed.
 *
 *   npx tsx server/scripts/monday-drift-check.ts
 */

import { sql } from "drizzle-orm";
import { db, pool } from "../db/client";
import { env } from "../config/env";
import { monday } from "../modules/monday/monday.client";
import {
  AGENT_COLUMNS,
  COMPANY_COLUMNS,
  DEAL_COLUMNS,
  type ColumnSpec
} from "../modules/monday/monday.columns";
import type { MondayItem } from "../modules/monday/monday.types";

const out: string[] = [];
const problems: string[] = [];
const notes: string[] = [];
const log = (s: string) => out.push(s);

async function allItems(boardId: string): Promise<MondayItem[]> {
  const all: MondayItem[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const res = await monday.listBoardItems(boardId, cursor, 100);
    all.push(...res.items);
    cursor = res.cursor ?? null;
    if (!cursor) break;
  }
  if (cursor) problems.push(`board ${boardId}: more than 50 pages — partial read`);
  return all;
}

async function checkColumns(boardId: string, label: string, specs: ColumnSpec[]) {
  const columns = await monday.listBoardColumns(boardId);
  log(`\n--- ${label} (${boardId}) — колонок на дошці: ${columns.length}`);
  for (const spec of specs) {
    const byId = spec.hintId ? columns.find(c => c.id === spec.hintId) : undefined;
    const byTitle = columns.find(
      c => c.title.trim().toLowerCase() === spec.title.trim().toLowerCase() && c.type === spec.type
    );
    if (byId && byId.type === spec.type) {
      log(`  ok      ${spec.key.padEnd(16)} ${spec.hintId}  "${byId.title}"`);
    } else if (byId && byId.type !== spec.type) {
      problems.push(`${label}.${spec.key}: id ${spec.hintId} існує, але тип змінився ${spec.type} -> ${byId.type}`);
      log(`  ТИП!    ${spec.key.padEnd(16)} ${spec.hintId}  тип ${spec.type} -> ${byId.type}`);
    } else if (byTitle) {
      problems.push(`${label}.${spec.key}: id змінився ${spec.hintId ?? "-"} -> ${byTitle.id} (знайдено за назвою "${spec.title}")`);
      log(`  ДРЕЙФ   ${spec.key.padEnd(16)} ${spec.hintId ?? "-"} -> ${byTitle.id}`);
    } else {
      const msg = `${label}.${spec.key}: колонки "${spec.title}" (${spec.type}) НЕМАЄ${spec.required ? " — ОБОВʼЯЗКОВА" : ""}`;
      problems.push(msg);
      log(`  ЗНИКЛА  ${spec.key.padEnd(16)} "${spec.title}" (${spec.type})${spec.required ? "  ОБОВʼЯЗКОВА" : ""}`);
    }
  }
}

async function main() {
  if (!monday.isConfigured()) throw new Error("MONDAY_API_TOKEN не заданий");

  // 1. Версія API — monday мовчки понижує нерозпізнану
  const version = await monday.query<{ version: { kind: string; value: string } }>(
    `query { version { kind value } }`, { label: "version" }
  );
  const served = version.version?.value;
  log(`Версія API: запитано ${env.MONDAY_API_VERSION}, віддано ${served} (${version.version?.kind})`);
  if (served !== env.MONDAY_API_VERSION) problems.push(`API версія: віддано ${served}, а не ${env.MONDAY_API_VERSION}`);

  // 2. План / ліміти — користувач казав, що підписку оплатять
  try {
    const acc = await monday.query<{ account: { plan?: { max_users?: number; period?: string; tier?: string; version?: number } } }>(
      `query { account { plan { max_users period tier version } } }`, { label: "plan" }
    );
    log(`План: ${JSON.stringify(acc.account?.plan ?? null)}`);
  } catch (e) {
    notes.push(`план прочитати не вдалося: ${(e as Error).message}`);
  }

  // 3. Дошки
  const boards = await monday.query<{ boards: Array<{ id: string; name: string; state: string; items_count: number }> }>(
    `query { boards (ids: [${Number(env.MONDAY_BOARD_COMPANIES)}, ${Number(env.MONDAY_BOARD_AGENTS)}, ${Number(env.MONDAY_BOARD_DEALS)}]) { id name state items_count } }`,
    { label: "boards" }
  );
  log("\nДошки:");
  const wanted = [
    [env.MONDAY_BOARD_COMPANIES, "companies"],
    [env.MONDAY_BOARD_AGENTS, "agents"],
    [env.MONDAY_BOARD_DEALS, "deals"]
  ] as const;
  for (const [id, label] of wanted) {
    const b = boards.boards?.find(x => x.id === id);
    if (!b) { problems.push(`дошка ${label} (${id}) не повернулась — видалена або немає доступу`); log(`  ЗНИКЛА  ${label} ${id}`); continue; }
    log(`  ok      ${label.padEnd(10)} ${id}  "${b.name}"  state=${b.state}  items=${b.items_count}`);
    if (b.state !== "active") problems.push(`дошка ${label} у стані ${b.state}`);
  }

  // 4. Колонки — те, на що покладається мапер
  await checkColumns(env.MONDAY_BOARD_COMPANIES, "companies", COMPANY_COLUMNS);
  await checkColumns(env.MONDAY_BOARD_AGENTS, "agents", AGENT_COLUMNS);
  await checkColumns(env.MONDAY_BOARD_DEALS, "deals", DEAL_COLUMNS);

  // 5. Елементи vs те, що привʼязано в базі
  const co = await allItems(env.MONDAY_BOARD_COMPANIES);
  const ag = await allItems(env.MONDAY_BOARD_AGENTS);
  const de = await allItems(env.MONDAY_BOARD_DEALS);
  const activeIds = (xs: MondayItem[]) => new Set(xs.filter(i => (i.state ?? "active") === "active").map(i => i.id));
  const coActive = activeIds(co), agActive = activeIds(ag), deActive = activeIds(de);
  log(`\nЕлементи: companies ${co.length} (активних ${coActive.size}), agents ${ag.length} (${agActive.size}), deals ${de.length} (${deActive.size})`);
  for (const [xs, label] of [[co, "companies"], [ag, "agents"], [de, "deals"]] as const) {
    const notActive = xs.filter(i => (i.state ?? "active") !== "active");
    if (notActive.length) log(`  ${label}: неактивних ${notActive.length} — ${notActive.slice(0, 6).map(i => `${i.id}/${i.state}`).join(", ")}`);
  }

  const boundCo = await db.execute<{ id: string; name: string }>(sql`SELECT crm_item_id AS id, name FROM companies WHERE crm_item_id IS NOT NULL`);
  const boundDe = await db.execute<{ id: string; name: string }>(sql`SELECT crm_item_id AS id, name FROM deals WHERE crm_item_id IS NOT NULL`);
  const onBoards = new Set([...coActive, ...agActive]);

  const goneCo = boundCo.rows.filter(r => !onBoards.has(r.id));
  const goneDe = boundDe.rows.filter(r => !deActive.has(r.id));
  log(`\nПривʼязано в базі: компаній ${boundCo.rows.length}, угод ${boundDe.rows.length}`);
  if (goneCo.length) { problems.push(`${goneCo.length} привʼязаних компаній більше немає активними на дошках`); log(`  ЗНИКЛИ компанії: ${goneCo.slice(0,10).map(r => `${r.id} "${r.name}"`).join("; ")}`); }
  else log("  ok      усі привʼязані компанії активні на дошках");
  if (goneDe.length) { problems.push(`${goneDe.length} привʼязаних угод більше немає активними`); log(`  ЗНИКЛИ угоди: ${goneDe.slice(0,10).map(r => `${r.id} "${r.name}"`).join("; ")}`); }
  else log("  ok      усі привʼязані угоди активні");

  const knownCo = new Set(boundCo.rows.map(r => r.id));
  const newCo = [...onBoards].filter(id => !knownCo.has(id));
  const knownDe = new Set(boundDe.rows.map(r => r.id));
  const newDe = [...deActive].filter(id => !knownDe.has(id));
  log(`  нових на дошках, ще не в базі: компаній/агентів ${newCo.length}, угод ${newDe.length}`);
  if (newCo.length) notes.push(`нових карток компаній/агентів: ${newCo.length}`);
  if (newDe.length) notes.push(`нових карток угод: ${newDe.length}`);

  // 6. Звʼязок угода -> компанія віддає linked_item_ids (не text/value)
  const relCol = DEAL_COLUMNS.find(c => c.key === "company")!;
  const cols = await monday.listBoardColumns(env.MONDAY_BOARD_DEALS);
  const relId = cols.find(c => c.type === relCol.type && c.title.trim().toLowerCase() === relCol.title.toLowerCase())?.id ?? relCol.hintId!;
  let withLink = 0;
  for (const d of de.filter(i => (i.state ?? "active") === "active")) {
    const cv = (d.column_values ?? []).find(c => c.id === relId) as { linked_item_ids?: string[] } | undefined;
    if (cv?.linked_item_ids?.length) withLink++;
  }
  log(`\nЗвʼязок "Company (M)": ${withLink} з ${deActive.size} активних угод мають linked_item_ids`);
  if (withLink !== deActive.size) problems.push(`${deActive.size - withLink} угод без звʼязку з компанією — такі угоди бекфіл пропускає`);

  // 7. Тестові записи
  const tests = [...co, ...ag, ...de].filter(i => /TEST ILLIA SYNC/i.test(i.name));
  log(`\nТестові записи "TEST ILLIA SYNC": ${tests.length}${tests.length ? " — " + tests.map(t => `${t.id}/${t.state}`).join(", ") : ""}`);

  console.log(out.join("\n"));
  console.log("\n================ ПІДСУМОК ================");
  if (problems.length === 0) console.log("ЗМІН, ЩО ЛАМАЮТЬ ІНТЕГРАЦІЮ, НЕМАЄ");
  else { console.log(`ПРОБЛЕМ: ${problems.length}`); problems.forEach(p => console.log("  ! " + p)); }
  if (notes.length) { console.log("Інформативно:"); notes.forEach(n => console.log("  · " + n)); }
}

main().then(() => pool.end()).catch(async e => { console.error("ПОМИЛКА:", e.message); await pool.end(); process.exit(1); });

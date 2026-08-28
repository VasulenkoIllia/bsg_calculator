/**
 * monday.com — READ-ONLY account discovery.
 *
 * Usage: npx tsx scripts/monday-inspect.ts
 *
 * Reads MONDAY_API_TOKEN from `.env` (same loader convention as
 * server/config/env.ts). The token is NEVER printed or written to the
 * output file.
 *
 * Runs queries only — no mutations, nothing is created or changed in
 * the monday account. Counterpart of `scripts/hubspot-inspect.ts`.
 *
 * Output:
 *   - human-readable summary on stdout
 *   - full raw JSON to the path given by MONDAY_INSPECT_OUT (default
 *     ./monday-inspect.json, which is gitignored via *.json? no — pass
 *     an out-of-repo path in practice)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotenv(resolve(process.cwd(), ".env"));

const TOKEN = process.env.MONDAY_API_TOKEN ?? "";
if (!TOKEN) {
  console.error("MONDAY_API_TOKEN is not set in .env — aborting.");
  process.exit(1);
}

const ENDPOINT = "https://api.monday.com/v2";
const OUT = process.env.MONDAY_INSPECT_OUT ?? resolve(process.cwd(), "monday-inspect.json");

// ─── GraphQL helper ─────────────────────────────────────────────────
interface GqlResult<T> {
  data?: T;
  errors?: Array<{ message: string }>;
  error_message?: string;
  account_id?: number;
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

async function gql<T>(label: string, query: string, attempt = 0): Promise<T | null> {
  // Be gentle: monday (and the Cloudflare edge in front of it) throttles
  // bursts. A small pause between calls keeps a discovery run well under
  // any per-minute budget.
  await sleep(1200);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query })
  });

  const text = await res.text();

  // 429 may arrive as a JSON body (monday) or an HTML page (edge WAF).
  // Back off and retry either way.
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") ?? "0");
    const wait = Math.max(retryAfter * 1000, 8000 * (attempt + 1));
    if (attempt < 3) {
      console.error(`[${label}] 429 — waiting ${Math.round(wait / 1000)}s and retrying…`);
      await sleep(wait);
      return gql<T>(label, query, attempt + 1);
    }
    console.error(`[${label}] 429 — retry budget exhausted.`);
    return null;
  }
  let json: GqlResult<T>;
  try {
    json = JSON.parse(text) as GqlResult<T>;
  } catch {
    console.error(`[${label}] non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`);
    return null;
  }

  if (res.status === 401 || res.status === 403) {
    console.error(`[${label}] auth rejected (HTTP ${res.status}) — check MONDAY_API_TOKEN.`);
    return null;
  }
  if (json.errors?.length) {
    console.error(`[${label}] GraphQL errors: ${json.errors.map(e => e.message).join(" | ")}`);
    return json.data ?? null;
  }
  if (json.error_message) {
    console.error(`[${label}] ${json.error_message}`);
    return null;
  }
  return json.data ?? null;
}

// ─── Types (partial — only what we read) ────────────────────────────
interface Column {
  id: string;
  title: string;
  type: string;
  settings_str?: string;
}
interface BoardBrief {
  id: string;
  name: string;
  state: string;
  board_kind: string;
  items_count: number | null;
  workspace: { id: string; name: string } | null;
}
interface BoardFull extends BoardBrief {
  columns: Column[];
  groups: Array<{ id: string; title: string }>;
}

async function main(): Promise<void> {
  const report: Record<string, unknown> = { fetchedAt: new Date().toISOString() };

  // 1. Who am I + account plan (drives rate limits).
  const me = await gql<{
    me: { id: string; name: string; email: string; is_admin: boolean | null };
  }>("me", `query { me { id name email is_admin } }`);

  const account = await gql<{
    account: {
      id: string;
      name: string;
      slug: string;
      tier: string | null;
      plan: { max_users: number | null; period: string | null; tier: string | null } | null;
    };
  }>(
    "account",
    `query { account { id name slug tier plan { max_users period tier } } }`
  );

  report.me = me?.me ?? null;
  report.account = account?.account ?? null;

  console.log("\n=== ACCOUNT ===");
  console.log(`user      : ${me?.me?.name ?? "?"} <${me?.me?.email ?? "?"}> (admin: ${me?.me?.is_admin ?? "?"})`);
  console.log(`account   : ${account?.account?.name ?? "?"} (slug: ${account?.account?.slug ?? "?"})`);
  console.log(`plan/tier : ${account?.account?.plan?.tier ?? account?.account?.tier ?? "?"}`);

  // 2. All active boards (light query).
  const boards = await gql<{ boards: BoardBrief[] }>(
    "boards",
    `query {
      boards (limit: 50, state: active) {
        id name state board_kind items_count
        workspace { id name }
      }
    }`
  );
  const boardList = boards?.boards ?? [];
  report.boards = boardList;

  console.log(`\n=== BOARDS (${boardList.length}) ===`);
  for (const b of boardList) {
    console.log(
      `${String(b.items_count ?? "?").padStart(5)} items | ${b.id.padEnd(12)} | ` +
        `${(b.workspace?.name ?? "—").padEnd(18)} | ${b.name}`
    );
  }

  // 3. Columns for every non-empty board (this is the mapping surface).
  const withItems = boardList.filter(b => (b.items_count ?? 0) > 0);
  const ids = withItems.map(b => b.id);
  const details: BoardFull[] = [];

  for (let i = 0; i < ids.length; i += 5) {
    const chunk = ids.slice(i, i + 5);
    const data = await gql<{ boards: BoardFull[] }>(
      `columns[${i}]`,
      `query {
        boards (ids: [${chunk.join(",")}]) {
          id name state board_kind items_count
          workspace { id name }
          groups { id title }
          columns { id title type settings_str }
        }
      }`
    );
    if (data?.boards) details.push(...data.boards);
  }
  report.boardDetails = details;

  console.log("\n=== COLUMNS PER BOARD ===");
  for (const b of details) {
    console.log(`\n--- ${b.name} (id ${b.id}, ${b.items_count} items) ---`);
    for (const c of b.columns) {
      console.log(`  ${c.id.padEnd(24)} ${c.type.padEnd(18)} ${c.title}`);
    }
  }

  // 4. Sample items from the 6 biggest boards, so we can see real
  //    column values (and spot a HubSpot-ID column if one exists).
  const biggest = [...withItems].sort((a, b) => (b.items_count ?? 0) - (a.items_count ?? 0)).slice(0, 6);
  const samples: Record<string, unknown> = {};

  for (const b of biggest) {
    const data = await gql<{
      boards: Array<{
        id: string;
        items_page: {
          cursor: string | null;
          items: Array<{
            id: string;
            name: string;
            column_values: Array<{ id: string; type: string; text: string | null; value: string | null }>;
          }>;
        };
      }>;
    }>(
      `sample[${b.id}]`,
      `query {
        boards (ids: [${b.id}]) {
          id
          items_page (limit: 3) {
            cursor
            items { id name column_values { id type text value } }
          }
        }
      }`
    );
    samples[b.id] = data?.boards?.[0]?.items_page ?? null;
  }
  report.samples = samples;

  console.log("\n=== SAMPLE ITEMS (first 3 per biggest board) ===");
  for (const b of biggest) {
    // Sample items expose VALUES ({id,text}), not column DEFINITIONS
    // ({id,title,type}) — a separate shape from `Column` above.
    interface SampleValue { id: string; text: string | null }
    const page = samples[b.id] as
      | { items?: Array<{ id: string; name: string; column_values: SampleValue[] }> }
      | null;
    console.log(`\n--- ${b.name} ---`);
    for (const it of page?.items ?? []) {
      const filled = it.column_values
        .filter(cv => cv.text !== null && cv.text.length > 0)
        .map(cv => `${cv.id}=${String(cv.text).slice(0, 40)}`)
        .join("; ");
      console.log(`  [${it.id}] ${it.name}\n      ${filled || "(усі колонки порожні)"}`);
    }
  }

  writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nRaw JSON → ${OUT}`);
}

void main();

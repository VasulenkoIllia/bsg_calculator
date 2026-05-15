#!/usr/bin/env tsx
/**
 * Quick one-shot: fetch ONE company from HubSpot with every property
 * the schema exposes, then print only the populated fields. Used to
 * eyeball real BSG data before deciding what to extract into named
 * columns in our `companies` table.
 *
 *   npm run hubspot:one-company
 *
 * Read-only.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const TOKEN = process.env.HUBSPOT_API_TOKEN ?? "";
const BASE = process.env.HUBSPOT_API_BASE_URL ?? "https://api.hubapi.com";

if (!TOKEN) {
  console.error("[hubspot-one-company] HUBSPOT_API_TOKEN is empty in .env");
  process.exit(1);
}

interface HubspotProperty {
  name: string;
  label: string;
  type: string;
  groupName?: string;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`HTTP ${r.status}: ${body.slice(0, 500)}`);
  }
  return (await r.json()) as T;
}

async function main(): Promise<void> {
  console.log("[hubspot-one-company] fetching property schema...");
  const schema = await get<{ results: HubspotProperty[] }>("/crm/v3/properties/companies");
  const propNames = schema.results.map(p => p.name);
  console.log(`  ${propNames.length} properties exposed by HubSpot schema`);

  console.log("[hubspot-one-company] fetching one company with all properties...");
  const list = await get<{
    results: Array<{ id: string; properties: Record<string, string | null> }>;
  }>(
    `/crm/v3/objects/companies?limit=1&properties=${encodeURIComponent(propNames.join(","))}`
  );

  if (list.results.length === 0) {
    console.log("[hubspot-one-company] No companies returned. Account empty?");
    return;
  }

  const company = list.results[0];
  console.log(`\nCompany id: ${company.id}\n`);

  // Index property schema by name for label lookup
  const schemaByName = new Map<string, HubspotProperty>();
  for (const p of schema.results) schemaByName.set(p.name, p);

  // Partition populated vs null, sorted alphabetically
  const populated: Array<{ name: string; label: string; type: string; value: string }> = [];
  const nullCount: string[] = [];

  for (const name of propNames.sort()) {
    const value = company.properties[name];
    const schemaEntry = schemaByName.get(name);
    if (!schemaEntry) continue;
    if (value === null || value === undefined || value === "") {
      nullCount.push(name);
    } else {
      populated.push({
        name,
        label: schemaEntry.label,
        type: schemaEntry.type,
        value: String(value)
      });
    }
  }

  console.log(`═══════════════════════════════════════════════════════════════════`);
  console.log(`  POPULATED FIELDS — ${populated.length} of ${propNames.length}`);
  console.log(`═══════════════════════════════════════════════════════════════════\n`);

  // Group by HubSpot's property "groupName" for readability
  const byGroup = new Map<string, typeof populated>();
  for (const row of populated) {
    const group = schemaByName.get(row.name)?.groupName ?? "(other)";
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group)!.push(row);
  }
  const groupNames = Array.from(byGroup.keys()).sort();
  for (const group of groupNames) {
    console.log(`── ${group} ──`);
    for (const row of byGroup.get(group)!) {
      const valuePreview = row.value.length > 100 ? row.value.slice(0, 100) + "…" : row.value;
      console.log(
        `  ${row.name.padEnd(45)} ${row.type.padEnd(14)} ${row.label}\n` +
          `    └─ ${valuePreview.replace(/\n/g, " · ")}`
      );
    }
    console.log("");
  }

  console.log(`(${nullCount.length} fields were null/empty in this record — hidden.)\n`);
}

main().catch(err => {
  console.error("[hubspot-one-company] failed:", err);
  process.exit(1);
});

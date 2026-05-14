#!/usr/bin/env tsx
/**
 * Fetch ONE Merchant company (company_type=direct_client OR
 * aggregating_merchant) and ONE deal from the BSG HubSpot account,
 * printing only the populated fields. Companion to
 * `hubspot-one-company.ts` (which returned a referring_partner) so
 * we can see whether Merchant records have more / different fields
 * populated.
 *
 *   npm run hubspot:merchant-and-deal
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
  console.error("[hubspot] HUBSPOT_API_TOKEN is empty in .env");
  process.exit(1);
}

interface HubspotProperty {
  name: string;
  label: string;
  type: string;
  groupName?: string;
}

interface HubspotObject {
  id: string;
  properties: Record<string, string | null>;
}

async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`HTTP ${r.status} ${path}: ${body.slice(0, 500)}`);
  }
  return (await r.json()) as T;
}

async function fetchProperties(objectType: "companies" | "deals"): Promise<HubspotProperty[]> {
  const data = await api<{ results: HubspotProperty[] }>(`/crm/v3/properties/${objectType}`);
  return data.results;
}

async function searchOneMerchant(propNames: string[]): Promise<HubspotObject | null> {
  // HubSpot Search API: POST /crm/v3/objects/companies/search.
  // Filter `company_type IN ('direct_client', 'aggregating_merchant')`.
  const data = await api<{ results: HubspotObject[] }>(
    `/crm/v3/objects/companies/search`,
    {
      method: "POST",
      body: {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "company_type",
                operator: "IN",
                values: ["direct_client", "aggregating_merchant"]
              }
            ]
          }
        ],
        properties: propNames,
        limit: 1
      }
    }
  );
  return data.results[0] ?? null;
}

async function fetchOneDeal(propNames: string[]): Promise<HubspotObject | null> {
  const data = await api<{ results: HubspotObject[] }>(
    `/crm/v3/objects/deals?limit=1&properties=${encodeURIComponent(propNames.join(","))}`
  );
  return data.results[0] ?? null;
}

function printPopulated(
  title: string,
  object: HubspotObject,
  schema: HubspotProperty[]
): void {
  const schemaByName = new Map(schema.map(p => [p.name, p]));
  const populated: Array<{ name: string; label: string; type: string; group: string; value: string }> = [];
  let nullCount = 0;

  for (const name of Object.keys(object.properties).sort()) {
    const value = object.properties[name];
    const meta = schemaByName.get(name);
    if (!meta) continue;
    if (value === null || value === undefined || value === "") {
      nullCount += 1;
    } else {
      populated.push({
        name,
        label: meta.label,
        type: meta.type,
        group: meta.groupName ?? "(other)",
        value: String(value)
      });
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════════════`);
  console.log(`  ${title}  —  id: ${object.id}`);
  console.log(`  ${populated.length} populated of ${populated.length + nullCount} requested`);
  console.log(`═══════════════════════════════════════════════════════════════════\n`);

  const byGroup = new Map<string, typeof populated>();
  for (const row of populated) {
    if (!byGroup.has(row.group)) byGroup.set(row.group, []);
    byGroup.get(row.group)!.push(row);
  }
  for (const group of Array.from(byGroup.keys()).sort()) {
    console.log(`── ${group} ──`);
    for (const row of byGroup.get(group)!) {
      const preview = row.value.length > 100 ? row.value.slice(0, 100) + "…" : row.value;
      console.log(
        `  ${row.name.padEnd(45)} ${row.type.padEnd(14)} ${row.label}\n` +
          `    └─ ${preview.replace(/\n/g, " · ")}`
      );
    }
    console.log("");
  }

  console.log(`(${nullCount} fields were null in this record.)\n`);
}

async function main(): Promise<void> {
  console.log("[hubspot] fetching property schemas...");
  const [companySchema, dealSchema] = await Promise.all([
    fetchProperties("companies"),
    fetchProperties("deals")
  ]);
  console.log(`  companies: ${companySchema.length} props`);
  console.log(`  deals:     ${dealSchema.length} props`);

  console.log("\n[hubspot] searching for 1 Merchant company (direct_client OR aggregating_merchant)...");
  const merchant = await searchOneMerchant(companySchema.map(p => p.name));
  if (!merchant) {
    console.log("  No merchant found. Showing skip.");
  } else {
    printPopulated("MERCHANT COMPANY", merchant, companySchema);
  }

  console.log("[hubspot] fetching 1 deal (no filter)...");
  const deal = await fetchOneDeal(dealSchema.map(p => p.name));
  if (!deal) {
    console.log("  No deals returned.");
  } else {
    printPopulated("DEAL", deal, dealSchema);
  }
}

main().catch(err => {
  console.error("[hubspot] failed:", err);
  process.exit(1);
});

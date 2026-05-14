#!/usr/bin/env tsx
/**
 * HubSpot inspection script.
 *
 * Run AFTER filling `HUBSPOT_API_TOKEN` in `.env`:
 *
 *   npm run hubspot:inspect
 *
 * Fetches a small sample of Companies + Deals from the connected
 * BSG HubSpot account and prints, for each object type:
 *
 *   - the full list of property names that came back
 *   - which properties had a non-null value in the sample
 *   - which properties were always null in the sample
 *   - one example value per non-null property
 *
 * Purpose: decide which HubSpot fields to extract into named columns
 * on our `companies` / `deals` tables vs keep in the `hubspot_raw`
 * JSONB blob. Output is human-readable, not machine-consumed.
 *
 * Read-only. Does NOT write or modify anything in HubSpot.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── tiny .env loader (avoid pulling dotenv just for one script) ───
function loadDotenv(filePath: string): void {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return; // no .env file is fine — env may already be in process.env
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotenv(resolve(process.cwd(), ".env"));

const TOKEN = process.env.HUBSPOT_API_TOKEN ?? "";
const BASE = process.env.HUBSPOT_API_BASE_URL ?? "https://api.hubapi.com";

if (!TOKEN) {
  console.error(
    "[hubspot-inspect] ERROR: HUBSPOT_API_TOKEN is empty.\n" +
      "Fill it in `.env` (root of the repo). Token format: `pat-eu1-...`."
  );
  process.exit(1);
}

const SAMPLE_SIZE = 5;

// HubSpot returns only a SMALL default set of properties unless you
// explicitly request them. To see ALL properties on each object, we
// first fetch the property schema for the object type, then request
// every property name as a `properties=` query.

interface HubspotProperty {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  description?: string;
}

interface HubspotPropertiesResponse {
  results: HubspotProperty[];
}

interface HubspotObjectsResponse {
  results: Array<{
    id: string;
    properties: Record<string, string | null>;
    createdAt: string;
    updatedAt: string;
  }>;
  paging?: { next?: { after: string } };
}

async function get<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `[hubspot-inspect] HTTP ${response.status} on ${url}\n${body.slice(0, 500)}`
    );
  }
  return (await response.json()) as T;
}

async function listProperties(objectType: "companies" | "deals"): Promise<HubspotProperty[]> {
  const data = await get<HubspotPropertiesResponse>(`/crm/v3/properties/${objectType}`);
  return data.results;
}

async function listObjects(
  objectType: "companies" | "deals",
  propertyNames: string[]
): Promise<HubspotObjectsResponse["results"]> {
  // HubSpot's `properties=` query is comma-separated. Cap the length
  // around 4KB to avoid URL-too-long; the BSG schema is ~250 props
  // per object which fits comfortably under that.
  const propsQuery = propertyNames.join(",");
  const data = await get<HubspotObjectsResponse>(
    `/crm/v3/objects/${objectType}?limit=${SAMPLE_SIZE}&properties=${encodeURIComponent(propsQuery)}`
  );
  return data.results;
}

interface PropertyStats {
  prop: HubspotProperty;
  nonNullCount: number;
  exampleValue: string | null;
}

function summarise(
  objectType: string,
  props: HubspotProperty[],
  sample: HubspotObjectsResponse["results"]
): PropertyStats[] {
  const stats: PropertyStats[] = props.map(prop => ({
    prop,
    nonNullCount: 0,
    exampleValue: null
  }));

  for (const obj of sample) {
    for (const stat of stats) {
      const value = obj.properties[stat.prop.name];
      if (value !== null && value !== undefined && value !== "") {
        stat.nonNullCount += 1;
        if (stat.exampleValue === null) {
          stat.exampleValue = String(value).slice(0, 80);
        }
      }
    }
  }

  // Sort: non-null-count DESC (most populated first), then name ASC.
  stats.sort((a, b) => {
    if (b.nonNullCount !== a.nonNullCount) return b.nonNullCount - a.nonNullCount;
    return a.prop.name.localeCompare(b.prop.name);
  });

  console.log(`\n═══════════════════════════════════════════════════════════════════`);
  console.log(`  ${objectType.toUpperCase()} — ${props.length} properties, ${sample.length} sample objects`);
  console.log(`═══════════════════════════════════════════════════════════════════\n`);

  console.log("─── POPULATED (≥1 sample has a value) ─────────────────────────────\n");
  let separatorShown = false;
  for (const stat of stats) {
    if (stat.nonNullCount === 0) {
      if (!separatorShown) {
        console.log("\n─── ALWAYS NULL in this sample ───────────────────────────────────\n");
        separatorShown = true;
      }
      console.log(`  ${stat.prop.name.padEnd(45)} ${stat.prop.type.padEnd(12)} ${stat.prop.label}`);
      continue;
    }
    const fillRate = `${stat.nonNullCount}/${sample.length}`;
    const example = stat.exampleValue ? `→ "${stat.exampleValue}"` : "";
    console.log(
      `  ${stat.prop.name.padEnd(45)} ${stat.prop.type.padEnd(12)} ${fillRate.padEnd(6)} ${example}`
    );
  }

  return stats;
}

async function main(): Promise<void> {
  console.log("[hubspot-inspect] Fetching property catalogue + sample objects...");
  console.log(`  Base URL: ${BASE}`);
  console.log(`  Sample size: ${SAMPLE_SIZE}\n`);

  for (const objectType of ["companies", "deals"] as const) {
    const props = await listProperties(objectType);
    const sample = await listObjects(
      objectType,
      props.map(p => p.name)
    );
    summarise(objectType, props, sample);
  }

  console.log("\n[hubspot-inspect] Done.\n");
  console.log("Next: read the output above and tell me which fields to");
  console.log("extract into named columns. Everything else goes into");
  console.log("`hubspot_raw` JSONB so no data is lost.\n");
}

main().catch(err => {
  console.error("[hubspot-inspect] Failed:", err);
  process.exit(1);
});

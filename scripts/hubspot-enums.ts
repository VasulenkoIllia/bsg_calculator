#!/usr/bin/env tsx
/**
 * Fetch enum/option lists for the HubSpot properties that drive
 * UI filters in our app. Used to confirm filter-value contracts
 * with the user before locking the DB schema.
 *
 *   npm run hubspot:enums
 *
 * Reads HUBSPOT_API_TOKEN from .env. Read-only.
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
  console.error("[hubspot-enums] HUBSPOT_API_TOKEN is empty in .env");
  process.exit(1);
}

interface HubspotPropertyOption {
  label: string;
  value: string;
  description?: string;
  displayOrder?: number;
  hidden?: boolean;
}

interface HubspotPropertyDetail {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  description?: string;
  options: HubspotPropertyOption[];
}

interface HubspotPipelineStage {
  id: string;
  label: string;
  displayOrder: number;
  archived: boolean;
  metadata: Record<string, string>;
}

interface HubspotPipeline {
  id: string;
  label: string;
  archived: boolean;
  displayOrder: number;
  stages: HubspotPipelineStage[];
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`HTTP ${r.status} ${path}: ${body.slice(0, 300)}`);
  }
  return (await r.json()) as T;
}

async function fetchProperty(
  objectType: "companies" | "deals",
  propertyName: string
): Promise<HubspotPropertyDetail> {
  return get<HubspotPropertyDetail>(`/crm/v3/properties/${objectType}/${propertyName}`);
}

async function fetchPipelines(
  objectType: "companies" | "deals"
): Promise<{ results: HubspotPipeline[] }> {
  return get(`/crm/v3/pipelines/${objectType}`);
}

function printProperty(label: string, prop: HubspotPropertyDetail): void {
  console.log(`\n═══════════════════════════════════════════════════════════════════`);
  console.log(`  ${label}   (HubSpot: ${prop.name})`);
  console.log(`  type=${prop.type}  fieldType=${prop.fieldType}`);
  if (prop.description) console.log(`  ${prop.description}`);
  console.log(`═══════════════════════════════════════════════════════════════════`);
  if (prop.options.length === 0) {
    console.log("  (no options — free-text or built-in)");
    return;
  }
  const sorted = [...prop.options].sort(
    (a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999)
  );
  for (const opt of sorted) {
    const hidden = opt.hidden ? " [HIDDEN]" : "";
    const desc = opt.description ? `  ─  ${opt.description}` : "";
    console.log(`  • ${opt.label.padEnd(40)}  value="${opt.value}"${hidden}${desc}`);
  }
}

function printPipelines(label: string, data: { results: HubspotPipeline[] }): void {
  console.log(`\n═══════════════════════════════════════════════════════════════════`);
  console.log(`  ${label}   (${data.results.length} pipelines)`);
  console.log(`═══════════════════════════════════════════════════════════════════`);
  for (const pipeline of data.results) {
    if (pipeline.archived) continue;
    console.log(`\n  Pipeline: ${pipeline.label}   (id="${pipeline.id}")`);
    const stages = [...pipeline.stages]
      .filter(s => !s.archived)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    for (const stage of stages) {
      const probability = stage.metadata?.probability;
      const tag = stage.metadata?.dealClosedWon === "true"
        ? " [closed-won]"
        : stage.metadata?.dealClosedLost === "true"
        ? " [closed-lost]"
        : "";
      const prob = probability ? `  probability=${probability}` : "";
      console.log(`    → ${stage.label.padEnd(35)}  id="${stage.id}"${prob}${tag}`);
    }
  }
}

async function main(): Promise<void> {
  console.log("[hubspot-enums] fetching enum properties + pipelines…\n");

  // ─── Company filter-relevant enums ───────────────────────────────
  const companyFields = ["company_type", "segment_type", "lifecyclestage", "industry"] as const;
  for (const name of companyFields) {
    try {
      const prop = await fetchProperty("companies", name);
      printProperty(`COMPANY · ${prop.label}`, prop);
    } catch (err) {
      console.error(`[hubspot-enums] couldn't fetch companies/${name}:`, (err as Error).message);
    }
  }

  // ─── Deal filter-relevant enums ──────────────────────────────────
  const dealFields = ["business_vertical", "clientele_type", "is_licensed", "is_startup"] as const;
  for (const name of dealFields) {
    try {
      const prop = await fetchProperty("deals", name);
      printProperty(`DEAL · ${prop.label}`, prop);
    } catch (err) {
      console.error(`[hubspot-enums] couldn't fetch deals/${name}:`, (err as Error).message);
    }
  }

  // ─── Pipelines (deal stages) ─────────────────────────────────────
  try {
    const pipelines = await fetchPipelines("deals");
    printPipelines("DEAL PIPELINES + STAGES", pipelines);
  } catch (err) {
    console.error("[hubspot-enums] couldn't fetch deal pipelines:", (err as Error).message);
  }

  console.log("\n[hubspot-enums] done.\n");
}

main().catch(err => {
  console.error("[hubspot-enums] failed:", err);
  process.exit(1);
});

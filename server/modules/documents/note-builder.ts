/**
 * Phase 9 — HubSpot Note body builder.
 *
 * Produces plain-text Note content for the document → HubSpot Note
 * write-back path. Plain text (not HTML) so it renders identically
 * across the HubSpot web UI, the iOS app, the email digests, and
 * the API consumer view.
 *
 * Format (operator-confirmed in Phase 9 design questions):
 *   - Header with BSG number + scope + timestamp
 *   - Clickable URL back to our SPA's /documents/:number
 *   - Key contract terms picked from the persisted payload (best
 *     effort — payload is jsonb so we can't strictly type it; the
 *     builder is defensive about missing fields)
 *   - Optional addendum text if the document carries one
 *
 * The output stays well under HubSpot's 65 KB Note body cap — even
 * for the heaviest realistic document we land under ~3 KB.
 */

import type { Document } from "../../db/schema";
import { env } from "../../config/env";

/** Match the documents.scope enum from the schema. */
type DocumentScope = "offer" | "agreement" | "offer_and_agreement";

const SCOPE_LABEL: Record<DocumentScope, string> = {
  offer: "Offer",
  agreement: "Agreement",
  offer_and_agreement: "Offer + Agreement"
};

/**
 * Best-effort field extractor from the document payload. The payload
 * is `jsonb` (typed `unknown` at the row level) — we narrow at the
 * field boundary so a missing / malformed shape just yields an empty
 * line rather than a hard 500.
 */
function pickString(obj: unknown, ...path: string[]): string | undefined {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" && cur.length > 0 ? cur : undefined;
}

function pickNumber(obj: unknown, ...path: string[]): number | undefined {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "number" && Number.isFinite(cur) ? cur : undefined;
}

function formatPercent(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  return `${value.toFixed(2)}%`;
}

/**
 * Build the Note body for a freshly-saved document.
 *
 * Inputs:
 *   - `document`: the persisted row (already validated by Drizzle).
 *   - `companyName`: parent company display name, joined in by the
 *     sync service before calling this builder. Optional because the
 *     repo may surface a NULL row in pathological cases.
 *
 * Returns a `\n`-joined plain-text body ready to ship as
 * `properties.hs_note_body` on the HubSpot Note POST.
 */
export function buildHubspotNoteBody(input: {
  document: Document;
  companyName?: string;
}): string {
  const { document, companyName } = input;
  const scope = document.scope as DocumentScope;
  const scopeLabel = SCOPE_LABEL[scope] ?? scope;
  const docUrl = `${env.APP_PUBLIC_URL.replace(/\/$/, "")}/documents/${encodeURIComponent(document.number)}`;
  const generatedAt = document.createdAt.toISOString().replace("T", " ").slice(0, 16);
  // Note: `payload` is `jsonb` → `unknown`. All extractions below
  // are defensive — missing fields just don't render their line.
  const payload = document.payload;

  const lines: string[] = [];

  // ─── Header ──────────────────────────────────────────────────────
  lines.push(`📄 ${document.number} — ${scopeLabel}`);
  lines.push("");
  if (companyName) lines.push(`Company: ${companyName}`);
  if (document.hubspotDealId) lines.push(`Deal: ${document.hubspotDealId}`);
  lines.push(`Generated: ${generatedAt} UTC`);
  lines.push("");

  // ─── Pricing snapshot (best-effort from payload) ─────────────────
  const calcType = pickString(payload, "calculatorType", "kind");
  if (calcType) {
    lines.push(`Calculator type: ${calcType}`);
  }
  const payinEnabled = (payload as { calculatorType?: { payin?: boolean } })?.calculatorType?.payin;
  const payoutEnabled = (payload as { calculatorType?: { payout?: boolean } })?.calculatorType?.payout;
  if (payinEnabled !== undefined || payoutEnabled !== undefined) {
    const modes = [
      payinEnabled ? "Payin" : null,
      payoutEnabled ? "Payout" : null
    ].filter((x): x is string => x !== null);
    if (modes.length > 0) lines.push(`Modes: ${modes.join(", ")}`);
  }

  // Split percentages — under `payload.payin`
  const eu = formatPercent(pickNumber(payload, "payin", "euPercent"));
  const ww = formatPercent(pickNumber(payload, "payin", "wwPercent"));
  const cc = formatPercent(pickNumber(payload, "payin", "ccPercent"));
  const apm = formatPercent(pickNumber(payload, "payin", "apmPercent"));
  if (eu || ww || cc || apm) {
    lines.push("");
    lines.push("── Payin split ──");
    if (eu) lines.push(`  EU: ${eu}`);
    if (ww) lines.push(`  Worldwide: ${ww}`);
    if (cc) lines.push(`  CC: ${cc}`);
    if (apm) lines.push(`  APM: ${apm}`);
  }

  // Contract summary — under `payload.contractSummary`
  const settlementPeriod = pickString(payload, "contractSummary", "settlementPeriod");
  const rrPercent = formatPercent(pickNumber(payload, "contractSummary", "rollingReservePercent"));
  const rrHoldDays = pickNumber(payload, "contractSummary", "rollingReserveHoldDays");
  if (settlementPeriod || rrPercent || rrHoldDays !== undefined) {
    lines.push("");
    lines.push("── Contract terms ──");
    if (settlementPeriod) lines.push(`  Settlement: ${settlementPeriod}`);
    if (rrPercent) {
      lines.push(
        `  Rolling reserve: ${rrPercent}${rrHoldDays !== undefined ? ` (hold ${rrHoldDays} days)` : ""}`
      );
    }
  }

  // ─── Addendum (if present) ───────────────────────────────────────
  const addendum = document.addendum?.trim();
  if (addendum) {
    lines.push("");
    lines.push("── Addendum ──");
    lines.push(addendum);
  }

  // ─── Footer ──────────────────────────────────────────────────────
  lines.push("");
  lines.push(`View full document: ${docUrl}`);

  return lines.join("\n");
}

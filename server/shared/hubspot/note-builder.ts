/**
 * Phase 9 — HubSpot Note body builder.
 *
 * Phase 9.H redesign (2026-05-21) replaced the long pseudo-summary
 * format with a compact one-liner per the operator brief:
 *
 *   Offer BSG-7100001-099930 // Company: (A) TEST 1 // Created 21.05.2026, 15:40 by Admin (admin@bsg.test)
 *   Link (as href)
 *
 * Same builder shape is reused for both documents AND calc-configs
 * (Phase 9.I) via the `EntityKind` discriminator — they share the
 * "type prefix + identifier + company + created + clickable link"
 * skeleton.
 *
 * HTML body (rather than plain text) so the "Link" label renders as
 * a clickable hyperlink in HubSpot UI. HubSpot's hs_note_body
 * accepts arbitrary HTML and sanitises on read.
 *
 * The body is small (< 1 KB even with long company names) so we
 * don't worry about HubSpot's 65 KB cap.
 *
 * Sprint 9.L D3 — moved here from `modules/documents/note-builder.ts`.
 * The original location implied "this is a documents-only helper",
 * but Phase 9.I started reusing it for calc-configs too. Living
 * under `shared/hubspot/` makes the cross-module ownership explicit
 * and keeps the import path symmetric between callers (no
 * `../documents/...` traversals from a calc-configs sync file).
 */

import { env } from "../../config/env";
import { escapeHtml, escapeUrlAttr } from "../html";

/**
 * What the Note describes. Drives the type label that prefixes
 * the identifier on line 1.
 */
type EntityKind =
  | "document_offer"
  | "document_agreement"
  | "document_offer_and_agreement"
  | "calculator";

const KIND_LABEL: Record<EntityKind, string> = {
  document_offer: "Offer",
  document_agreement: "Agreement",
  document_offer_and_agreement: "Offer + Agreement",
  calculator: "Calculator"
};

/**
 * Operator identity rendered as `display_name (email)` so the
 * HubSpot reader can see WHO from our system produced the
 * document/calc.
 */
export interface NoteActor {
  displayName: string;
  email: string;
}

export interface NoteBuilderInput {
  kind: EntityKind;
  /**
   * Identifier shown after the type label. For documents: the BSG
   * number. For calculators: the title (or "(untitled)" fallback).
   */
  identifier: string;
  companyName: string;
  /**
   * Source of the timestamp + actor. Pass `created_at` for the
   * document/calc creation; the renderer formats it as
   * `21.05.2026, 15:40`.
   */
  createdAt: Date;
  actor: NoteActor;
  /**
   * Absolute path under the SPA. The builder prefixes with
   * `APP_PUBLIC_URL`. Examples:
   *   `/documents/BSG-7100001-099930`
   *   `/calc/<uuid>`
   */
  detailPath: string;
}

/**
 * Format `Date` as `dd.MM.yyyy, HH:mm` (Ukrainian operator habit).
 * Manual to avoid the JS engine's locale subtleties on the server
 * (Node may not have the right ICU bundle in slim containers).
 */
function formatDateTime(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}, ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}

/**
 * Build the HTML Note body for HubSpot.
 *
 * Output shape (verbatim):
 *   <p>{label} {identifier} // Company: {co} // Created {date} by {actor.displayName} ({actor.email})</p>
 *   <p><a href="{absUrl}" target="_blank" rel="noopener">Link</a></p>
 *
 * HubSpot's rich-text renderer collapses adjacent `<p>` into a
 * compact two-line block in the activity feed.
 */
export function buildHubspotNoteBody(input: NoteBuilderInput): string {
  const label = KIND_LABEL[input.kind];
  const id = escapeHtml(input.identifier);
  const co = escapeHtml(input.companyName);
  const actor = `${escapeHtml(input.actor.displayName)} (${escapeHtml(input.actor.email)})`;
  const dateStr = formatDateTime(input.createdAt);
  const absUrl =
    env.APP_PUBLIC_URL.replace(/\/$/, "") +
    input.detailPath;

  const header = `${label} ${id} // Company: ${co} // Created ${dateStr} by ${actor}`;
  return [
    `<p>${header}</p>`,
    `<p><a href="${escapeUrlAttr(absUrl)}" target="_blank" rel="noopener">Link</a></p>`
  ].join("\n");
}

/**
 * Convenience: build a `NoteBuilderInput.kind` from a document's
 * scope enum. Kept here so callers don't duplicate the mapping.
 */
export function noteKindFromDocumentScope(
  scope: "offer" | "agreement" | "offer_and_agreement"
): EntityKind {
  switch (scope) {
    case "offer":
      return "document_offer";
    case "agreement":
      return "document_agreement";
    case "offer_and_agreement":
      return "document_offer_and_agreement";
    default: {
      const _exhaustive: never = scope;
      throw new Error(`noteKindFromDocumentScope: unhandled scope ${String(_exhaustive)}`);
    }
  }
}

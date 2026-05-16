/**
 * Cursor-based pagination helpers.
 *
 * Per backend_conventions.md §11: opaque base64url-encoded JSON
 * `{ createdAt, id }`. Stable across re-orderings because we sort
 * by (createdAt, id) — the secondary id tiebreaks duplicates.
 *
 * Server-side ALWAYS re-derives "next cursor" from the LAST row of
 * the returned page; clients pass it back verbatim. Never construct
 * a cursor on the client.
 */

import { ValidationError } from "./errors";

export interface Cursor {
  createdAt: string; // ISO timestamp
  id: string; // uuid
}

export function encodeCursor(cursor: Cursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as Cursor).createdAt !== "string" ||
      typeof (parsed as Cursor).id !== "string"
    ) {
      throw new Error("malformed cursor payload");
    }
    return parsed as Cursor;
  } catch (err) {
    throw new ValidationError(
      [{ path: ["cursor"], message: "Cursor is malformed or tampered with." }],
      `Invalid cursor: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// clampLimit was removed 2026-05-16: Zod schemas already enforce
// `.max(50)` on every list endpoint, so a runtime clamp is redundant.
// If a non-Zod-validated input path ever appears, re-add this helper
// here and import it explicitly.

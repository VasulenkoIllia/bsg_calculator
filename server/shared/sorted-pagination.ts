/**
 * Sprint 6.8 sortable-cursor pagination helpers.
 *
 * Existing `shared/pagination.ts` cursor (`{ createdAt, id }`) was
 * designed for a SINGLE fixed sort: (createdAt DESC, id DESC). The
 * /documents and /calculators listings now offer per-column sort
 * (number / companyName / scope / hubspotSyncState / createdAt for
 * docs; title / companyName / hubspotDealId / updatedAt / createdAt
 * for configs) so the cursor needs to carry:
 *   1. The sort spec at the time the cursor was minted — so a
 *      mid-pagination `?sort=` switch surfaces as a 400 rather than
 *      silently returning weird rows.
 *   2. The chosen column's value (string-encoded) plus the row id as
 *      tiebreaker — `(value, id)` comparison must mirror the
 *      `ORDER BY (chosen_column, id)` exactly.
 *
 * Backwards-compat: we DO NOT touch shared/pagination.ts. Companies /
 * deals continue to use the old `{ createdAt, id }` cursor. Only
 * /documents and /calculator-configs adopt this new shape.
 */

import { ValidationError } from "./errors";

export type SortDirection = "asc" | "desc";

export interface SortSpec<TField extends string> {
  field: TField;
  dir: SortDirection;
}

/**
 * Cursor that survives a `?sort=field:dir` switch by refusing to
 * decode when the sort differs from the one the page chain was
 * started with. Clients that change sort mid-pagination MUST drop
 * the cursor — the frontend `SortableTh` does this automatically.
 */
export interface SortedCursor {
  /** Sort spec at mint time, encoded as "field:dir" (e.g. "companyName:asc"). */
  sort: string;
  /** String-encoded sort column value (ISO for dates, lowercase trimmed for strings). */
  value: string;
  /** UUID tie-breaker. */
  id: string;
}

export function encodeSortKey<TField extends string>(spec: SortSpec<TField>): string {
  return `${spec.field}:${spec.dir}`;
}

export function encodeSortedCursor(c: SortedCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

/**
 * Lazy UUID regex — same shape as Zod's `.uuid()` but inlined so the
 * shared-pagination helpers don't pull in Zod. Used to validate
 * cursor.id before it reaches the repository (a non-UUID would
 * produce a Postgres `22P02` and surface as a 500 — Sprint 6.9 N1).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Decode + validate that the cursor's sort spec matches the current
 * `?sort=` query param. Mismatch is treated as a malformed cursor
 * (the operator changed sort mid-pagination — frontend should reset).
 *
 * Sprint 6.9 C1 + N1: also validates `id` is a UUID. Date-typed sort
 * fields validate `value` is parseable as a Date in the repository
 * layer (see `validateCursorValueAsDate`) — the helper can't do that
 * here because the field→type mapping is per-endpoint.
 */
export function decodeSortedCursor(
  raw: string | undefined,
  expectedSort: string
): SortedCursor | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    parsed = JSON.parse(json);
  } catch (err) {
    throw new ValidationError(
      [{ path: ["cursor"], message: "Cursor is malformed or tampered with." }],
      `Invalid cursor: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as SortedCursor).sort !== "string" ||
    typeof (parsed as SortedCursor).value !== "string" ||
    typeof (parsed as SortedCursor).id !== "string"
  ) {
    throw new ValidationError(
      [{ path: ["cursor"], message: "Cursor payload is malformed." }],
      "Invalid cursor payload"
    );
  }
  const c = parsed as SortedCursor;
  if (!UUID_RE.test(c.id)) {
    throw new ValidationError(
      [{ path: ["cursor"], message: "Cursor id is malformed." }],
      "Invalid cursor id"
    );
  }
  if (c.sort !== expectedSort) {
    throw new ValidationError(
      [
        {
          path: ["cursor"],
          message:
            "Cursor sort spec does not match current ?sort= — reset pagination."
        }
      ],
      "Cursor/sort mismatch"
    );
  }
  return c;
}

/**
 * Sprint 6.9 C1: validate that a cursor's `value` parses as a date
 * BEFORE we hand it to `new Date(...)` and Drizzle. Without this,
 * a tampered cursor like `{ value: "not-a-date" }` either produces
 * Postgres `22P02 invalid_input_syntax for type timestamptz` (raw
 * 500) or silently coerces to NULL (empty result with no error).
 * Both are bad — we want a clean 400.
 *
 * Used by repositories whose sort spec includes a timestamp field.
 */
export function assertCursorValueIsIsoDate(value: string): void {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new ValidationError(
      [{ path: ["cursor"], message: "Cursor value is not a valid ISO timestamp." }],
      "Invalid cursor value for date sort"
    );
  }
}

/**
 * Page envelope shape — mirrors `shared/build-page.ts:PageResult` so
 * the two cursor flavours look identical on the wire (clients only
 * see `{ items, nextCursor, limit }` regardless of which builder
 * minted the cursor).
 */
export interface PageResult<TPublic> {
  items: TPublic[];
  nextCursor: string | null;
  limit: number;
}

/**
 * Sorted-cursor analogue of `shared/build-page.ts:buildPage`. Caller
 * fetches `limit+1` rows; we slice + derive `nextCursor` from the
 * LAST kept row via `toCursor`. The cursor stores the sort spec so a
 * mid-pagination ?sort= change surfaces as a 400.
 */
export function buildSortedPage<TRow, TPublic, TField extends string>(
  rows: TRow[],
  limit: number,
  sort: SortSpec<TField>,
  toPublic: (row: TRow) => TPublic,
  toCursorValue: (row: TRow) => { value: string; id: string }
): PageResult<TPublic> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  let nextCursor: string | null = null;
  if (hasMore) {
    const last = items[items.length - 1];
    const { value, id } = toCursorValue(last);
    nextCursor = encodeSortedCursor({
      sort: encodeSortKey(sort),
      value,
      id
    });
  }
  return {
    items: items.map(toPublic),
    nextCursor,
    limit
  };
}

/**
 * Parse a `?sort=field:dir` query string into a typed `SortSpec`,
 * with whitelist + per-endpoint default fallback.
 */
export function parseSortQuery<TField extends string>(
  raw: string | undefined,
  allowed: readonly TField[],
  defaults: SortSpec<TField>
): SortSpec<TField> {
  if (!raw) return defaults;
  // Sprint 6.9 N8: only allow ONE colon. Don't split into more parts
  // and discard silently — explicitly reject extra colons.
  const colonCount = (raw.match(/:/g) ?? []).length;
  if (colonCount !== 1) {
    throw new ValidationError(
      [
        {
          path: ["sort"],
          message:
            "sort must contain exactly one ':' separator and be in 'field:asc' or 'field:desc' form"
        }
      ],
      "Invalid sort"
    );
  }
  const parts = raw.split(":");
  // Defensive: colonCount===1 already guarantees length===2, but
  // keep the check so the tuple destructure below is sound.
  if (parts.length !== 2) {
    throw new ValidationError(
      [{ path: ["sort"], message: "sort must be in 'field:asc' or 'field:desc' form" }],
      "Invalid sort"
    );
  }
  const [fieldPart, dirPart] = parts;
  if (!allowed.includes(fieldPart as TField)) {
    // Sprint 6.9 S10: DO NOT reflect `fieldPart` (user input) back in
    // the error payload — that's a minor content-injection vector
    // and makes fuzzing the whitelist trivial. Only the static list
    // of allowed fields is returned.
    throw new ValidationError(
      [
        {
          path: ["sort"],
          message: `Unknown sort field; allowed: ${allowed.join(", ")}`
        }
      ],
      "Invalid sort field"
    );
  }
  if (dirPart !== "asc" && dirPart !== "desc") {
    throw new ValidationError(
      [{ path: ["sort"], message: "direction must be 'asc' or 'desc'" }],
      "Invalid sort direction"
    );
  }
  return { field: fieldPart as TField, dir: dirPart };
}

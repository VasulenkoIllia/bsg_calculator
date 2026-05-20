/**
 * Unit tests for the Sprint 6.8 sorted-cursor helpers.
 *
 * Critical invariants:
 *   - encode/decode round-trips the cursor verbatim.
 *   - decode rejects a tampered / malformed base64 payload.
 *   - decode rejects a sort/cursor mismatch (the operator changed
 *     ?sort= mid-pagination — backend must surface as a 400 so the
 *     frontend resets pagination instead of returning weird rows).
 *   - parseSortQuery rejects unknown fields + bad direction strings,
 *     and falls back to the default when ?sort= is absent.
 *   - buildSortedPage trims to `limit` and emits a cursor only when
 *     `rows.length > limit` (otherwise nextCursor is null).
 */

import { describe, expect, it } from "vitest";
import {
  assertCursorValueIsIsoDate,
  buildSortedPage,
  decodeSortedCursor,
  encodeSortKey,
  encodeSortedCursor,
  parseSortQuery
} from "./sorted-pagination";
import { ValidationError } from "./errors";

describe("encodeSortKey", () => {
  it("formats as 'field:dir'", () => {
    expect(encodeSortKey({ field: "createdAt", dir: "desc" })).toBe("createdAt:desc");
    expect(encodeSortKey({ field: "title", dir: "asc" })).toBe("title:asc");
  });
});

describe("encode / decode SortedCursor — round-trip", () => {
  it("decodes back the same payload it encoded", () => {
    const cursor = {
      sort: "companyName:asc",
      value: "acme inc",
      // Sprint 6.9 N1: id must now pass UUID validation; use a real one.
      id: "11111111-1111-4111-8111-111111111111"
    };
    const raw = encodeSortedCursor(cursor);
    const decoded = decodeSortedCursor(raw, "companyName:asc");
    expect(decoded).toEqual(cursor);
  });

  it("decode of undefined yields null (= page 1 of the chain)", () => {
    expect(decodeSortedCursor(undefined, "createdAt:desc")).toBeNull();
  });

  it("decode of a tampered base64 payload throws ValidationError", () => {
    expect(() => decodeSortedCursor("not-base64-!@#$%", "createdAt:desc")).toThrow(
      ValidationError
    );
  });

  it("decode of a valid-base64 non-JSON payload throws ValidationError", () => {
    const garbage = Buffer.from("hello world", "utf8").toString("base64url");
    expect(() => decodeSortedCursor(garbage, "createdAt:desc")).toThrow(ValidationError);
  });

  it("decode REJECTS a sort/cursor mismatch (operator changed sort mid-pagination)", () => {
    const cursor = {
      sort: "createdAt:desc",
      value: "2026-05-19T00:00:00Z",
      id: "22222222-2222-4222-8222-222222222222"
    };
    const raw = encodeSortedCursor(cursor);
    expect(() => decodeSortedCursor(raw, "companyName:asc")).toThrow(ValidationError);
  });

  it("decode rejects a cursor missing required fields", () => {
    const missing = Buffer.from(
      JSON.stringify({ sort: "createdAt:desc" /* no value, no id */ }),
      "utf8"
    ).toString("base64url");
    expect(() => decodeSortedCursor(missing, "createdAt:desc")).toThrow(ValidationError);
  });
});

describe("parseSortQuery", () => {
  const allowed = ["createdAt", "title", "companyName"] as const;
  const defaults = { field: "createdAt" as const, dir: "desc" as const };

  it("returns defaults when ?sort= is absent", () => {
    expect(parseSortQuery(undefined, allowed, defaults)).toEqual(defaults);
  });

  it("parses 'field:asc' / 'field:desc' correctly", () => {
    expect(parseSortQuery("title:asc", allowed, defaults)).toEqual({
      field: "title",
      dir: "asc"
    });
    expect(parseSortQuery("companyName:desc", allowed, defaults)).toEqual({
      field: "companyName",
      dir: "desc"
    });
  });

  it("rejects unknown fields", () => {
    expect(() => parseSortQuery("bogus:asc", allowed, defaults)).toThrow(ValidationError);
  });

  it("rejects unknown direction", () => {
    expect(() => parseSortQuery("title:upwards", allowed, defaults)).toThrow(
      ValidationError
    );
  });

  it("rejects malformed sort strings (no colon, multiple colons, empty halves)", () => {
    expect(() => parseSortQuery("title", allowed, defaults)).toThrow(ValidationError);
    expect(() => parseSortQuery("title:asc:extra", allowed, defaults)).toThrow(
      ValidationError
    );
    expect(() => parseSortQuery(":asc", allowed, defaults)).toThrow(ValidationError);
    expect(() => parseSortQuery("title:", allowed, defaults)).toThrow(ValidationError);
  });

  it("Sprint 6.9 S10: error message does NOT reflect user input verbatim", () => {
    try {
      parseSortQuery("totallyEvilFieldName:asc", allowed, defaults);
      throw new Error("expected throw");
    } catch (e) {
      const err = e as ValidationError;
      // The message must NOT contain the attacker-supplied string.
      // (It mentions the static allowed list, which is fine.)
      const msg = JSON.stringify(err);
      expect(msg).not.toContain("totallyEvilFieldName");
    }
  });
});

describe("Sprint 6.9 N1: decodeSortedCursor validates cursor.id as UUID", () => {
  it("rejects a cursor with a non-UUID id", () => {
    const bad = encodeSortedCursor({
      sort: "createdAt:desc",
      value: "2026-01-01T00:00:00Z",
      id: "not-a-uuid"
    });
    expect(() => decodeSortedCursor(bad, "createdAt:desc")).toThrow(ValidationError);
  });
});

describe("Sprint 6.9 C1: assertCursorValueIsIsoDate", () => {
  it("accepts a valid ISO timestamp", () => {
    expect(() => assertCursorValueIsIsoDate("2026-05-19T00:00:00.000Z")).not.toThrow();
  });
  it("accepts a partial ISO that Date.parse handles", () => {
    expect(() => assertCursorValueIsIsoDate("2026-05-19")).not.toThrow();
  });
  it("REJECTS a non-date string", () => {
    expect(() => assertCursorValueIsIsoDate("not-a-date")).toThrow(ValidationError);
  });
  it("REJECTS an empty string", () => {
    expect(() => assertCursorValueIsIsoDate("")).toThrow(ValidationError);
  });
});

describe("buildSortedPage", () => {
  const sort = { field: "title" as const, dir: "asc" as const };

  it("returns all rows + null nextCursor when rows.length ≤ limit", () => {
    const rows = [{ id: "1", title: "a" }, { id: "2", title: "b" }];
    const page = buildSortedPage(
      rows,
      5,
      sort,
      r => r,
      r => ({ value: r.title, id: `${"0".repeat(8)}-0000-4000-8000-${r.id.padStart(12, "0")}` })
    );
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
    expect(page.limit).toBe(5);
  });

  it("trims to `limit` and emits a cursor when rows.length > limit", () => {
    // Caller passes limit+1 rows so the helper can tell whether more
    // exist beyond the page.
    const rows = [
      { id: "1", title: "a" },
      { id: "2", title: "b" },
      { id: "3", title: "c" } // overflow row → triggers cursor emit
    ];
    const page = buildSortedPage(
      rows,
      2,
      sort,
      r => r,
      r => ({ value: r.title, id: `${"0".repeat(8)}-0000-4000-8000-${r.id.padStart(12, "0")}` })
    );
    expect(page.items).toHaveLength(2);
    expect(page.items.map(r => r.id)).toEqual(["1", "2"]);
    expect(page.nextCursor).not.toBeNull();

    // The cursor encodes the sort spec + the LAST row of the kept page
    // (row id 2, title "b") — not the overflow row.
    const decoded = decodeSortedCursor(page.nextCursor!, "title:asc");
    expect(decoded?.sort).toBe("title:asc");
    expect(decoded?.value).toBe("b");
    // id padded to UUID-shaped via the toCursor helper above.
    expect(decoded?.id).toBe("00000000-0000-4000-8000-000000000002");
  });
});

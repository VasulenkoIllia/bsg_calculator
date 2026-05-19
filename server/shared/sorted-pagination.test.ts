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
    const cursor = { sort: "companyName:asc", value: "acme inc", id: "abc-123" };
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
    const cursor = { sort: "createdAt:desc", value: "2026-05-19T00:00:00Z", id: "id-1" };
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
      r => ({ value: r.title, id: r.id })
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
      r => ({ value: r.title, id: r.id })
    );
    expect(page.items).toHaveLength(2);
    expect(page.items.map(r => r.id)).toEqual(["1", "2"]);
    expect(page.nextCursor).not.toBeNull();

    // The cursor encodes the sort spec + the LAST row of the kept page
    // (row id 2, title "b") — not the overflow row.
    const decoded = decodeSortedCursor(page.nextCursor!, "title:asc");
    expect(decoded).toEqual({ sort: "title:asc", value: "b", id: "2" });
  });
});

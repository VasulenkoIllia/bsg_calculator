import { describe, expect, it } from "vitest";
import { buildPage } from "./build-page";
import { decodeCursor } from "./pagination";

interface Row {
  id: string;
  createdAt: Date;
  name: string;
}

const toCursor = (r: Row) => ({ createdAt: r.createdAt.toISOString(), id: r.id });
const toPublic = (r: Row) => ({ id: r.id, name: r.name });

describe("buildPage", () => {
  it("returns all rows + null cursor when result is within limit", () => {
    const rows: Row[] = [
      { id: "a", createdAt: new Date("2026-01-01"), name: "A" },
      { id: "b", createdAt: new Date("2026-01-02"), name: "B" }
    ];
    const page = buildPage(rows, /* limit */ 5, toPublic, toCursor);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
    expect(page.limit).toBe(5);
  });

  it("trims to limit + emits cursor when there's more", () => {
    // Caller fetched limit+1 = 4 rows for a limit=3 page.
    const rows: Row[] = [
      { id: "a", createdAt: new Date("2026-01-04"), name: "A" },
      { id: "b", createdAt: new Date("2026-01-03"), name: "B" },
      { id: "c", createdAt: new Date("2026-01-02"), name: "C" },
      { id: "d", createdAt: new Date("2026-01-01"), name: "D" }
    ];
    const page = buildPage(rows, 3, toPublic, toCursor);
    expect(page.items).toHaveLength(3);
    expect(page.items.map(i => i.id)).toEqual(["a", "b", "c"]);
    expect(page.nextCursor).not.toBeNull();
    const decoded = decodeCursor(page.nextCursor!);
    expect(decoded?.id).toBe("c"); // cursor points at the LAST kept row
  });

  it("calls toPublic for every kept row, not the trimmed extras", () => {
    let publicCalls = 0;
    const counted: typeof toPublic = r => {
      publicCalls += 1;
      return toPublic(r);
    };
    const rows: Row[] = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i}`,
      createdAt: new Date(2026, 0, 6 - i),
      name: `R${i}`
    }));
    buildPage(rows, 4, counted, toCursor);
    expect(publicCalls).toBe(4);
  });

  it("works for an empty result set", () => {
    const page = buildPage<Row, { id: string }>([], 10, toPublic, toCursor);
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("boundary: rows.length === limit → no cursor (caller fetched exactly limit, not limit+1)", () => {
    // Callers MUST fetch `limit + 1` rows to enable next-page detection.
    // If a caller forgets and fetches exactly `limit`, we should not
    // falsely emit a cursor pointing nowhere. With hasMore = (limit > limit) = false,
    // the function correctly returns nextCursor: null. This pins that contract.
    const rows: Row[] = Array.from({ length: 3 }, (_, i) => ({
      id: `r${i}`,
      createdAt: new Date(2026, 0, 3 - i),
      name: `R${i}`
    }));
    const page = buildPage(rows, 3, toPublic, toCursor);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });
});

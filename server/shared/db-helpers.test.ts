import { describe, expect, it } from "vitest";
import { InternalError } from "./errors";
import { expectSingle } from "./db-helpers";

/**
 * Helper: catch the thrown InternalError and assert on its
 * `internalMessage` field (the public `message` is intentionally
 * generic for InternalError so we don't leak details to clients).
 */
function catchInternalError(fn: () => void): InternalError {
  try {
    fn();
  } catch (err) {
    if (err instanceof InternalError) return err;
    throw new Error(`Expected InternalError, got ${err}`);
  }
  throw new Error("Expected fn to throw");
}

describe("expectSingle", () => {
  it("returns the row when exactly one is present", () => {
    expect(expectSingle([{ id: "a" }], "test")).toEqual({ id: "a" });
  });

  it("throws InternalError when array is empty", () => {
    const err = catchInternalError(() => expectSingle([], "test"));
    expect(err.internalMessage).toMatch(/no row returned/);
  });

  it("throws InternalError when more than one row is returned", () => {
    const err = catchInternalError(() => expectSingle([{ id: "a" }, { id: "b" }], "test"));
    expect(err.internalMessage).toMatch(/2 rows returned/);
  });

  it("includes context label in the internal message", () => {
    const err = catchInternalError(() => expectSingle([], "myFn"));
    expect(err.internalMessage).toMatch(/expectSingle\(myFn\)/);
  });
});

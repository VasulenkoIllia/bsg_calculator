import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseDtoOrInternalError } from "./dto-parse";
import { InternalError } from "./errors";

const schema = z.object({
  id: z.string().uuid(),
  name: z.string()
});

describe("parseDtoOrInternalError", () => {
  it("returns the parsed value on success", () => {
    const result = parseDtoOrInternalError(
      schema,
      { id: "550e8400-e29b-41d4-a716-446655440000", name: "OK" },
      "test"
    );
    expect(result.name).toBe("OK");
  });

  it("throws InternalError (NOT ValidationError) on bad output", () => {
    expect(() =>
      parseDtoOrInternalError(schema, { id: "not-uuid", name: "X" }, "test")
    ).toThrow(InternalError);
  });

  it("includes the context label in the InternalError message", () => {
    try {
      parseDtoOrInternalError(schema, { name: 42 }, "companies.toPublic");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(InternalError);
      expect((err as InternalError).internalMessage).toContain("companies.toPublic");
    }
  });

  it("includes field-level details in the InternalError message", () => {
    try {
      parseDtoOrInternalError(schema, { id: "550e8400-e29b-41d4-a716-446655440000" }, "test");
    } catch (err) {
      expect((err as InternalError).internalMessage).toContain("name");
    }
  });

  it("public-facing error message stays generic (no projection details leak)", () => {
    try {
      parseDtoOrInternalError(schema, {}, "test");
    } catch (err) {
      expect((err as InternalError).message).toBe("Something went wrong on our end.");
    }
  });
});

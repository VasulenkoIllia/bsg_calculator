import { describe, expect, it } from "vitest";
import { ValidationError } from "./errors";
import { parseUuidParam } from "./uuid-param";

function makeReq(params: Record<string, string>) {
  return { params } as unknown as Parameters<typeof parseUuidParam>[0];
}

describe("parseUuidParam", () => {
  it("returns the UUID when valid", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(parseUuidParam(makeReq({ id }), "id")).toBe(id);
  });

  it("throws ValidationError on a non-UUID string", () => {
    expect(() => parseUuidParam(makeReq({ id: "not-a-uuid" }), "id")).toThrow(
      ValidationError
    );
  });

  it("throws ValidationError when the param is missing", () => {
    expect(() => parseUuidParam(makeReq({}), "id")).toThrow(ValidationError);
  });

  it("error message identifies the bad param name", () => {
    try {
      parseUuidParam(makeReq({ companyId: "nope" }), "companyId");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const ve = err as ValidationError;
      expect(ve.message).toContain("companyId");
    }
  });
});

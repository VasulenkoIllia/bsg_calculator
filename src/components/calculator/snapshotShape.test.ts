import { describe, expect, it } from "vitest";
import { DEFAULT_CALCULATOR_STATE } from "./statePresets.js";
import {
  extractCalculatorSnapshot,
  seedCalculatorStateFromSnapshot,
  type CalculatorSnapshotPayload
} from "./snapshotShape.js";

describe("CalculatorSnapshotPayload — backend contract", () => {
  // These tests pin the exact persisted shape that the Phase 8 backend
  // `calculator_snapshots.payload` JSONB column will hold. If you ever
  // need to add or remove a field, both the test fixture and the doc
  // (`docs/backend_state_schemas.md`) must move together.

  it("extracts only the business slice (no UI fields leak in)", () => {
    const payload = extractCalculatorSnapshot(DEFAULT_CALCULATOR_STATE);

    // UI-only fields from the live hook return are explicitly NOT
    // present on the payload. Listing them here documents the boundary.
    const uiFieldsThatMustNotLeak = [
      "showHardcodedConstants",
      "showZone3Formulas",
      "showZone4Formulas",
      "showUnifiedFormulas",
      "unifiedExpandedById",
      "zoneExpanded",
      "offerSummaryActionMessage"
    ];
    for (const key of uiFieldsThatMustNotLeak) {
      expect(payload as unknown as Record<string, unknown>).not.toHaveProperty(key);
    }
  });

  it("payload is round-trip safe — extract → seed → extract is idempotent", () => {
    const first = extractCalculatorSnapshot(DEFAULT_CALCULATOR_STATE);
    const seeded = seedCalculatorStateFromSnapshot(first);
    const second = extractCalculatorSnapshot(seeded);
    expect(second).toEqual(first);
  });

  it("payload is JSON-stringify safe (no functions, no class instances)", () => {
    const payload = extractCalculatorSnapshot(DEFAULT_CALCULATOR_STATE);
    const cloned = JSON.parse(JSON.stringify(payload)) as CalculatorSnapshotPayload;
    expect(cloned).toEqual(payload);
  });

  it("deep-clones nested objects so backend send cannot mutate live state", () => {
    const payload = extractCalculatorSnapshot(DEFAULT_CALCULATOR_STATE);
    // Mutate the payload — live state must stay untouched.
    payload.payinEuPricing.single.mdrPercent = 99;
    expect(DEFAULT_CALCULATOR_STATE.payinEuPricing.single.mdrPercent).not.toBe(99);
  });

  it("schemaVersion is pinned to 1 for the Phase 8 contract", () => {
    const payload = extractCalculatorSnapshot(DEFAULT_CALCULATOR_STATE);
    expect(payload.schemaVersion).toBe(1);
  });
});

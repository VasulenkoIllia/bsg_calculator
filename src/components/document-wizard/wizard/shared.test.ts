import { describe, expect, it } from "vitest";
import {
  clampStepToScope,
  getStepLabel,
  getVisibleSteps,
  isPartiesStep,
  isPreviewStep,
  isPricingStep,
  nextStep,
  previousStep
} from "./shared.js";

describe("getVisibleSteps", () => {
  it("offer scope hides Parties step (1, 2, 3, 4, 5, 6)", () => {
    const visible = getVisibleSteps("offer");
    expect(visible.map(step => step.value)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("offerAndAgreement scope shows all steps with Parties before Preview", () => {
    const visible = getVisibleSteps("offerAndAgreement");
    expect(visible.map(step => step.value)).toEqual([1, 2, 3, 4, 5, 7, 6]);
  });
});

describe("nextStep / previousStep", () => {
  it("walks the offer scope forward sequentially", () => {
    expect(nextStep("offer", 1)).toBe(2);
    expect(nextStep("offer", 5)).toBe(6);
    expect(nextStep("offer", 6)).toBe(6); // last step stays
  });

  it("walks the offerAndAgreement scope through Parties before Preview", () => {
    expect(nextStep("offerAndAgreement", 5)).toBe(7);
    expect(nextStep("offerAndAgreement", 7)).toBe(6);
    expect(nextStep("offerAndAgreement", 6)).toBe(6);
  });

  it("previousStep walks back symmetrically", () => {
    expect(previousStep("offer", 1)).toBe(1);
    expect(previousStep("offerAndAgreement", 6)).toBe(7);
    expect(previousStep("offerAndAgreement", 7)).toBe(5);
  });
});

describe("clampStepToScope", () => {
  it("returns the same step when it is visible in scope", () => {
    expect(clampStepToScope("offer", 1)).toBe(1);
    expect(clampStepToScope("offerAndAgreement", 7)).toBe(7);
    expect(clampStepToScope("offerAndAgreement", 6)).toBe(6);
  });

  it("falls back to step 1 when current step disappears under new scope", () => {
    // user is on Parties (7) and switches to offer scope which has no Parties
    expect(clampStepToScope("offer", 7)).toBe(1);
  });
});

describe("step type predicates", () => {
  it("classifies pricing steps", () => {
    expect(isPricingStep(2)).toBe(true);
    expect(isPricingStep(3)).toBe(true);
    expect(isPricingStep(4)).toBe(true);
    expect(isPricingStep(5)).toBe(true);
    expect(isPricingStep(1)).toBe(false);
    expect(isPricingStep(6)).toBe(false);
    expect(isPricingStep(7)).toBe(false);
  });

  it("classifies Parties step", () => {
    expect(isPartiesStep(7)).toBe(true);
    expect(isPartiesStep(1)).toBe(false);
    expect(isPartiesStep(6)).toBe(false);
  });

  it("classifies Preview step", () => {
    expect(isPreviewStep(6)).toBe(true);
    expect(isPreviewStep(7)).toBe(false);
    expect(isPreviewStep(1)).toBe(false);
  });
});

describe("getStepLabel", () => {
  it("returns short labels for stepper display", () => {
    expect(getStepLabel(1)).toBe("Header");
    expect(getStepLabel(2)).toBe("Payin");
    expect(getStepLabel(7)).toBe("Parties");
    expect(getStepLabel(6)).toBe("Preview");
  });
});

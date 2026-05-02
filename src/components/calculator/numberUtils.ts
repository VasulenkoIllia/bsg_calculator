export function formatInputNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

export function parseInputNumber(raw: string): number {
  const compact = raw.replace(/\s+/g, "");
  if (compact === "") {
    return Number.NaN;
  }

  const commaCount = (compact.match(/,/g) ?? []).length;
  const dotCount = (compact.match(/\./g) ?? []).length;
  let normalized = compact;

  if (commaCount > 0 && dotCount > 0) {
    const lastCommaIndex = compact.lastIndexOf(",");
    const lastDotIndex = compact.lastIndexOf(".");
    const decimalSeparator = lastCommaIndex > lastDotIndex ? "," : ".";

    if (decimalSeparator === ",") {
      normalized = compact.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = compact.replace(/,/g, "");
    }
  } else if (commaCount > 0 && dotCount === 0) {
    if (commaCount === 1) {
      const [intPart = "", fracPart = ""] = compact.split(",");
      const treatAsDecimal =
        fracPart.length <= 2 || intPart === "" || intPart === "-" || intPart === "0" || intPart === "-0";
      normalized = treatAsDecimal ? `${intPart}.${fracPart}` : compact.replace(/,/g, "");
    } else {
      normalized = compact.replace(/,/g, "");
    }
  } else if (dotCount > 0 && commaCount === 0) {
    if (dotCount === 1) {
      const [intPart = "", fracPart = ""] = compact.split(".");
      const treatAsDecimal =
        fracPart.length <= 2 || intPart === "" || intPart === "-" || intPart === "0" || intPart === "-0";
      normalized = treatAsDecimal ? `${intPart}.${fracPart}` : compact.replace(/\./g, "");
    } else {
      const dotParts = compact.split(".");
      const lastPart = dotParts[dotParts.length - 1] ?? "";
      const leadingParts = dotParts.slice(0, -1);
      const firstLeading = leadingParts[0] ?? "";
      const hasValidThousandsGroups =
        leadingParts.length > 0 &&
        firstLeading.length >= 1 &&
        firstLeading.length <= 3 &&
        leadingParts.slice(1).every(part => part.length === 3);
      const treatAsDecimal = lastPart.length <= 2 && hasValidThousandsGroups;
      normalized = treatAsDecimal
        ? `${leadingParts.join("")}.${lastPart}`
        : compact.replace(/\./g, "");
    }
  }

  if (normalized === "" || normalized === "-" || normalized === "." || normalized === "-.") {
    return Number.NaN;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function clampNumber(value: number, min?: number, max?: number): number {
  let clamped = value;

  if (typeof min === "number") {
    clamped = Math.max(clamped, min);
  }

  if (typeof max === "number") {
    clamped = Math.min(clamped, max);
  }

  return clamped;
}

export function getNumberFieldConstraintNotice(value: number, min?: number, max?: number): string | undefined {
  if (typeof min === "number" && value < min) {
    return `Minimum allowed value is ${formatInputNumber(min)}. Lower values reset to ${formatInputNumber(min)}.`;
  }

  if (typeof max === "number" && value > max) {
    return `Maximum allowed value is ${formatInputNumber(max)}. Higher values reset to ${formatInputNumber(max)}.`;
  }

  return undefined;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

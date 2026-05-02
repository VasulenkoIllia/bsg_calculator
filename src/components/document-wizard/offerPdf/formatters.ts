import type { ValueMode } from "../types.js";

export function hasPositiveNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function formatEuro(value: number, fractionDigits = 2): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `€${safeValue.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  })}`;
}

export function formatEuroInteger(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `€${Math.round(safeValue).toLocaleString("en-US")}`;
}

export function formatPercent(value: number, fractionDigits = 2): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const rounded = Number(safeValue.toFixed(fractionDigits));
  if (Number.isInteger(rounded)) {
    return `${rounded}%`;
  }

  return `${rounded.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: fractionDigits
  })}%`;
}

export function formatTierRangeLabel(
  tierIndex: 0 | 1 | 2,
  tier1UpToMillion: number,
  tier2UpToMillion: number
): string {
  const safeTier1 = Math.max(0, tier1UpToMillion);
  const safeTier2 = Math.max(safeTier1, tier2UpToMillion);

  if (tierIndex === 0) {
    return `Up to €${safeTier1.toLocaleString("en-US")}M`;
  }

  if (tierIndex === 1) {
    return `€${safeTier1.toLocaleString("en-US")}M – €${safeTier2.toLocaleString("en-US")}M`;
  }

  return `Above €${safeTier2.toLocaleString("en-US")}M`;
}

export function formatDisplayDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function formatPayinModel(model: "icpp" | "blended"): string {
  return model === "icpp" ? "IC++" : "Blended";
}

export function resolveModelHeaderLabel(collectionModel: string): string {
  return collectionModel.toLowerCase().includes("interchange plus")
    ? "SETTLEMENT MODEL"
    : "COLLECTION MODEL";
}

export function resolveModeValue(mode: ValueMode | undefined, valueLabel: string): string | null {
  if (mode === "waived") return "Waived";
  if (mode === "na") return "N/A";
  if (mode === "tbd") return "TBD";
  if (mode === "value") return valueLabel;
  return valueLabel;
}

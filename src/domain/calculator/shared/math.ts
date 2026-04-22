export const VOLUME_ROUNDING_STEP = 50_000;

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function toInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function roundUpToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (step <= 0) return value;
  return Math.ceil(value / step) * step;
}

export function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 100);
}

export function splitByPercent(
  total: number,
  primaryPercent: number
): { primary: number; secondary: number } {
  const normalizedPercent = normalizePercent(primaryPercent);
  const safeTotal = Number.isFinite(total) ? total : 0;
  const primary = safeTotal * (normalizedPercent / 100);
  return {
    primary,
    secondary: safeTotal - primary
  };
}

export function splitIntegerByPercent(
  total: number,
  primaryPercent: number
): { primary: number; secondary: number } {
  const safeTotal = toInteger(total);
  const normalizedPercent = normalizePercent(primaryPercent);
  const primary = Math.round(safeTotal * (normalizedPercent / 100));
  return {
    primary,
    secondary: Math.max(0, safeTotal - primary)
  };
}

export function ceilAmountForDisplay(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value >= 0) return Math.ceil(value);
  return -Math.ceil(Math.abs(value));
}

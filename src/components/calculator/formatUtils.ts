import { formatAmount2 } from "../../domain/calculator/index.js";

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function formatMillion(value: number): string {
  if (!Number.isFinite(value)) return "0.00M";
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}M`;
}

export function formatSignedAmount(value: number): string {
  if (value < 0) {
    return `-${formatAmount2(Math.abs(value))}`;
  }
  return formatAmount2(value);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

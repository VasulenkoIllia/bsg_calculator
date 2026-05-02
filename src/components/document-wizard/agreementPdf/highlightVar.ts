import { escapeHtml } from "../../calculator/formatUtils.js";

// Wraps a value with a span that has the `var-substituted` class so it can be
// visually highlighted in screen preview when the user toggles "Highlight
// variables". The print stylesheet hides the highlight, so the generated PDF
// stays clean.
//
// `kind` controls visual variant:
//   - "filled"      — value entered by the user (yellow highlight in preview)
//   - "placeholder" — fallback to spec placeholder (grey/orange in preview)
//   - "default"     — pre-filled default kept untouched (light highlight)
export type VariableKind = "filled" | "placeholder" | "default";

export function renderVariable(
  value: string,
  kind: VariableKind = "filled"
): string {
  return `<span class="var-substituted var-${kind}">${escapeHtml(value)}</span>`;
}

// Resolve a party-style field: if user filled it, render as "filled".
// If empty and a placeholder is provided, render placeholder as "placeholder".
// If empty and no placeholder, return empty string.
export function renderPartyField(
  value: string,
  placeholder?: string
): string {
  const trimmed = value.trim();
  if (trimmed.length > 0) {
    return renderVariable(trimmed, "filled");
  }
  if (placeholder) {
    return renderVariable(placeholder, "placeholder");
  }
  return "";
}

// For default values from constants that the user has not changed.
export function renderDefaultField(value: string): string {
  return renderVariable(value, "default");
}

// Resolve a field with a known default:
//   - empty value     → render the default in `default` style
//   - equals default  → render value in `default` style
//   - differs         → render value in `filled` style
export function renderFieldWithDefault(value: string, defaultValue: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return renderDefaultField(defaultValue);
  if (trimmed === defaultValue) return renderDefaultField(trimmed);
  return renderVariable(trimmed, "filled");
}

import { useEffect, useState } from "react";
import {
  clampNumber,
  formatInputNumber,
  getNumberFieldConstraintNotice,
  parseInputNumber
} from "./numberUtils.js";

export type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  helper?: string;
  helperTone?: "default" | "warning";
  readOnly?: boolean;
};

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  helper,
  helperTone = "default",
  readOnly = false
}: NumberFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [draftValue, setDraftValue] = useState(formatInputNumber(value));
  const [constraintNotice, setConstraintNotice] = useState<string | undefined>();

  useEffect(() => {
    if (!isFocused) {
      setDraftValue(formatInputNumber(value));
    }
  }, [isFocused, value]);

  const handleChange = (nextRaw: string) => {
    if (readOnly) return;
    setDraftValue(nextRaw);
    const parsed = parseInputNumber(nextRaw);

    if (Number.isNaN(parsed)) {
      setConstraintNotice(undefined);
      return;
    }

    setConstraintNotice(getNumberFieldConstraintNotice(parsed, min, max));
    onChange(clampNumber(parsed, min, max));
  };

  const handleBlur = () => {
    if (readOnly) return;
    setIsFocused(false);
    const parsed = parseInputNumber(draftValue);

    if (Number.isNaN(parsed)) {
      setDraftValue(formatInputNumber(value));
      setConstraintNotice(undefined);
      return;
    }

    const clamped = clampNumber(parsed, min, max);
    setConstraintNotice(getNumberFieldConstraintNotice(parsed, min, max));
    onChange(clamped);
    setDraftValue(formatInputNumber(clamped));
  };

  const handleFocus = () => {
    if (readOnly) return;
    setIsFocused(true);
    setDraftValue(String(value));
  };

  const activeHelper = helperTone === "warning" && helper ? helper : constraintNotice ?? helper;
  const activeHelperTone = constraintNotice || helperTone === "warning" ? "warning" : "default";

  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        className={[
          "field-input",
          readOnly
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-700 focus:border-slate-200 focus:ring-0"
            : ""
        ].join(" ")}
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={isFocused ? draftValue : formatInputNumber(value)}
        onChange={event => handleChange(event.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        readOnly={readOnly}
        aria-readonly={readOnly}
        min={min}
        max={max}
        step={step}
      />
      {activeHelper ? (
        <span
          className={[
            "mt-1 block text-xs",
            activeHelperTone === "warning"
              ? "rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-800"
              : "text-slate-500"
          ].join(" ")}
        >
          {activeHelper}
        </span>
      ) : null}
    </label>
  );
}

export type ModeToggleProps = {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};

export type CommissionModeCardProps = {
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
};

export type MiniToggleProps = {
  label: string;
  selected: boolean;
  onSelect: () => void;
  ariaLabel: string;
};

export function ModeToggle({ label, checked, onChange }: ModeToggleProps) {
  return (
    <label
      className={[
        "inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-base font-semibold transition",
        checked
          ? "border-blue-400 bg-blue-50 text-blue-900 shadow-sm"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
      ].join(" ")}
    >
      <input
        className="h-4 w-4 accent-blue-600"
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

export function MiniToggle({ label, selected, onSelect, ariaLabel }: MiniToggleProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={[
        "rounded-lg border px-3 py-2 text-sm font-semibold transition",
        selected
          ? "border-blue-400 bg-blue-50 text-blue-900"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export function CommissionModeCard({
  label,
  description,
  selected,
  onSelect
}: CommissionModeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Commission model: ${label}`}
      className={[
        "rounded-xl border p-4 text-left transition",
        selected
          ? "border-blue-400 bg-blue-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300"
      ].join(" ")}
    >
      <p className="text-base font-bold text-slate-900">{label}</p>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </button>
  );
}

import type { HardcodedConstantGroup } from "./types.js";

export function CalculatorHeader() {
  return (
    <header className="panel mb-6 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-cyan-700 px-6 py-8 text-white md:px-8">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-blue-100">
          BSG Pricing Workspace
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">
          Calculator v4
        </h1>
        <p className="mt-3 max-w-3xl text-base text-blue-50 md:text-lg">
          Zone 0/1 foundation with clear Payin and Payout separation, dynamic
          recalculation, and production-style readable input layout.
        </p>
      </div>
    </header>
  );
}

export function HardcodedConstantsPanel({
  visible,
  groups
}: {
  visible: boolean;
  groups: HardcodedConstantGroup[];
}) {
  if (!visible) return null;

  return (
    <section
      aria-label="Hardcoded calculation constants"
      className="panel mb-6 border border-slate-200 bg-slate-50 p-5 md:p-7"
    >
      <h2 className="text-lg font-bold text-slate-800">Hardcoded Calculation Constants</h2>
      <p className="mt-1 text-xs text-slate-600">
        Read-only values embedded in code and used by formulas during calculations/verification.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {groups.map(group => (
          <div
            key={group.title}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <h3 className="text-sm font-bold text-slate-800">{group.title}</h3>
            <dl className="mt-3 space-y-2 text-xs">
              {group.items.map(item => (
                <div key={`${group.title}-${item.label}`} className="grid gap-1 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3">
                  <dt className="text-slate-600">{item.label}</dt>
                  <dd className="font-semibold text-slate-800 sm:text-right">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CalculatorActionsPanel({
  showHardcodedConstants,
  onToggleConstantsAndFormulas,
  onReset,
  onApplyDefaults
}: {
  showHardcodedConstants: boolean;
  onToggleConstantsAndFormulas: () => void;
  onReset: () => void;
  onApplyDefaults: () => void;
}) {
  return (
    <section
      aria-label="Calculator actions"
      className="panel mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:justify-end md:p-7"
    >
      <button
        type="button"
        onClick={onToggleConstantsAndFormulas}
        className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 sm:w-auto"
      >
        {showHardcodedConstants ? "Hide constants & formulas" : "Show constants & formulas"}
      </button>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 sm:w-auto"
      >
        Reset all to 0
      </button>
      <button
        type="button"
        onClick={onApplyDefaults}
        className="inline-flex w-full items-center justify-center rounded-xl border border-blue-500 bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 sm:w-auto"
      >
        Apply defaults
      </button>
    </section>
  );
}

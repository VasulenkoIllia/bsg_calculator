// Sprint 9.L N2 — `CalculatorHeader` (the legacy gradient hero) was
// removed: Sprint 7.1 stopped rendering it from AppShell and Sprint 9.L
// confirmed no surface remounts it. If a future landing surface
// wants a hero again, it's two minutes to rebuild.
//
// `CalculatorActionsPanel` was likewise removed (Sprint 7.2 inlined
// its three buttons into CalculatorStickyToolbar — the standalone
// panel was unused by 9.L).

import type { HardcodedConstantGroup } from "./types.js";

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


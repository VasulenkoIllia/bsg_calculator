import { NavLink, Outlet } from "react-router-dom";
import { CalculatorHeader } from "./calculator/index.js";

const TABS: Array<{ to: string; label: string }> = [
  { to: "/calculator", label: "Calculator" },
  { to: "/wizard", label: "Contract Wizard & PDF" }
];

function WorkspaceTabs() {
  return (
    <section className="panel mb-6 border border-slate-200 bg-white p-4 md:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Workspace
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {TABS.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              [
                "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                isActive
                  ? "border-blue-400 bg-blue-50 text-blue-900"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              ].join(" ")
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </section>
  );
}

export function AppShell() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-10">
        <CalculatorHeader />
        <WorkspaceTabs />
        <Outlet />
      </div>
    </main>
  );
}

import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.js";
import { CalculatorHeader } from "./calculator/index.js";

const TABS: Array<{ to: string; label: string }> = [
  // Companies first — it's the natural entry now that the backend
  // is wired up (operators usually start "open a company" → then
  // open calculator / wizard from there).
  { to: "/companies", label: "Companies" },
  { to: "/documents", label: "Documents" },
  { to: "/calculator", label: "Calculator" },
  // Sprint 6.6: top-level "Saved" discovery entry. Sits next to
  // "Calculator" so the relationship (new draft vs. resume saved)
  // is visually adjacent in the workspace bar.
  { to: "/calculators", label: "Saved calculators" },
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

/**
 * Top-right identity strip: signed-in name + logout. Lives in AppShell
 * because every authenticated route needs it; the LoginPage has its
 * own layout and doesn't mount AppShell.
 */
function IdentityStrip() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const handleLogout = async (): Promise<void> => {
    // try/finally guarantees the redirect fires even if `logout()`
    // ever rejects (it doesn't today — AuthContext.logout has its own
    // catch-and-clear — but the contract decoupling protects against
    // a future refactor that lets the rejection escape).
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="mb-4 flex items-center justify-end gap-3 text-xs text-slate-500">
      <span>
        Signed in as <strong className="text-slate-700">{user.displayName}</strong>
      </span>
      <button
        type="button"
        onClick={handleLogout}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50"
      >
        Sign out
      </button>
    </div>
  );
}

export function AppShell() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-10">
        <IdentityStrip />
        <CalculatorHeader />
        <WorkspaceTabs />
        <Outlet />
      </div>
    </main>
  );
}

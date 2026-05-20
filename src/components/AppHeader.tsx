/**
 * Sprint 7.1 — single sticky app header.
 *
 * Consolidates the pre-7.1 three-block top chrome
 * (IdentityStrip + CalculatorHeader gradient hero + WorkspaceTabs)
 * into ONE compact sticky bar that pins to top:0 on every route.
 *
 * The brief from the operator was: "too many blocks at the top, I
 * want sticky and to clearly see where I am + what I can do here".
 *
 * UX contract:
 *   - LEFT  — brand mark ("BSG Pricing") doubles as a Home link.
 *   - CENTER — workspace navigation tabs. Active tab has a strong
 *     blue-filled treatment so "where am I" is unmistakable.
 *   - RIGHT — identity strip (display name + Sign out).
 *
 * Page-level context ("what can I do here") lives in each page's
 * own header (h1 + subtitle + primary action buttons), and the
 * Calculator page additionally renders CalculatorStickyToolbar
 * that pins UNDER this header (z-30 vs the AppHeader's z-40).
 *
 * z-40 + backdrop-blur on the bar keeps it readable when zone
 * panels scroll behind it. The bar is height ~48px on desktop,
 * which is also the top-offset CalculatorStickyToolbar uses to
 * dock right below.
 */

import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.js";

/**
 * Workspace tabs in tab order. The label is short enough to fit
 * in the 48px-tall sticky bar even at narrow viewports; overflow
 * scrolls horizontally on mobile rather than wrapping (wrapping
 * would break the sticky bar's height assumption).
 */
const TABS: Array<{ to: string; label: string; end?: boolean }> = [
  // /companies first — natural entry from "open a company" → "open
  // a calculator/wizard from there".
  { to: "/companies", label: "Companies" },
  { to: "/documents", label: "Documents" },
  { to: "/calculator", label: "Calculator" },
  { to: "/calculators", label: "Saved calculators" },
  { to: "/wizard", label: "Contract Wizard & PDF" }
];

export function AppHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    // Same pattern as the pre-7.1 IdentityStrip: try/finally so the
    // redirect fires even if logout rejects (it doesn't today, but
    // protects against a refactor that lets a rejection escape).
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 md:gap-4 md:px-8 md:py-2.5">
        {/* Brand — small wordmark, doubles as home link */}
        <Link
          to="/"
          className="shrink-0 text-sm font-bold uppercase tracking-[0.12em] text-blue-900 hover:text-blue-700"
        >
          BSG Pricing
        </Link>

        {/* Vertical divider hidden on narrow viewports to save space */}
        <span aria-hidden="true" className="hidden h-5 w-px bg-slate-300 md:block" />

        {/* Workspace tabs. overflow-x-auto so they scroll horizontally
            on narrow viewports rather than wrapping (which would break
            the fixed bar height the sticky toolbar's top-offset
            assumes). */}
        <nav
          aria-label="Workspace navigation"
          className="flex-1 overflow-x-auto"
        >
          <ul className="flex items-center gap-1 whitespace-nowrap">
            {TABS.map(tab => (
              <li key={tab.to}>
                <NavLink
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    [
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                      isActive
                        ? // Active tab — bold blue fill so "where am I"
                          // is unmistakable. Matches the
                          // hierarchy-emphasis used on Open Contract
                          // Wizard CTA so the bar reads as a single
                          // unified surface.
                          "bg-blue-600 text-white shadow-sm"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    ].join(" ")
                  }
                >
                  {tab.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Identity — hidden display name on tiny viewports to keep
            the bar single-row; Sign-out button stays visible. */}
        {user ? (
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <span className="hidden text-slate-500 sm:inline">
              Signed in as{" "}
              <strong className="text-slate-800">{user.displayName}</strong>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

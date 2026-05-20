/**
 * App shell wrapping every authenticated route.
 *
 * Sprint 7.1: collapsed from three separate top blocks (identity
 * strip, gradient hero, workspace tabs) into a SINGLE sticky
 * `AppHeader` (see src/components/AppHeader.tsx). Each page now
 * owns its own page-title header inline with the route content.
 *
 * The old `CalculatorHeader` gradient banner is no longer rendered
 * by the shell. The export still exists in
 * src/components/calculator/layout.tsx in case a future landing
 * page wants to mount it, but the global chrome no longer carries
 * a hero block on any route.
 */

import { Outlet } from "react-router-dom";
import { AppHeader } from "./AppHeader.js";

export function AppShell() {
  return (
    <main className="min-h-screen bg-slate-50">
      <AppHeader />
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </div>
    </main>
  );
}

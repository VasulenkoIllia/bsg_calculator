/**
 * Route gate — renders `<Outlet />` when the user is logged in,
 * redirects to /login otherwise.
 *
 * Splits the boot window from the logged-out window deliberately:
 *   - `isBooting` (cold-boot refresh in flight): render nothing /
 *     a loader so we don't FLASH the login page to users who DO
 *     have a valid cookie.
 *   - Boot finished + no user: redirect to /login, preserving the
 *     attempted path in `state.from` so LoginPage can send them
 *     back where they came from.
 *
 * Composed as a layout route in App.tsx — the wrapped sub-routes
 * sit inside `<Outlet />` and inherit the gate.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.js";

export function PrivateRoute() {
  const { user, isBooting } = useAuth();
  const location = useLocation();

  if (isBooting) {
    // Plain text on purpose — the AppShell isn't mounted yet during
    // this window (PrivateRoute is OUTSIDE its tree), so anything
    // fancier would carry its own dependency footprint here.
    return (
      <div className="flex h-screen items-center justify-center text-sm text-slate-500">
        Loading session…
      </div>
    );
  }

  if (!user) {
    // `replace` keeps the back button from cycling the login page.
    // `state.from` lets LoginPage redirect back after success.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

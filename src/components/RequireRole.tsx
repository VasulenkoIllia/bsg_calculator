/**
 * Phase 8 Stage 3 — role-gated route guard.
 *
 * Renders `<Outlet />` when the logged-in user satisfies the
 * minimum role tier (hierarchical: `admin` ⊂ `super_admin`).
 * Otherwise renders a 403-shaped error page. Does NOT redirect
 * to /login because the user IS logged in — they just don't have
 * the permission. Redirect would be misleading.
 *
 * Sits INSIDE PrivateRoute in the App.tsx layout tree so we can
 * assume `user !== null` here.
 *
 * Usage:
 *   <Route element={<RequireRole min="super_admin" />}>
 *     <Route path="/admin/users" element={<AdminUsersPage />} />
 *   </Route>
 */

import { Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.js";
import type { UserRole } from "../api/types.js";

interface RequireRoleProps {
  min: UserRole;
}

export function RequireRole({ min }: RequireRoleProps) {
  const { hasRole } = useAuth();

  if (!hasRole(min)) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-800">403 — Forbidden</h1>
        <p className="mt-2 text-sm text-slate-600">
          This page is only available to {min === "super_admin" ? "super-admins" : "admins"}.
          If you think this is a mistake, ask another super-admin to check
          your account role.
        </p>
      </div>
    );
  }

  return <Outlet />;
}

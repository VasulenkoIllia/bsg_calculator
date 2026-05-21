/**
 * Sprint 9.L D6 + T1 — unit tests for the shared role-tier helper.
 *
 * The function is tiny but it's load-bearing: every admin-only gate
 * (Sync button visibility, user-management routes, doc-delete CTAs)
 * delegates to it. A regression here would silently demote (or
 * worse — promote) UI affordances across the app.
 *
 * Tests cover the full 3×3 matrix so adding a fourth role + a new
 * row of the table can't accidentally invert an existing
 * comparison.
 */

import { describe, expect, it } from "vitest";
import { ROLE_TIER, hasRoleAtLeast } from "./roles.js";

describe("ROLE_TIER table", () => {
  it("encodes the hierarchical order user(0) < admin(1) < super_admin(2)", () => {
    expect(ROLE_TIER.user).toBe(0);
    expect(ROLE_TIER.admin).toBe(1);
    expect(ROLE_TIER.super_admin).toBe(2);
    expect(ROLE_TIER.user).toBeLessThan(ROLE_TIER.admin);
    expect(ROLE_TIER.admin).toBeLessThan(ROLE_TIER.super_admin);
  });
});

describe("hasRoleAtLeast — full 3×3 matrix", () => {
  it("user passes only the user gate", () => {
    expect(hasRoleAtLeast("user", "user")).toBe(true);
    expect(hasRoleAtLeast("user", "admin")).toBe(false);
    expect(hasRoleAtLeast("user", "super_admin")).toBe(false);
  });

  it("admin passes user and admin gates, not super_admin", () => {
    expect(hasRoleAtLeast("admin", "user")).toBe(true);
    expect(hasRoleAtLeast("admin", "admin")).toBe(true);
    expect(hasRoleAtLeast("admin", "super_admin")).toBe(false);
  });

  it("super_admin passes every gate", () => {
    expect(hasRoleAtLeast("super_admin", "user")).toBe(true);
    expect(hasRoleAtLeast("super_admin", "admin")).toBe(true);
    expect(hasRoleAtLeast("super_admin", "super_admin")).toBe(true);
  });
});

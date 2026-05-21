/**
 * Sprint 9.L D6 + T1 — unit tests for the shared role-tier helper
 * on the server side. Mirrors `src/shared/roles.test.ts` so a future
 * fourth role (e.g. `read_only_auditor`) added to one side without
 * the other shows up as TWO failing test files instead of a silent
 * production gap.
 */

import { describe, expect, it } from "vitest";
import { ROLE_TIER, USER_ROLES, hasRoleAtLeast } from "./roles";

describe("USER_ROLES — canonical enum", () => {
  it("exposes exactly user/admin/super_admin in tier order", () => {
    expect(USER_ROLES).toEqual(["user", "admin", "super_admin"]);
  });
});

describe("ROLE_TIER table", () => {
  it("encodes user(0) < admin(1) < super_admin(2)", () => {
    expect(ROLE_TIER.user).toBe(0);
    expect(ROLE_TIER.admin).toBe(1);
    expect(ROLE_TIER.super_admin).toBe(2);
  });

  it("has exactly one entry per USER_ROLES member", () => {
    expect(Object.keys(ROLE_TIER).sort()).toEqual([...USER_ROLES].sort());
  });
});

describe("hasRoleAtLeast — full 3×3 matrix", () => {
  it("user passes only the user gate", () => {
    expect(hasRoleAtLeast("user", "user")).toBe(true);
    expect(hasRoleAtLeast("user", "admin")).toBe(false);
    expect(hasRoleAtLeast("user", "super_admin")).toBe(false);
  });

  it("admin passes user + admin gates, not super_admin", () => {
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

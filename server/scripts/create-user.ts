#!/usr/bin/env tsx
/**
 * CLI: bootstrap a new user.
 *
 * Usage:
 *   npm run create-user -- --email=jane@bsg.com --password=secret --display="Jane Doe"
 *   npm run create-user -- --email=admin@bsg.com --password=adm --admin
 *   npm run create-user -- --email=sa@bsg.com    --password=sa  --role=super_admin
 *   npm run create-user -- --email=user@bsg.com  --password=pw  --login=user
 *
 * Required:
 *   --email      Unique, case-insensitive (citext)
 *   --password   Min 8 chars
 *
 * Optional:
 *   --login          Short login. Unique, citext. NULL if omitted.
 *   --display        Display name. Empty string if omitted.
 *   --role           One of: user / admin / super_admin. Default: user.
 *   --admin          Legacy shortcut for `--role=admin`.
 *   --super-admin    Legacy shortcut for `--role=super_admin`.
 *
 * Sprint 9.L N3 — Phase 8 Stage 1 replaced the `is_admin` boolean
 * column with a 3-value `role` enum (user / admin / super_admin).
 * The doc-comment above had a stale reference to `is_admin = true`;
 * `--admin` now sets `role='admin'`, and `--super-admin` (or
 * `--role=super_admin`) is the path for the top tier.
 *
 * No interactive prompt; intended for piped / scripted use (e.g.
 * inside a Docker container during first deploy).
 */

import bcrypt from "bcrypt";
import { z } from "zod";
import { env } from "../config/env";
import { db, pool } from "../db/client";
import { users } from "../db/schema";

interface ParsedArgs {
  email: string;
  password: string;
  login?: string;
  display: string;
  // Phase 8 Stage 1: explicit role + the two legacy boolean shortcuts.
  role: "user" | "admin" | "super_admin";
  admin: boolean;
  superAdmin: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  // Accept `--key=value` and `--flag` forms.
  const map = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq < 0) {
      map.set(arg.slice(2), "true");
    } else {
      map.set(arg.slice(2, eq), arg.slice(eq + 1));
    }
  }

  // Phase 8 Stage 1: `--role=user|admin|super_admin` is the new
  // explicit form. `--admin` (boolean) is kept for backward-compat:
  // it maps to `role=admin`. `--super-admin` (no value) shortcut
  // maps to `role=super_admin` for the bootstrap CLI path.
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8, { message: "Password must be at least 8 chars." }),
    login: z.string().min(1).max(64).optional(),
    display: z.string().default(""),
    role: z.enum(["user", "admin", "super_admin"]).default("user"),
    admin: z
      .string()
      .optional()
      .transform(v => v === "true"),
    superAdmin: z
      .string()
      .optional()
      .transform(v => v === "true")
  });

  const parsed = schema.safeParse({
    email: map.get("email"),
    password: map.get("password"),
    login: map.get("login"),
    display: map.get("display") ?? "",
    role: map.get("role"),
    admin: map.get("admin"),
    superAdmin: map.get("super-admin")
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(i => `  --${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error(`[create-user] invalid arguments:\n${issues}\n`);
    printUsage();
    process.exit(1);
  }

  return parsed.data;
}

function printUsage(): void {
  // eslint-disable-next-line no-console
  console.error(
    [
      "Usage:",
      "  npm run create-user -- --email=jane@bsg.com --password=secret \\",
      "    [--login=jane] [--display=\"Jane Doe\"] [--role=user|admin|super_admin]",
      "",
      "Backward-compat: `--admin` = `--role=admin`, `--super-admin` = `--role=super_admin`."
    ].join("\n")
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Phase 8 Stage 1: resolve final role. Explicit `--role=...` wins;
  // otherwise the legacy `--super-admin` / `--admin` shortcuts feed
  // in. Default = `user` (least privileged).
  const role: "user" | "admin" | "super_admin" = args.superAdmin
    ? "super_admin"
    : args.admin
      ? "admin"
      : args.role;

  // eslint-disable-next-line no-console
  console.log(`[create-user] hashing password (bcrypt cost=${env.BCRYPT_COST})…`);
  const hash = await bcrypt.hash(args.password, env.BCRYPT_COST);

  try {
    const [user] = await db
      .insert(users)
      .values({
        email: args.email,
        login: args.login ?? null,
        passwordHash: hash,
        displayName: args.display,
        role
      })
      .returning({
        id: users.id,
        email: users.email,
        login: users.login,
        displayName: users.displayName,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt
      });

    // eslint-disable-next-line no-console
    console.log("[create-user] created:");
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(user, null, 2));
  } catch (err) {
    if (err instanceof Error && err.message.includes("duplicate key")) {
      // eslint-disable-next-line no-console
      console.error(
        `[create-user] FAIL: a user with email "${args.email}"` +
          (args.login ? ` or login "${args.login}"` : "") +
          " already exists."
      );
      process.exit(2);
    }
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error("[create-user] failed:", err);
  process.exit(1);
});

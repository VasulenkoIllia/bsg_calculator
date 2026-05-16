/**
 * Schema barrel — Drizzle Kit reads this to discover tables.
 *
 * Each file adds one or two tables; this re-export keeps
 * `drizzle.config.ts` pointing at a single path. The ordering here
 * does NOT determine CREATE TABLE order in migrations — Drizzle
 * resolves dependencies from `references()` calls.
 */

export * from "./users";
export * from "./refresh-tokens";
export * from "./companies";
export * from "./deals";
export * from "./calculator-configs";

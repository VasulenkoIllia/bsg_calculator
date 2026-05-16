/**
 * Drizzle Kit config — drives `npm run db:generate` + `npm run db:migrate`.
 *
 * - `schema`: barrel re-export that lists every table.
 * - `out`: where generated `.sql` migrations land (committed to git).
 * - `dialect: 'postgresql'`: matches Postgres 15+ in docker-compose.dev.yml.
 * - `dbCredentials.url`: read directly from .env (loaded via `dotenv-cli`
 *   wrapper in package.json scripts, OR set in shell before `db:*` commands).
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Glob picks up every table file directly; avoids the barrel
  // index.ts which Drizzle Kit's CJS loader doesn't resolve well
  // with NodeNext-style `.js` extensions.
  schema: "./server/db/schema/*.ts",
  out: "./server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://bsg:bsg_dev_password@localhost:5433/bsg_calculator"
  },
  // We commit reviewable SQL files. `push` is for prototyping ONLY.
  strict: true,
  verbose: true
});

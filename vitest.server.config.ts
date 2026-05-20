/// <reference types="vitest/config" />
/**
 * Vitest config — backend tests.
 *
 * Separate from the frontend's vite.config.ts because backend tests
 * need a Node environment (no jsdom) and bind to a different test
 * Postgres database. Run via:
 *
 *   npm run test:server
 *   npm run test:server -- --watch
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/*.test.ts"],
    // Exclude the spawned-agent worktree copies under `.claude/`.
    // Each worktree is a full repo checkout, so without this exclude
    // vitest would run every server test twice (once from the main
    // checkout, once from the worktree copy) and the latter often
    // points to a different Postgres or a different code revision.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
    setupFiles: ["./server/tests/setup.ts"],
    // Server tests need real Postgres + spin up the Express app via
    // supertest — sequential file execution avoids cross-test DB races
    // (multiple forks running TRUNCATE / INSERT simultaneously would
    // step on each other's per-test state). Vitest 4 removed
    // poolOptions; the equivalent knob is `fileParallelism: false`.
    fileParallelism: false,
    // bcrypt cost 12 is ~250ms per hash; bump per-test timeout.
    testTimeout: 15_000,
    hookTimeout: 30_000
  }
});

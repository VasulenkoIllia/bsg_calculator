/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // Server tests live in `server/**/*.test.ts` and use a separate
    // vitest config (vitest.server.config.ts) with the node
    // environment. Exclude them here so `npm test` doesn't try to
    // run them under jsdom.
    //
    // `.claude/worktrees/**` is excluded because git worktrees created
    // by spawned agents live there — they contain a full copy of the
    // repo, and without this exclude vitest would re-run every test
    // twice (and try to run server/ tests under jsdom).
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "server/**",
      ".claude/**"
    ]
  },
  server: {
    port: 5173,
    // Dev-only proxy: forward `/api/*` calls to the Express backend
    // running on port 8080. In production the SPA bundle is served
    // by the same Express process, so `/api` is already same-origin
    // and no proxy is needed.
    //
    // `changeOrigin: true` rewrites the Host header so backend CORS /
    // cookie logic sees the request as coming from itself, not from
    // the Vite dev server.
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true
      }
    }
  }
});

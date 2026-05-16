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
    exclude: ["**/node_modules/**", "**/dist/**", "server/**"]
  },
  server: {
    port: 5173
  }
});

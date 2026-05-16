/**
 * Browser-pool unit tests.
 *
 * Note: this file CANNOT spawn a real Chromium — env.NODE_ENV ===
 * "test" makes `acquireBrowser()` throw a deliberate error. The
 * production pool behaviour (lazy launch + recycle on TTL/count) is
 * covered indirectly via the pdf controller integration tests in
 * Sprint 4.E (which run with NODE_ENV=test but mock the service).
 *
 * What we CAN test here is the test-mode guard itself + the
 * shutdownBrowserPool no-op path (when nothing was launched).
 */

import { describe, expect, it } from "vitest";
import { InternalError } from "../../shared/errors";
import { acquireBrowser, shutdownBrowserPool } from "./browser-pool";

describe("browser-pool — test-mode guard", () => {
  it("acquireBrowser() throws InternalError in test mode", async () => {
    try {
      await acquireBrowser();
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(InternalError);
      // The public message is generic ("Something went wrong …"),
      // but `internalMessage` carries the dev-facing diagnostic.
      expect((err as InternalError).internalMessage).toMatch(/disabled in tests/i);
    }
  });

  it("shutdownBrowserPool() is a no-op when no browser was launched", async () => {
    // No throw, resolves cleanly.
    await expect(shutdownBrowserPool()).resolves.toBeUndefined();
  });
});

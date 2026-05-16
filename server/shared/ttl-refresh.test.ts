import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleTtlRefresh } from "./ttl-refresh";

describe("scheduleTtlRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns immediately + does not run refresh when enabled=false", async () => {
    const refresh = vi.fn(async () => {});
    await scheduleTtlRefresh({
      lastSyncedAt: new Date(0), // very stale
      ttlMs: 1000,
      enabled: false,
      refresh,
      logLabel: "test",
      logContext: {}
    });
    await vi.runAllTimersAsync();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not run refresh when ttlMs <= 0", async () => {
    const refresh = vi.fn(async () => {});
    await scheduleTtlRefresh({
      lastSyncedAt: new Date(0),
      ttlMs: 0,
      enabled: true,
      refresh,
      logLabel: "test",
      logContext: {}
    });
    await vi.runAllTimersAsync();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not run refresh when row is fresh (age < ttlMs)", async () => {
    const refresh = vi.fn(async () => {});
    await scheduleTtlRefresh({
      lastSyncedAt: new Date(Date.now() - 100), // 100ms old
      ttlMs: 10_000, // 10s TTL
      enabled: true,
      refresh,
      logLabel: "test",
      logContext: {}
    });
    await vi.runAllTimersAsync();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("runs refresh in background when row is stale", async () => {
    const refresh = vi.fn(async () => {});
    await scheduleTtlRefresh({
      lastSyncedAt: new Date(Date.now() - 60_000), // 60s old
      ttlMs: 5_000, // 5s TTL
      enabled: true,
      refresh,
      logLabel: "test",
      logContext: {}
    });
    // setImmediate fires after current tick — drain timers + microtasks.
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("swallows errors thrown by the refresh callback (no unhandled rejection)", async () => {
    const refresh = vi.fn(async () => {
      throw new Error("HubSpot exploded");
    });

    // Should NOT throw — error is logged inside the helper.
    await expect(
      scheduleTtlRefresh({
        lastSyncedAt: new Date(0),
        ttlMs: 1000,
        enabled: true,
        refresh,
        logLabel: "test",
        logContext: { entityId: "X" }
      })
    ).resolves.toBeUndefined();
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledOnce();
  });
});

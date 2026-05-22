/**
 * useIdleTimeout unit tests.
 *
 * Uses vitest fake timers to advance "wall clock" deterministically.
 * The hook's heartbeat fires once per second; we drive it with
 * `vi.advanceTimersByTime`. Activity events are simulated by
 * dispatching real DOM events on window (the hook listens via
 * `addEventListener`).
 *
 * Coverage:
 *   - active → warning transition at IDLE_TIMEOUT_MIN - IDLE_WARNING_SEC
 *   - warning → expired transition at IDLE_TIMEOUT_MIN
 *   - activity event resets the timer (when stage === active)
 *   - activity event does NOT reset while in warning stage
 *   - extend() flips warning back to active + resets timer
 *   - disabled (enabled=false) keeps stage in active forever
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIdleTimeout } from "./useIdleTimeout.js";
import { IDLE_TIMEOUT_MIN, IDLE_WARNING_SEC } from "../config/idleTimeout.js";

const TIMEOUT_MS = IDLE_TIMEOUT_MIN * 60 * 1000;
const WARNING_MS = IDLE_WARNING_SEC * 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function fireMouseMove() {
  window.dispatchEvent(new MouseEvent("mousemove"));
}

describe("useIdleTimeout", () => {
  it("stays active immediately after mount", () => {
    const { result } = renderHook(() => useIdleTimeout(true));
    expect(result.current.status).toEqual({ stage: "active" });
  });

  it("transitions to warning at (timeout - warningWindow)", () => {
    const { result } = renderHook(() => useIdleTimeout(true));
    // Advance to just before the warning window.
    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS - WARNING_MS - 1000);
    });
    expect(result.current.status.stage).toBe("active");

    // Cross into the warning window.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.status.stage).toBe("warning");
    if (result.current.status.stage === "warning") {
      expect(result.current.status.secondsRemaining).toBeLessThanOrEqual(IDLE_WARNING_SEC);
      expect(result.current.status.secondsRemaining).toBeGreaterThan(0);
    }
  });

  it("transitions to expired at the timeout boundary", () => {
    const { result } = renderHook(() => useIdleTimeout(true));
    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS + 1000);
    });
    expect(result.current.status.stage).toBe("expired");
  });

  it("activity event resets the timer while in active stage", () => {
    const { result } = renderHook(() => useIdleTimeout(true));
    // Walk most of the way to the timeout, then nudge with activity.
    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS / 2);
    });
    expect(result.current.status.stage).toBe("active");
    act(() => {
      // Skip the throttle window first — the first event after a
      // long idle should pass.
      vi.advanceTimersByTime(2000);
      fireMouseMove();
    });
    // Advance another half-timeout. Without the reset we'd hit
    // expired; with it, we should still be active.
    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS / 2);
    });
    expect(result.current.status.stage).toBe("active");
  });

  it("activity event does NOT reset the warning countdown", () => {
    const { result } = renderHook(() => useIdleTimeout(true));
    // Land inside the warning window.
    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS - WARNING_MS / 2);
    });
    expect(result.current.status.stage).toBe("warning");
    // Fake a mousemove — the warning must NOT reset.
    act(() => {
      vi.advanceTimersByTime(1500);
      fireMouseMove();
    });
    // Still in warning, countdown smaller than before.
    expect(result.current.status.stage).toBe("warning");
  });

  it("extend() resets the warning back to active", () => {
    const { result } = renderHook(() => useIdleTimeout(true));
    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS - WARNING_MS / 2);
    });
    expect(result.current.status.stage).toBe("warning");
    act(() => {
      result.current.extend();
    });
    expect(result.current.status.stage).toBe("active");
  });

  it("does nothing while disabled", () => {
    const { result } = renderHook(() => useIdleTimeout(false));
    act(() => {
      vi.advanceTimersByTime(TIMEOUT_MS * 2);
    });
    expect(result.current.status).toEqual({ stage: "active" });
  });
});

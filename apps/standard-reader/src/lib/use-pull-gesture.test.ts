// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePullGesture } from "./use-pull-gesture";

/**
 * jsdom has no touch events at all, so they are built by hand. The hook reads
 * only `touches`, `changedTouches` and `preventDefault`, which is exactly what
 * a real `TouchEvent` would hand it.
 */
function touchEvent(
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  points: Array<{ id?: number; x?: number; y?: number }>,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touches = points.map(({ id = 1, x = 0, y = 0 }) => ({
    clientX: x,
    clientY: y,
    identifier: id,
    target: document.body,
  }));
  Object.defineProperty(event, "touches", { value: touches });
  Object.defineProperty(event, "changedTouches", { value: touches });
  return event;
}

function dispatch(...args: Parameters<typeof touchEvent>) {
  act(() => {
    document.dispatchEvent(touchEvent(...args));
  });
}

/** A pull far enough past the damping curve to arm (threshold is 64 damped). */
const PAST_THRESHOLD = 140;

function setup({ enabled = true }: { enabled?: boolean } = {}) {
  const onRefresh = vi.fn(async () => "refreshed");
  const rendered = renderHook(() => usePullGesture({ enabled, onRefresh }));
  // The hook writes to whatever the caller rendered; stand in for the indicator.
  rendered.result.current.chipRef.current = document.createElement("div");
  rendered.result.current.iconRef.current = document.createElement("span");
  return { ...rendered, onRefresh };
}

/** The `translate3d(0, Npx, 0)` the gesture wrote, or null while at rest. */
function writtenOffset(chip: HTMLElement | null): number | null {
  const match = chip?.style.transform.match(/translate3d\(0, ([\d.]+)px/);
  return match?.[1] === undefined ? null : Number(match[1]);
}

beforeEach(() => {
  vi.useFakeTimers();
  // The gesture batches its DOM writes into a frame; run them inline so a test
  // can assert on what it wrote without pumping an animation loop.
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.scrollY = 0;
});

describe("usePullGesture", () => {
  it("does nothing until the pull is clearly vertical and past the slop", () => {
    const { result } = setup();

    dispatch("touchstart", [{ y: 100 }]);
    expect(result.current.phase).toBe("idle");

    // Inside the slop radius: still ambiguous.
    dispatch("touchmove", [{ y: 104 }]);
    expect(result.current.phase).toBe("idle");

    dispatch("touchmove", [{ y: 130 }]);
    expect(result.current.phase).toBe("pulling");
  });

  it("arms once the pull crosses the threshold and refreshes on release", async () => {
    const { onRefresh, result } = setup();

    dispatch("touchstart", [{ y: 100 }]);
    dispatch("touchmove", [{ y: 120 }]);
    expect(result.current.phase).toBe("pulling");
    expect(onRefresh).not.toHaveBeenCalled();

    dispatch("touchmove", [{ y: 100 + PAST_THRESHOLD }]);
    expect(result.current.phase).toBe("armed");
    // The indicator has been moved, and by less than the finger travelled —
    // that difference is the rubber-banding.
    const offset = writtenOffset(result.current.chipRef.current);
    expect(offset).not.toBeNull();
    expect(offset).toBeGreaterThan(64);
    expect(offset).toBeLessThan(PAST_THRESHOLD);

    dispatch("touchend", [{ y: 100 + PAST_THRESHOLD }]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("refreshing");

    // The spinner is held past the refresh itself so a fast refetch still reads
    // as an event, then the indicator goes home and leaves nothing behind.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current.phase).toBe("refreshing");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current.phase).toBe("idle");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.chipRef.current?.style.transform).toBe("");
    expect(result.current.chipRef.current?.style.opacity).toBe("");
  });

  it("snaps back without refreshing when the pull is too short", () => {
    const { onRefresh, result } = setup();

    dispatch("touchstart", [{ y: 100 }]);
    dispatch("touchmove", [{ y: 130 }]);
    dispatch("touchend", [{ y: 130 }]);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("idle");
    expect(writtenOffset(result.current.chipRef.current)).toBe(0);
  });

  it("leaves horizontal swipes to the page", () => {
    const { onRefresh, result } = setup();

    dispatch("touchstart", [{ x: 100, y: 100 }]);
    dispatch("touchmove", [{ x: 180, y: 112 }]);
    expect(result.current.phase).toBe("idle");

    // Once the gesture is handed back, carrying on downward must not claim it.
    dispatch("touchmove", [{ x: 180, y: 100 + PAST_THRESHOLD }]);
    dispatch("touchend", [{ x: 180, y: 100 + PAST_THRESHOLD }]);
    expect(result.current.phase).toBe("idle");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("ignores a pull that starts below the top of the page", () => {
    const { onRefresh, result } = setup();
    window.scrollY = 320;

    dispatch("touchstart", [{ y: 100 }]);
    dispatch("touchmove", [{ y: 100 + PAST_THRESHOLD }]);
    dispatch("touchend", [{ y: 100 + PAST_THRESHOLD }]);

    expect(result.current.phase).toBe("idle");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("hands the gesture back when a second finger lands", () => {
    const { onRefresh, result } = setup();

    dispatch("touchstart", [{ y: 100 }]);
    // The first decisive move only claims the gesture — it re-origins there so
    // the indicator doesn't jump the slop distance — so it takes a second one
    // to actually pull.
    dispatch("touchmove", [{ y: 120 }]);
    dispatch("touchmove", [{ y: 100 + PAST_THRESHOLD }]);
    expect(result.current.phase).toBe("armed");

    dispatch("touchmove", [
      { id: 1, y: 100 + PAST_THRESHOLD },
      { id: 2, y: 300 },
    ]);
    expect(result.current.phase).toBe("idle");

    dispatch("touchend", [{ y: 100 + PAST_THRESHOLD }]);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not listen at all while disabled", () => {
    const { onRefresh, result } = setup({ enabled: false });

    dispatch("touchstart", [{ y: 100 }]);
    dispatch("touchmove", [{ y: 100 + PAST_THRESHOLD }]);
    dispatch("touchend", [{ y: 100 + PAST_THRESHOLD }]);

    expect(result.current.phase).toBe("idle");
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

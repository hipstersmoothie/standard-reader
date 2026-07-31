// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFullscreen } from "./use-fullscreen";

/**
 * jsdom has the full-screen *shape* (`fullscreenEnabled` is false, the methods
 * are absent) but none of the behaviour, so the browser side is stood up here:
 * a document whose full-screen element we can move, and an element that records
 * being asked.
 */
function stubFullscreenApi({ enabled = true }: { enabled?: boolean } = {}) {
  const element = document.createElement("div");
  document.body.append(element);

  let current: Element | null = null;
  const setCurrent = (next: Element | null) => {
    current = next;
    document.dispatchEvent(new Event("fullscreenchange"));
  };

  Object.defineProperty(document, "fullscreenEnabled", {
    configurable: true,
    get: () => enabled,
  });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => current,
  });

  const requestFullscreen = vi.fn(async () => setCurrent(element));
  const exitFullscreen = vi.fn(async () => setCurrent(null));
  element.requestFullscreen = requestFullscreen;
  document.exitFullscreen = exitFullscreen;

  return { element, requestFullscreen, exitFullscreen, setCurrent };
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("useFullscreen", () => {
  it("offers nothing when the browser won't put an element full screen", () => {
    const { element, requestFullscreen } = stubFullscreenApi({
      enabled: false,
    });
    const { result } = renderHook(() => useFullscreen({ current: element }));

    expect(result.current.supported).toBe(false);
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  it("asks the target element, not the document", async () => {
    const { element, requestFullscreen } = stubFullscreenApi();
    const { result } = renderHook(() => useFullscreen({ current: element }));

    expect(result.current.supported).toBe(true);
    expect(result.current.active).toBe(false);

    await act(async () => result.current.toggle());

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(true);
  });

  it("exits when it is already the element filling the screen", async () => {
    const { element, exitFullscreen } = stubFullscreenApi();
    const { result } = renderHook(() => useFullscreen({ current: element }));

    await act(async () => result.current.toggle());
    await act(async () => result.current.toggle());

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(false);
  });

  it("follows the browser out — Escape and F11 don't come through us", async () => {
    const { element, setCurrent } = stubFullscreenApi();
    const { result } = renderHook(() => useFullscreen({ current: element }));

    await act(async () => result.current.toggle());
    expect(result.current.active).toBe(true);

    act(() => setCurrent(null));
    expect(result.current.active).toBe(false);
  });

  it("stays quiet about another element going full screen", () => {
    const { element, setCurrent } = stubFullscreenApi();
    const other = document.createElement("video");
    document.body.append(other);
    const { result } = renderHook(() => useFullscreen({ current: element }));

    act(() => setCurrent(other));

    expect(result.current.active).toBe(false);
  });

  it("swallows a refused request rather than rejecting into the void", async () => {
    const { element } = stubFullscreenApi();
    element.requestFullscreen = vi.fn(async () => {
      throw new Error("Permissions check failed");
    });
    const { result } = renderHook(() => useFullscreen({ current: element }));

    await act(async () => result.current.toggle());

    expect(result.current.active).toBe(false);
  });
});

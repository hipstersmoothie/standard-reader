// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFullscreen } from "./use-fullscreen";

type Stub = {
  standard?: boolean;
  webkit?: boolean;
};

/**
 * jsdom has the full-screen *shape* (`fullscreenEnabled` is false, the methods
 * are absent) but none of the behaviour, so the browser side is stood up here:
 * a document whose full-screen element we can move, and an element that records
 * being asked. `standard` / `webkit` choose which spelling of the API exists,
 * since the point of the prefixed path is browsers that have only the old one.
 */
function stubFullscreenApi({ standard = true, webkit = false }: Stub = {}) {
  const element = document.createElement("div");
  document.body.append(element);

  let current: Element | null = null;
  const setCurrent = (next: Element | null) => {
    current = next;
    document.dispatchEvent(
      new Event(
        webkit && !standard ? "webkitfullscreenchange" : "fullscreenchange",
      ),
    );
  };

  const key =
    webkit && !standard ? "webkitFullscreenElement" : "fullscreenElement";
  Object.defineProperty(document, key, {
    configurable: true,
    get: () => current,
  });

  const requestFullscreen = vi.fn(async () => setCurrent(element));
  const exitFullscreen = vi.fn(async () => setCurrent(null));
  if (standard) {
    element.requestFullscreen = requestFullscreen;
    document.exitFullscreen = exitFullscreen;
  } else {
    // jsdom defines the standard methods on the prototypes, so a browser that
    // has *only* the prefixed pair has to be built by shadowing them — deleting
    // would reach the prototype and leak into every later test.
    Object.defineProperty(element, "requestFullscreen", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: undefined,
    });
  }
  if (webkit) {
    Object.assign(element, { webkitRequestFullscreen: requestFullscreen });
    Object.assign(document, { webkitExitFullscreen: exitFullscreen });
  }

  return { element, requestFullscreen, exitFullscreen, setCurrent };
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => null,
  });
  Reflect.deleteProperty(document, "webkitFullscreenElement");
  Reflect.deleteProperty(document, "webkitExitFullscreen");
  // Drops the shadowing own-property, putting jsdom's prototype method back.
  Reflect.deleteProperty(document, "exitFullscreen");
});

describe("useFullscreen", () => {
  it("asks the target element, not the document", async () => {
    const { element, requestFullscreen } = stubFullscreenApi();
    const { result } = renderHook(() => useFullscreen({ current: element }));

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

  it("uses the prefixed API on a browser that has only that", async () => {
    const { element, requestFullscreen, exitFullscreen } = stubFullscreenApi({
      standard: false,
      webkit: true,
    });
    const { result } = renderHook(() => useFullscreen({ current: element }));

    await act(async () => result.current.toggle());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(true);

    await act(async () => result.current.toggle());
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(false);
  });

  it("does nothing at all where the platform has no full screen", async () => {
    // An iPhone: neither spelling exists, and the press has to be a no-op
    // rather than a crash — the control is drawn there regardless.
    const { element } = stubFullscreenApi({ standard: false });
    const { result } = renderHook(() => useFullscreen({ current: element }));

    await act(async () => result.current.toggle());

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

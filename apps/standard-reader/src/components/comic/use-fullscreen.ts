"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";

export interface FullscreenControl {
  /**
   * Whether this browser will put an element full screen at all. False on iOS
   * Safari, which reserves full screen for `<video>` — the control that offers
   * it has to be absent there rather than present and dead.
   */
  supported: boolean;
  /** Whether *this* element is the one currently filling the screen. */
  active: boolean;
  toggle: () => void;
}

/**
 * Full screen for one element, as a button can use it.
 *
 * The theater already covers the viewport, so what full screen buys a comic is
 * the browser's own furniture — tab strip, address bar, OS chrome — getting out
 * from around the art. That is the whole feature; everything here is about
 * asking for it safely.
 *
 * Support is detected after mount rather than during render: this component is
 * server-rendered, and a server that guessed "supported" would hand the client
 * a button that may not belong there (and a mismatch to reconcile). The state
 * follows `fullscreenchange` rather than the calls themselves, so the browser
 * stays the authority — Escape, F11 and the OS all exit without asking us, and
 * the icon has to keep up with them.
 *
 * Unprefixed API only. `browserslist("baseline 2024")` (the app's own target,
 * see `vite.config.ts`) puts every browser that supports element full screen at
 * all on the standard names, so the vendor-prefixed fallbacks would be dead
 * code guarding against browsers that fail the detection anyway.
 */
export function useFullscreen(
  target: RefObject<HTMLElement | null>,
): FullscreenControl {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (globalThis.document === undefined) return;
    setSupported(document.fullscreenEnabled);

    // Scoped to our own element: another element going full screen (a video in
    // a background tab of the same document) is not this reader's business.
    const sync = () => setActive(document.fullscreenElement === target.current);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [target]);

  const toggle = useCallback(() => {
    const element = target.current;
    if (!element) return;
    // Both calls reject when the browser refuses — a request outside a user
    // gesture, a permissions policy that forbids it. There is nothing to tell
    // the reader that the screen not changing doesn't already say, and an
    // unhandled rejection would be noise in the console for it.
    const request =
      document.fullscreenElement === element
        ? document.exitFullscreen()
        : element.requestFullscreen();
    void request.catch(() => {});
  }, [target]);

  return { supported, active, toggle };
}

"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";

/**
 * Safari shipped full screen under a prefix years before it shipped the
 * standard names, and still answers to the prefixed ones. iPadOS below 16.4 has
 * only these; the app's `baseline 2024` target doesn't cover them, but they cost
 * four lines and they are the difference between a working control and a dead
 * one on a device someone is actually holding.
 */
interface WebkitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface WebkitFullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

/** The element the browser currently has full screen, prefixes included. */
function fullscreenElement(): Element | null {
  const doc = document as WebkitFullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export interface FullscreenControl {
  /** Whether *this* element is the one currently filling the screen. */
  active: boolean;
  toggle: () => void;
}

/**
 * Full screen for one element, as a button can use it.
 *
 * The theater already covers the viewport, so what full screen buys a comic is
 * the browser's own furniture — tab strip, address bar, OS chrome — getting out
 * from around the art.
 *
 * The control is offered unconditionally rather than hidden where
 * `document.fullscreenEnabled` is false. That flag is honest — on iPhone it
 * means the Fullscreen API genuinely cannot put an element full screen, since
 * iOS reserves that for `<video>` — but hiding the button on the strength of it
 * makes the feature invisible on the device most likely to want it, and leaves a
 * reader hunting for a control that was never drawn. A button that the platform
 * refuses is a platform limit the reader can see; a missing button is one they
 * can only guess at.
 *
 * The state follows `fullscreenchange` rather than the calls themselves, so the
 * browser stays the authority — Escape, F11 and the OS all exit without asking
 * us, and the icon has to keep up with them.
 */
export function useFullscreen(
  target: RefObject<HTMLElement | null>,
): FullscreenControl {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (globalThis.document === undefined) return;

    // Scoped to our own element: another element going full screen (a video
    // elsewhere in the same document) is not this reader's business.
    const sync = () => setActive(fullscreenElement() === target.current);
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, [target]);

  const toggle = useCallback(() => {
    const element = target.current as WebkitFullscreenElement | null;
    if (!element) return;
    const doc = document as WebkitFullscreenDocument;

    // Every one of these is absent on a browser that doesn't do element full
    // screen, and rejects on one that does but won't right now (a request
    // outside a user gesture, a permissions policy, an iframe without
    // `allowfullscreen`). Both cases end here: there is nothing to tell the
    // reader that the screen not changing doesn't already say, and an unhandled
    // rejection would be console noise for it.
    const run = async () => {
      if (fullscreenElement() === element) {
        await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      } else {
        await (element.requestFullscreen?.() ??
          element.webkitRequestFullscreen?.());
      }
    };
    void run().catch(() => {});
  }, [target]);

  return { active, toggle };
}

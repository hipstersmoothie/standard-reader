"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";

/**
 * Safari shipped full screen under a prefix years before it shipped the
 * standard names, and still answers to the prefixed ones. iPadOS below 16.4 has
 * only these; the app's `baseline 2024` target doesn't cover them, but they cost
 * four lines and they are the difference between a working control and no
 * control on a device someone is actually holding.
 */
interface WebkitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface WebkitFullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
}

/** The element the browser currently has full screen, prefixes included. */
function fullscreenElement(): Element | null {
  const doc = document as WebkitFullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/** Whether this browser will put an element full screen at all, either spelling. */
function fullscreenAllowed(): boolean {
  const doc = document as WebkitFullscreenDocument;
  return Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

export interface FullscreenControl {
  /**
   * Whether the browser will do this at all. False on iPhone, and in any
   * context the browser has closed off (an iframe without `allowfullscreen`, a
   * permissions policy) — in each case the request would be refused, so the
   * caller has nothing to offer.
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
 * from around the art.
 *
 * `supported` is the browser's own answer, asked both ways, and callers are
 * expected to drop the control when it comes back false. That is a real
 * decision rather than a technicality: on iPhone the Fullscreen API cannot put
 * an element full screen at all — iOS reserves it for `<video>`, `webkit.org`
 * bug 206854 has been open since 2020, and the prefixed request was closed
 * `WONTFIX` in favour of it — so a button there would be inert forever rather
 * than pending. (The iPhone answer to full screen is the home-screen install
 * the app already supports: `display: standalone` takes Safari's bars away
 * outright.) Nothing here is iPhone-specific, though; when Safari does ship it,
 * the flag flips and the control appears with no release from us.
 *
 * Support is detected after mount rather than during render: this component is
 * server-rendered, and a server that guessed would hand the client a button
 * that may not belong there, and a mismatch to reconcile.
 *
 * The state follows `fullscreenchange` rather than the calls themselves, so the
 * browser stays the authority — Escape, F11 and the OS all exit without asking
 * us, and the icon has to keep up with them.
 */
export function useFullscreen(
  target: RefObject<HTMLElement | null>,
): FullscreenControl {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (globalThis.document === undefined) return;
    setSupported(fullscreenAllowed());

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

    // Both calls reject when the browser refuses — a request outside a user
    // gesture, a permissions policy — and are absent entirely where it doesn't
    // implement element full screen. Both cases end here: there is nothing to
    // tell the reader that the screen not changing doesn't already say, and an
    // unhandled rejection would be console noise for it.
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

  return { supported, active, toggle };
}

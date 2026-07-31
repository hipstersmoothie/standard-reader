"use client";

import { useEffect } from "react";

import type { ComicPage } from "#/server/reader/comic";

/**
 * Pages decoded ahead of the reader. Two is enough to cover a fast reader
 * holding the next key without pulling down a long stretch of art nobody is
 * going to look at.
 */
const PRELOAD_AHEAD = 2;

/**
 * One page kept warm behind, because paging back is common enough — a reader
 * checks the previous panel constantly — and it is a single image.
 */
const PRELOAD_BEHIND = 1;

/**
 * Fetch and decode the pages around the current one, so a turn shows art
 * instead of a blank frame.
 *
 * The chunk loader already has the page *metadata* nearby; this is about the
 * images themselves, which is the part that actually takes time on a comic. It
 * uses detached `Image` objects rather than hidden `<img>` elements: the browser
 * puts the result in the same HTTP cache the real `<img>` will hit, but nothing
 * is added to the DOM, so there is no layout, no paint, and nothing for a screen
 * reader to walk through.
 *
 * `decode()` is awaited where available so the bitmap is ready, not merely
 * downloaded — a large page can otherwise still flash on first paint. Failures
 * are ignored: this is an optimisation, and a page that fails here will simply
 * load normally when the reader reaches it.
 */
export function usePagePreload(
  pages: Map<number, ComicPage>,
  currentIndex: number,
): void {
  // The URLs, not the map, are the real dependency — a new chunk arriving must
  // not re-run this when the neighbours it produced are the ones already warm.
  const targets: Array<string> = [];
  for (let offset = -PRELOAD_BEHIND; offset <= PRELOAD_AHEAD; offset += 1) {
    if (offset === 0) continue;
    const url = pages.get(currentIndex + offset)?.url;
    if (url) targets.push(url);
  }
  const key = targets.join("\n");

  useEffect(() => {
    if (!key) return;
    if (globalThis.Image === undefined) return;

    const loaders = key.split("\n").map((url) => {
      const image = new globalThis.Image();
      image.decoding = "async";
      image.src = url;
      // `decode()` rejects if the element is discarded mid-flight, which is
      // exactly what happens when the reader pages away — not an error.
      void image.decode?.().catch(() => {});
      return image;
    });

    return () => {
      // Dropping `src` lets the browser abandon a fetch the reader has moved
      // past; anything already in the HTTP cache stays there.
      for (const image of loaders) {
        if (!image.complete) image.src = "";
      }
    };
  }, [key]);
}

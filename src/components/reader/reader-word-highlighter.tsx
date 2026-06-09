"use client";

import type { HighlightMap } from "#/lib/page-reader/word-highlight";

import { usePageReader } from "#/lib/page-reader/page-reader-context";
import {
  articleScrollContainers,
  buildHighlightMap,
  clearWordHighlight,
  matchedSentenceCount,
  rangeForSentence,
  scrollWordIntoView,
  setWordHighlight,
} from "#/lib/page-reader/word-highlight";
import { useEffect, useRef } from "react";

/** Throttle for (re)building the DOM↔sentence map while it isn't ready yet. */
const BUILD_RETRY_MS = 300;

const SCROLL_UNLOCK_KEYS = new Set([
  " ",
  "ArrowDown",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

/**
 * Drives sentence highlighting for the article that's currently playing. It
 * aligns the engine's narration sentences to this article's DOM and, while
 * playing, moves a CSS highlight to the active sentence. Auto-scroll follows
 * the active sentence until the user scrolls manually; they can re-lock from
 * the player bar. Renders nothing.
 */
export function ReaderWordHighlighter({
  rootRef,
  articleUri,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  articleUri: string;
}) {
  const {
    state,
    nowPlaying,
    getSentences,
    getProgress,
    scrollLocked,
    unlockScroll,
  } = usePageReader();
  const isCurrent = nowPlaying?.uri === articleUri;
  const { status } = state;

  const mapRef = useRef<HighlightMap | null>(null);
  const builtForRef = useRef<ReadonlyArray<string> | null>(null);
  const lastSentenceRef = useRef(-1);
  const lastBuildRef = useRef(0);
  const forceScrollRef = useRef(false);
  const prevScrollLockedRef = useRef(scrollLocked);
  const userPointerScrollRef = useRef(false);

  // Drop any cached map when the loaded article changes.
  useEffect(() => {
    mapRef.current = null;
    builtForRef.current = null;
    lastSentenceRef.current = -1;
    lastBuildRef.current = 0;
    forceScrollRef.current = false;
  }, [isCurrent, articleUri]);

  // Re-lock from the player bar: jump to the active sentence on the next frame.
  useEffect(() => {
    if (scrollLocked && !prevScrollLockedRef.current) {
      forceScrollRef.current = true;
    }
    prevScrollLockedRef.current = scrollLocked;
  }, [scrollLocked]);

  // Only break auto-follow on user-initiated scroll — not our own follow-into-view.
  useEffect(() => {
    if (!isCurrent || status !== "playing" || !scrollLocked) return;

    const root = rootRef.current;
    if (!root) return;

    const scrollers = articleScrollContainers(root);

    const onUserIntent = () => {
      unlockScroll();
    };

    const onPointerDown = () => {
      userPointerScrollRef.current = true;
    };

    const onPointerEnd = () => {
      userPointerScrollRef.current = false;
    };

    // Scrollbar drags emit scroll events without wheel/touchmove.
    const onScroll = () => {
      if (userPointerScrollRef.current) onUserIntent();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (SCROLL_UNLOCK_KEYS.has(event.key)) onUserIntent();
    };

    for (const el of scrollers) {
      el.addEventListener("scroll", onScroll, { passive: true });
      el.addEventListener("wheel", onUserIntent, { passive: true });
      el.addEventListener("touchmove", onUserIntent, { passive: true });
      el.addEventListener("keydown", onKeyDown);
      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointerup", onPointerEnd);
      el.addEventListener("pointercancel", onPointerEnd);
    }

    return () => {
      userPointerScrollRef.current = false;
      for (const el of scrollers) {
        el.removeEventListener("scroll", onScroll);
        el.removeEventListener("wheel", onUserIntent);
        el.removeEventListener("touchmove", onUserIntent);
        el.removeEventListener("keydown", onKeyDown);
        el.removeEventListener("pointerdown", onPointerDown);
        el.removeEventListener("pointerup", onPointerEnd);
        el.removeEventListener("pointercancel", onPointerEnd);
      }
    };
  }, [isCurrent, status, scrollLocked, rootRef, unlockScroll]);

  // Move the highlight to the active sentence each frame while playing. The map
  // is built lazily here (once sentences + content are ready, regardless of how
  // long the model took to load). Pausing leaves the sentence lit; leaving
  // clears it.
  useEffect(() => {
    if (!isCurrent) {
      clearWordHighlight();
      lastSentenceRef.current = -1;
      return;
    }
    if (status !== "playing") return;

    // Async content (e.g. a Bluesky embed that fetches and swaps its skeleton for
    // the real post) can appear after the map is built. Rebuild on DOM changes so
    // the new text gets aligned and token offsets stay correct. Debounced so a
    // burst of mutations only triggers one rebuild.
    const observerRoot = rootRef.current;
    const Observer = globalThis.MutationObserver;
    let observer: MutationObserver | null = null;
    let dirtyTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    if (observerRoot && Observer) {
      observer = new Observer(() => {
        if (dirtyTimer !== null) return;
        dirtyTimer = globalThis.setTimeout(() => {
          dirtyTimer = null;
          mapRef.current = null;
          builtForRef.current = null;
          lastSentenceRef.current = -1;
          lastBuildRef.current = 0;
        }, 150);
      });
      observer.observe(observerRoot, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);

      // Invalidate the cached map when the narration set changes (e.g. switching
      // from a full-article read to a play-from-selection), since indices are
      // relative to those sentences. `prepare` makes a fresh array each time.
      const sentences = getSentences();
      let map = mapRef.current;
      if (map && sentences !== builtForRef.current) {
        map = null;
        mapRef.current = null;
        builtForRef.current = null;
        lastSentenceRef.current = -1;
        clearWordHighlight();
      }

      if (!map) {
        const now = Date.now();
        if (now - lastBuildRef.current < BUILD_RETRY_MS) return;
        lastBuildRef.current = now;
        const root = rootRef.current;
        if (!root || sentences.length === 0) return;
        const built = buildHighlightMap(root, sentences);
        if (matchedSentenceCount(built) === 0) return;
        mapRef.current = built;
        builtForRef.current = sentences;
        map = built;
      }

      const progress = getProgress();
      if (!progress) return;
      const run = map.sentenceTokens[progress.index];
      if (!run) return;

      const sentenceChanged = progress.index !== lastSentenceRef.current;
      const shouldFollow =
        scrollLocked && (sentenceChanged || forceScrollRef.current);
      if (!sentenceChanged && !forceScrollRef.current) return;

      const range = rangeForSentence(map, run);
      if (!range) {
        // DOM changed under us; rebuild on a later frame.
        mapRef.current = null;
        return;
      }
      lastSentenceRef.current = progress.index;

      const root = rootRef.current;
      if (sentenceChanged) setWordHighlight(range);

      if (shouldFollow && root) {
        scrollWordIntoView(range, root);
        forceScrollRef.current = false;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (dirtyTimer !== null) globalThis.clearTimeout(dirtyTimer);
    };
  }, [isCurrent, status, scrollLocked, rootRef, getSentences, getProgress]);

  // Clear the highlight when the article view unmounts.
  useEffect(() => () => clearWordHighlight(), []);

  return null;
}

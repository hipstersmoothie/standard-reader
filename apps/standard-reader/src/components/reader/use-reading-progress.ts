"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import {
  clearLocalProgress,
  isResumableProgress,
  READING_PROGRESS_EPSILON,
  readLocalProgress,
  writeLocalProgress,
} from "#/lib/reading-progress";

/**
 * How long after landing we keep pulling the reader back to their saved spot.
 *
 * Restoring by fraction assumes the article is as tall as it was last time, and
 * for a few hundred milliseconds it isn't: images have reserved no space yet, so
 * the target offset drifts as they load. Re-applying across a short window is
 * what makes the difference between landing where you left off and landing two
 * screens early. Any real input ends it immediately — nothing yanks the page out
 * from under someone who has started reading.
 */
const RESTORE_SETTLE_MS = 3000;

/**
 * How far the page may drift from the target before the settle window pulls it
 * back.
 *
 * Wide enough that `scrollTo` landing a pixel or two off (or bottoming out
 * against the end of the document) doesn't bounce, narrow enough that a
 * scroll-to-top is always corrected.
 */
const RESTORE_TOLERANCE_PX = 8;

/** Debounce on writes. Long enough that a flick through doesn't write a row. */
const SAVE_DEBOUNCE_MS = 1000;

/** Input that means the reader is driving, not us. */
const USER_INTENT_EVENTS = [
  "wheel",
  "touchstart",
  "keydown",
  "pointerdown",
] as const;

/** Scroll offsets mapping the article body onto a 0–1 fraction. */
function progressGeometry(content: HTMLElement) {
  const viewport = globalThis.innerHeight;
  const contentTop = content.getBoundingClientRect().top + globalThis.scrollY;
  const contentBottom = contentTop + content.offsetHeight;
  const endScroll = Math.max(contentBottom - viewport, contentTop);
  return { contentTop, range: endScroll - contentTop };
}

/** How far through the article body the reader currently is, 0–1. */
function measureProgress(content: HTMLElement): number {
  const { contentTop, range } = progressGeometry(content);
  const scrollY = globalThis.scrollY;
  if (range <= 0) return scrollY >= contentTop ? 1 : 0;
  return Math.min(1, Math.max(0, (scrollY - contentTop) / range));
}

/** The inverse: the scroll offset that puts the reader at `progress`. */
function offsetForProgress(content: HTMLElement, progress: number): number {
  const { contentTop, range } = progressGeometry(content);
  return contentTop + progress * Math.max(0, range);
}

export interface UseReadingProgressResult {
  /** Live 0–1 fraction, for the progress track in the sticky chrome. */
  progress: number;
  /** Whether we opened this article somewhere other than the top. */
  resumed: boolean;
  /** Send the reader back to the top and forget the saved position. */
  startFromTop: () => void;
}

/**
 * Keeps an article open at the place the reader left it, and remembers the
 * place they leave it at.
 *
 * Position is stored twice on purpose — see `#/lib/reading-progress`. The local
 * copy is read synchronously here so the restore happens in the same frame as
 * the first paint (a visible scroll jump is worse than no restore at all); the
 * server copy arrives a beat later and only wins if the reader got further on
 * another device and hasn't touched this one yet.
 */
export function useReadingProgress({
  documentUri,
  articleRef,
  enabled,
  skipRestore,
}: {
  documentUri: string;
  articleRef: React.RefObject<HTMLElement | null>;
  /** False when the reader has reading history turned off. */
  enabled: boolean;
  /** True when something else owns the landing position (a shared quote). */
  skipRestore: boolean;
}): UseReadingProgressResult {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);
  const [resumed, setResumed] = useState(false);

  const progressRef = useRef(0);
  const savedRef = useRef<number | null>(null);
  const userDroveRef = useRef(false);
  /** Re-applies the saved position; live only during the settle window. */
  const applyRestoreRef = useRef<((progress: number) => void) | null>(null);
  /**
   * `enabled` and `save` are read through refs so the restore effect can depend
   * on the article alone. The preference arrives from a query and flips from its
   * default a moment after mount — as a dependency it would re-run the effect
   * and scroll a reader who had already started reading back to the saved spot.
   */
  const enabledRef = useRef(enabled);
  const saveRef = useRef<(next: number) => void>(() => {});

  const { mutate: persist } = useMutation({
    mutationKey: ["reader", "setReadingProgress"] as const,
    mutationFn: async (next: number) =>
      readerApi.setReadingProgress({
        data: { documentUri, progress: next },
      }),
    // Fail fast offline instead of taking React Query's default, which *pauses*
    // the mutation and replays it on reconnect. Scrolling emits one of these
    // every second or so, so a subway ride would queue dozens of writes that
    // all replay to say what the last one says. The local copy is the durable
    // record; the reconnect flush below sends the one value that matters.
    networkMode: "offlineFirst",
    onError: () => {},
    retry: false,
  });

  const save = useCallback(
    (next: number) => {
      if (!enabled) return;

      const previous = savedRef.current;
      if (
        previous !== null &&
        Math.abs(next - previous) < READING_PROGRESS_EPSILON
      ) {
        return;
      }
      savedRef.current = next;

      writeLocalProgress(documentUri, next);
      persist(next);

      // The shelf only changes when an article joins or leaves it — not on
      // every scroll — so this refetch stays rare.
      if (
        previous === null ||
        isResumableProgress(previous) !== isResumableProgress(next)
      ) {
        void queryClient.invalidateQueries({
          queryKey: ["reader", "unfinished"],
        });
      }
    },
    [documentUri, enabled, persist, queryClient],
  );

  // Runs before the restore effect below on every commit, so that effect always
  // reads the current preference without listing it as a dependency.
  useLayoutEffect(() => {
    enabledRef.current = enabled;
    saveRef.current = save;
  }, [enabled, save]);

  // Coming back online, send where the reader actually got to while offline —
  // one write, deliberately bypassing `save`'s "has it moved enough" guard,
  // because what changed is our ability to reach the server, not the position.
  useEffect(() => {
    if (!enabled) return;

    const flushOnReconnect = () => {
      persist(progressRef.current);
      void queryClient.invalidateQueries({
        queryKey: ["reader", "unfinished"],
      });
    };

    globalThis.addEventListener("online", flushOnReconnect);
    return () => globalThis.removeEventListener("online", flushOnReconnect);
  }, [enabled, persist, queryClient]);

  const { mutate: forget } = useMutation({
    mutationKey: ["reader", "clearReadingProgress"] as const,
    mutationFn: async () =>
      readerApi.clearReadingProgress({ data: { documentUri } }),
    // Unlike the position writes above, this one keeps React Query's default
    // network mode so an offline clear is paused and replayed on reconnect.
    // It is a single deliberate action, not a stream, and dropping it would let
    // the server position come back and undo what the reader just asked for.
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["reader", "unfinished"],
      });
    },
  });

  const startFromTop = useCallback(() => {
    userDroveRef.current = true;
    applyRestoreRef.current = null;
    globalThis.scrollTo(0, 0);
    setResumed(false);
    savedRef.current = 0;
    clearLocalProgress(documentUri);
    // Drop the cached server answer too, so nothing re-reads the position we
    // just cleared before the mutation lands.
    queryClient.setQueryData(
      readerApi.getReadingProgressQueryOptions(documentUri).queryKey,
      null,
    );
    if (enabled) forget();
  }, [documentUri, enabled, forget, queryClient]);

  useLayoutEffect(() => {
    const articleEl = articleRef.current;
    if (!articleEl) return;

    progressRef.current = 0;
    savedRef.current = null;
    userDroveRef.current = false;
    setResumed(false);

    let restoreTarget: number | null = null;
    let settleTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    let saveTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

    const endRestore = () => {
      userDroveRef.current = true;
      restoreTarget = null;
      applyRestoreRef.current = null;
      if (settleTimer !== undefined) globalThis.clearTimeout(settleTimer);
      for (const event of USER_INTENT_EVENTS) {
        globalThis.removeEventListener(event, endRestore);
      }
    };

    const applyRestore = (target: number) => {
      restoreTarget = target;
      globalThis.scrollTo(0, offsetForProgress(articleEl, target));
      setResumed(true);
    };

    const sync = () => {
      const next = measureProgress(articleEl);
      progressRef.current = next;
      setProgress(next);
    };

    const scheduleSave = () => {
      if (!enabledRef.current) return;
      if (saveTimer !== undefined) globalThis.clearTimeout(saveTimer);
      saveTimer = globalThis.setTimeout(() => {
        saveRef.current(progressRef.current);
      }, SAVE_DEBOUNCE_MS);
    };

    // Whether the landing position is ours to choose. A shared quote owns it,
    // and so does a `#hash` — an anchor in the URL is a destination the reader
    // asked for out loud, which outranks one we remembered for them.
    const ownsLanding = !skipRestore && !globalThis.location.hash;

    // Measure the <article> only — progress should hit 100% at the end of the
    // article body, not after the "More from" / comments sections below it.
    const stored =
      enabledRef.current && ownsLanding ? readLocalProgress(documentUri) : null;

    if (stored && isResumableProgress(stored.progress)) {
      savedRef.current = stored.progress;
      applyRestore(stored.progress);
      applyRestoreRef.current = applyRestore;
      for (const event of USER_INTENT_EVENTS) {
        globalThis.addEventListener(event, endRestore, {
          passive: true,
          once: true,
        });
      }
      settleTimer = globalThis.setTimeout(endRestore, RESTORE_SETTLE_MS);
    } else if (ownsLanding) {
      globalThis.scrollTo(0, 0);
    }

    sync();

    // The page (document) is the scroller, so its scroll event fires on window.
    //
    // While the settle window is live, *we* are the one steering — so a scroll
    // we didn't ask for is something else's, and gets corrected rather than
    // recorded. The router is the one that always does this: its
    // `scrollRestoration` handler runs on `onRendered`, from a layout effect
    // mounted as a sibling *after* the route's own tree, so on every in-app
    // navigation it scrolls a freshly-restored article back to the top a beat
    // after the restore. Saving that would be worse than losing the landing:
    // a measured 0 is written straight through to both stores, and writes
    // outside the 2–95% band delete — one clobbered restore and the position
    // is gone from this device, the server, and the shelf. Hence: correct, and
    // never save from inside the window. Real input ends it (`endRestore`)
    // before any scroll it causes is dispatched.
    const onScroll = () => {
      if (restoreTarget !== null) {
        const target = offsetForProgress(articleEl, restoreTarget);
        if (Math.abs(globalThis.scrollY - target) > RESTORE_TOLERANCE_PX) {
          globalThis.scrollTo(0, target);
        }
        sync();
        return;
      }
      sync();
      scheduleSave();
    };
    globalThis.addEventListener("scroll", onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      // Late-loading media moved the target out from under us.
      if (restoreTarget !== null) {
        globalThis.scrollTo(0, offsetForProgress(articleEl, restoreTarget));
      }
      sync();
    });
    resizeObserver.observe(articleEl);

    // Closing the tab is the most common way to leave an article part-read, and
    // it is the one moment a debounce would lose. `pagehide` also covers the
    // iOS back-forward cache, where `beforeunload` never fires.
    const flush = () => {
      if (saveTimer !== undefined) globalThis.clearTimeout(saveTimer);
      saveRef.current(progressRef.current);
    };
    const onPageHide = () => flush();
    const onVisibility = () => {
      if (globalThis.document.visibilityState === "hidden") flush();
    };
    globalThis.addEventListener("pagehide", onPageHide);
    globalThis.document.addEventListener("visibilitychange", onVisibility);

    return () => {
      flush();
      endRestore();
      if (saveTimer !== undefined) globalThis.clearTimeout(saveTimer);
      globalThis.removeEventListener("scroll", onScroll);
      globalThis.removeEventListener("pagehide", onPageHide);
      globalThis.document.removeEventListener("visibilitychange", onVisibility);
      resizeObserver.disconnect();
    };
    // Deliberately keyed on the article alone — see `enabledRef` above.
  }, [articleRef, documentUri, skipRestore]);

  // The other-device correction. Deliberately not awaited anywhere on the
  // critical path — it lands late and only matters when it disagrees.
  const { data: remote } = useQuery({
    ...readerApi.getReadingProgressQueryOptions(documentUri),
    enabled: enabled && !skipRestore,
  });

  useEffect(() => {
    if (!remote || userDroveRef.current) return;
    const applyRestore = applyRestoreRef.current;
    if (!applyRestore) return;
    if (!isResumableProgress(remote.progress)) return;

    const local = readLocalProgress(documentUri);
    // This device already knows at least as much — leave the reader alone.
    if (local && local.updatedAt >= remote.updatedAt) return;
    if (
      Math.abs(remote.progress - progressRef.current) < READING_PROGRESS_EPSILON
    ) {
      return;
    }

    savedRef.current = remote.progress;
    writeLocalProgress(documentUri, remote.progress, remote.updatedAt);
    applyRestore(remote.progress);
  }, [documentUri, remote]);

  return { progress, resumed, startFromTop };
}

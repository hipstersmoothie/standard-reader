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
export const RESTORE_SETTLE_MS = 3000;

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
      // Nothing known this session and nothing worth keeping: there is no row
      // to delete, so this would be a POST per article open that does nothing.
      // (`previous` is only null when neither a local nor a remote position was
      // adopted, so this can't swallow a real clear.)
      if (previous === null && !isResumableProgress(next)) {
        savedRef.current = next;
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
    /**
     * Whether the reader has touched the input devices since we landed. On its
     * own this does not mean they are steering — inertial scrolling does not
     * stop because the page changed, so momentum from the feed keeps arriving
     * here for a while after the navigation. It takes a *scroll* that a hand
     * could plausibly have produced to hand the page over.
     */
    let sawUserIntent = false;

    const noteUserIntent = () => {
      sawUserIntent = true;
    };

    const endRestore = () => {
      userDroveRef.current = true;
      restoreTarget = null;
      applyRestoreRef.current = null;
      if (settleTimer !== undefined) globalThis.clearTimeout(settleTimer);
      for (const event of USER_INTENT_EVENTS) {
        globalThis.removeEventListener(event, noteUserIntent);
      }
    };

    const applyRestore = (target: number) => {
      restoreTarget = target;
      // A restore landing now invalidates anything queued from before it — in
      // particular the router's reset, which would otherwise save a 0 over the
      // position we just adopted and delete it.
      if (saveTimer !== undefined) globalThis.clearTimeout(saveTimer);
      if (settleTimer !== undefined) globalThis.clearTimeout(settleTimer);
      settleTimer = globalThis.setTimeout(endRestore, RESTORE_SETTLE_MS);
      globalThis.scrollTo(0, offsetForProgress(articleEl, target));
      setResumed(true);
    };

    /** Set once a scroll lands somewhere that isn't the very top. */
    let sawIncrementalScroll = false;

    /**
     * Whether a scroll is one no hand produced: it arrives at the very top,
     * and it is the first scroll since we landed. A reader cannot get from
     * mid-article to the top without passing through it — wheel and touch both
     * emit a run of intermediate events, and the first of those hands the page
     * over. Only a programmatic `scrollTo` teleports.
     *
     * Deliberately not a distance test. The obvious version — "a jump of more
     * than a screen" — silently does nothing on ordinary articles, where the
     * whole restore offset is smaller than the viewport (a 1500px article on a
     * 660px screen restores to ~420px, so the jump is never a screen tall).
     */
    const isProgrammaticReset = (to: number) =>
      to <= RESTORE_TOLERANCE_PX && !sawIncrementalScroll;

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

    if (ownsLanding) {
      // Armed whether or not this device remembers anything: the server copy
      // exists precisely for the device that has never seen this article, and
      // gating the machinery on a local copy meant the only case cross-device
      // sync is *for* was the one case it could never serve.
      applyRestoreRef.current = applyRestore;
      for (const event of USER_INTENT_EVENTS) {
        globalThis.addEventListener(event, noteUserIntent, {
          passive: true,
          once: true,
        });
      }
      settleTimer = globalThis.setTimeout(endRestore, RESTORE_SETTLE_MS);

      if (stored && isResumableProgress(stored.progress)) {
        savedRef.current = stored.progress;
        applyRestore(stored.progress);
      } else {
        globalThis.scrollTo(0, 0);
      }
    }

    sync();

    // The page (document) is the scroller, so its scroll event fires on window.
    //
    // While the settle window is live, *we* are the one steering — so a scroll
    // we didn't ask for is something else's, and gets corrected rather than
    // recorded. This is now a backstop rather than the mechanism: the router
    // used to be the reliable offender — its handler runs on `onRendered`, from
    // a layout effect mounted as a sibling *after* the route's own tree, so on
    // every in-app navigation it scrolled a freshly-restored article back to the
    // top a beat later — and it is switched off for this route outright (see
    // `routerOwnsScroll`). What remains is defence against anything else that
    // scrolls without asking, because the cost is asymmetric: a measured 0 is
    // written straight through to both stores, and writes outside the 2–95%
    // band delete, so one clobbered restore takes the position off this device,
    // off the server, and off the shelf.
    //
    // So the window is given up to a scroll the reader plausibly made, and
    // never to a teleport — input alone is not enough to end it, because
    // momentum from the previous page is input the reader is no longer making.
    const onScroll = () => {
      const to = globalThis.scrollY;
      if (to > RESTORE_TOLERANCE_PX) sawIncrementalScroll = true;

      if (restoreTarget !== null) {
        if (sawUserIntent && !isProgrammaticReset(to)) {
          endRestore();
          sync();
          scheduleSave();
          return;
        }

        const target = offsetForProgress(articleEl, restoreTarget);
        if (Math.abs(to - target) > RESTORE_TOLERANCE_PX) {
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
      // Inside the settle window the position on screen is one we chose, or one
      // we are about to correct — never the reader's. Leaving fast (a glance,
      // then straight back) would otherwise write the router's reset on the way
      // out, which is the one write that deletes.
      if (restoreTarget !== null) return;
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

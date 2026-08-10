"use client";

import {
  animationDuration,
  animationTimingFunction,
} from "@standard-reader/design-system/theme/animations.stylex";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  PULL_REST,
  PULL_SLOP,
  PULL_THRESHOLD,
  dampPull,
  isVerticalPull,
  pullProgress,
  shouldCommitPull,
} from "./pull-gesture";

/**
 * Keep the spinner up at least this long. A refetch that resolves in 80ms would
 * otherwise read as "nothing happened" — the reader never sees the state they
 * asked for.
 */
const MIN_SPIN_MS = 550;

/** …and give up waiting on a refresh that never settles. */
const MAX_SPIN_MS = 10_000;

/**
 * How long the page takes to travel back to rest. Must match the duration token
 * in {@link SETTLE_TRANSITION} — the timer exists only to strip the inline
 * styles once the transition it describes has finished.
 */
const SETTLE_MS = 150;

// Both decelerate; neither overshoots. A spring on the park was fine when this
// moved a 44px chip, but it now carries the whole content column — a bounce at
// that size reads as the page wobbling, not as a flourish. Arrival and exit are
// told apart by duration instead: the park settles into place, the settle is
// just getting out of the way.
const PARK_TRANSITION = `transform ${animationDuration.slow} ${animationTimingFunction.easeOut}, opacity ${animationDuration.fast} linear`;
const SETTLE_TRANSITION = `transform ${animationDuration.default} ${animationTimingFunction.easeOut}, opacity ${animationDuration.default} linear`;

export type PullPhase = "idle" | "pulling" | "armed" | "refreshing";

/**
 * The chip's rendered size, for centring it in the gap the pull opens. Read off
 * the element where possible — this is only the fallback for the first frame and
 * for environments that don't lay anything out.
 */
const CHIP_SIZE = 44;

/** Surfaces that own their own touch handling and must never be pulled from. */
const IGNORED_ANCESTORS =
  '[data-no-pull-refresh],[role="dialog"],[role="alertdialog"],[role="slider"]';

function prefersReducedMotion(): boolean {
  return (
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

/**
 * True while an overlay has the page's scroll locked. react-aria pins the body
 * to hold the scroll position on iOS, which also zeroes `scrollY` — without
 * this the gesture would read a locked page as "at the top" and arm behind an
 * open sheet.
 */
function scrollIsLocked(): boolean {
  return document.body.style.position === "fixed";
}

/**
 * The pull-to-refresh gesture, for a page whose scroll container is the
 * document.
 *
 * The page comes with the finger: `contentRef`'s element is translated down by
 * the damped pull distance, and the indicator rides the gap that opens above it
 * — the same direct manipulation the gesture has on any phone, rather than a
 * chip floating over a page that never moves.
 *
 * Only the *phase* lives in React state — it changes a handful of times per
 * gesture. The pull distance is written straight to the DOM every frame the
 * finger moves, the way the shell's other scroll-driven chrome does it: routing
 * it through state would re-render the page under the reader's thumb.
 *
 * The listeners are attached lazily. `touchstart` is passive and bails in a
 * couple of comparisons when the page isn't at the top; only once a touch
 * qualifies does the non-passive `touchmove` go on, so the rest of the app never
 * carries a scroll-blocking listener it isn't using.
 */
export function usePullGesture({
  contentRef,
  enabled,
  onRefresh,
}: {
  /**
   * The page content to pull. Everything below the gesture's indicator that
   * should travel with the finger — on the reader shell, the content column.
   */
  contentRef: React.RefObject<HTMLElement | null>;
  /** Off on desktop, and off while no page has registered a refresh. */
  enabled: boolean;
  /** Resolves when the page's data has been refetched. */
  onRefresh: (() => Promise<unknown>) | null;
}) {
  const chipRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<PullPhase>("idle");

  // The handlers below live for the length of one gesture but read state that
  // outlives it, so anything they share with React sits in a ref.
  const phaseRef = useRef<PullPhase>("idle");
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const setPhaseBoth = useCallback((next: PullPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  /**
   * Move the page and the indicator to `distance`. `transition` is a CSS value,
   * or `null` for none — while the finger is down every frame is a fresh
   * position and a transition would only lag behind it.
   */
  const write = useCallback(
    (distance: number, transition: string | null) => {
      const motion =
        transition === null || prefersReducedMotion() ? "none" : transition;

      // The page itself. This is the gesture — the chip below is only a read-out
      // of how far it has come.
      const content = contentRef.current;
      if (content) {
        content.style.transition = motion;
        content.style.transform = `translate3d(0, ${distance.toFixed(1)}px, 0)`;
      }

      const chip = chipRef.current;
      if (!chip) return;
      const progress = pullProgress(distance);
      chip.style.transition = motion;
      // Centred in the gap: the chip travels at half the page's speed, so it
      // stays in the middle of the opening rather than riding its bottom edge.
      // Below ~half its own height it is still tucked behind the top bar, which
      // paints over this lane.
      const chipY = distance / 2 - (chip.offsetHeight || CHIP_SIZE) / 2;
      // Scale and fade in together so the chip grows into the gap rather than
      // arriving at full size the moment it clears the bar.
      chip.style.transform = `translate3d(0, ${chipY.toFixed(1)}px, 0) scale(${(
        0.72 +
        0.28 * progress
      ).toFixed(3)})`;
      chip.style.opacity = Math.min(1, progress * 1.4).toFixed(3);

      // While the finger is down the icon tracks the pull. A full turn, not a
      // partial one: at the threshold the icon is back where it started, so
      // when the keyframe spinner takes over — and this inline transform is
      // dropped, since the two would fight — nothing visibly snaps back.
      const icon = iconRef.current;
      if (icon)
        icon.style.transform = `rotate(${(progress * 360).toFixed(1)}deg)`;
    },
    [contentRef],
  );

  /**
   * Drop every inline style the gesture wrote. A page at rest carries none — an
   * identity transform is still a compositing layer, and leaving one on the
   * whole content column would cost that for the rest of the session over a
   * gesture used a second at a time.
   */
  const clear = useCallback(() => {
    const content = contentRef.current;
    if (content) {
      content.style.removeProperty("transform");
      content.style.removeProperty("transition");
    }
    const chip = chipRef.current;
    if (chip) {
      chip.style.removeProperty("transform");
      chip.style.removeProperty("opacity");
      chip.style.removeProperty("transition");
    }
    iconRef.current?.style.removeProperty("transform");
  }, [contentRef]);

  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let touchId: number | null = null;
    let claimed = false;
    let rawDistance = 0;
    let distance = 0;
    let frame: number | null = null;

    function scheduleWrite() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        write(distance, null);
      });
    }

    function detach() {
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      touchId = null;
      claimed = false;
      distance = 0;
      rawDistance = 0;
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("touchcancel", handleCancel);
    }

    /** Send the indicator home and forget the gesture ever happened. */
    function settle() {
      setPhaseBoth("idle");
      write(0, SETTLE_TRANSITION);
      if (settleTimer.current !== null) {
        globalThis.clearTimeout(settleTimer.current);
      }
      settleTimer.current = globalThis.setTimeout(() => {
        settleTimer.current = null;
        // A new pull may have started inside the settle window; it owns the
        // chip's styles now.
        if (phaseRef.current === "idle") clear();
      }, SETTLE_MS);
    }

    async function runRefresh() {
      const refresh = onRefreshRef.current;
      if (!refresh) {
        settle();
        return;
      }

      setPhaseBoth("refreshing");
      write(PULL_REST, PARK_TRANSITION);
      // The keyframe spinner takes the icon over from here.
      iconRef.current?.style.removeProperty("transform");

      const startedAt = Date.now();
      try {
        await Promise.race([
          refresh(),
          new Promise((resolve) => globalThis.setTimeout(resolve, MAX_SPIN_MS)),
        ]);
      } catch {
        // Whatever failed owns its own error state — the page's query surfaces
        // it. The gesture's only job here is to stop spinning.
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_SPIN_MS) {
        await new Promise((resolve) =>
          globalThis.setTimeout(resolve, MIN_SPIN_MS - elapsed),
        );
      }

      // A second pull during the spin re-entered `runRefresh`; that call owns
      // the indicator now.
      if (phaseRef.current !== "refreshing") return;
      settle();
    }

    function handleStart(event: TouchEvent) {
      if (phaseRef.current === "refreshing") return;
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch) return;
      if (globalThis.scrollY > 0 || scrollIsLocked()) return;
      if (
        touch.target instanceof Element &&
        touch.target.closest(IGNORED_ANCESTORS)
      ) {
        return;
      }

      if (settleTimer.current !== null) {
        globalThis.clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }

      touchId = touch.identifier;
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      claimed = false;
      rawDistance = 0;
      distance = 0;

      // Non-passive: once the pull is claimed the page cannot scroll up anyway,
      // and preventing the default stops the browser starting a text selection
      // or a link drag underneath it.
      document.addEventListener("touchmove", handleMove, { passive: false });
      document.addEventListener("touchend", handleEnd);
      document.addEventListener("touchcancel", handleCancel);
    }

    function endedTouch(event: TouchEvent): boolean {
      if (touchId === null) return false;
      return [...event.changedTouches].some(
        (touch) => touch.identifier === touchId,
      );
    }

    function handleMove(event: TouchEvent) {
      if (touchId === null) return;
      // A second finger landed: hand the gesture back rather than following
      // whichever touch the browser happens to report first.
      if (event.touches.length > 1) {
        handleCancel();
        return;
      }
      const touch = event.touches[0];
      if (!touch || touch.identifier !== touchId) return;

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (!claimed) {
        if (Math.abs(deltaY) < PULL_SLOP && Math.abs(deltaX) < PULL_SLOP)
          return;
        // The first decisive movement decides who owns the gesture. Anything
        // that isn't a downward pull from the top of the page belongs to the
        // page — a scroll, a horizontal swipe, a drag.
        if (!isVerticalPull(deltaX, deltaY) || globalThis.scrollY > 0) {
          handleCancel();
          return;
        }
        claimed = true;
        // Re-origin at the point of claim so the indicator doesn't jump the
        // slop distance on its first frame.
        startY = touch.clientY;
        startTime = Date.now();
        setPhaseBoth("pulling");
        return;
      }

      event.preventDefault();
      rawDistance = touch.clientY - startY;
      distance = dampPull(rawDistance);
      const next = distance >= PULL_THRESHOLD ? "armed" : "pulling";
      if (phaseRef.current !== next) setPhaseBoth(next);
      scheduleWrite();
    }

    function handleEnd(event: TouchEvent) {
      if (!endedTouch(event)) return;
      const wasClaimed = claimed;
      const finalRaw = rawDistance;
      const finalDamped = distance;
      const elapsed = Date.now() - startTime;
      detach();
      if (!wasClaimed) return;

      if (
        shouldCommitPull({
          dampedDistance: finalDamped,
          elapsedMs: elapsed,
          rawDistance: finalRaw,
        })
      ) {
        void runRefresh();
      } else {
        settle();
      }
    }

    function handleCancel() {
      const wasClaimed = claimed;
      detach();
      if (wasClaimed) settle();
    }

    document.addEventListener("touchstart", handleStart, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleStart);
      detach();
    };
  }, [clear, enabled, setPhaseBoth, write]);

  // Turning the gesture off — rotating to a desktop width, or leaving a page
  // that opted in — must not strand a half-pulled indicator on screen.
  useEffect(() => {
    if (enabled) return;
    if (settleTimer.current !== null) {
      globalThis.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    phaseRef.current = "idle";
    setPhase("idle");
    clear();
  }, [clear, enabled]);

  useEffect(
    () => () => {
      if (settleTimer.current !== null) {
        globalThis.clearTimeout(settleTimer.current);
      }
    },
    [],
  );

  return { chipRef, iconRef, phase };
}

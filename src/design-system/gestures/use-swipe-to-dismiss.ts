"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMove } from "react-aria";

import {
  animationDuration,
  animationTimingFunction,
} from "../theme/animations.stylex";

export type SwipeDismissDirection = "down" | "up";

export interface UseSwipeToDismissOptions {
  /** Fires once the surface has been dragged far or fast enough to dismiss. */
  onDismiss: () => void;
  /**
   * The element that follows the drag. Its `transform` is written directly for
   * a jank-free, re-render-free gesture. The hook only ever sets `transform`
   * and `transition` on it, and always clears them back to `""` at rest, so it
   * never leaves a residual style that could shift the element.
   */
  surfaceRef: RefObject<HTMLElement | null>;
  /** Direction the user swipes to dismiss. Defaults to `"down"`. */
  direction?: SwipeDismissDirection;
  /** Turn the gesture off without unmounting (e.g. while an image is zoomed). */
  enabled?: boolean;
  /** Travel in px past which releasing dismisses. Defaults to `120`. */
  distanceThreshold?: number;
  /**
   * Release velocity in px/ms that dismisses even on a short pull — a quick
   * flick shouldn't need to cross the full distance. Defaults to `0.35`.
   */
  velocityThreshold?: number;
  /** Minimum travel before a flick counts, so taps never dismiss. Defaults to `24`. */
  minFlickDistance?: number;
}

type MoveProps = ReturnType<typeof useMove>["moveProps"];

export interface UseSwipeToDismissResult {
  /** Spread onto the element the user drags to dismiss. */
  moveProps: MoveProps;
  /** True while the user is actively dragging along the dismiss axis. */
  isDragging: boolean;
  /**
   * Clears any transform/transition the gesture left on the surface. Safe to
   * call any time (e.g. when the container opens) to guarantee a clean rest
   * state.
   */
  reset: () => void;
}

/**
 * Distance below the axis-lock slop where movement is still ambiguous. Once the
 * pointer travels past this on one axis we commit: a horizontal lock yields to
 * native scrolling (so a carousel still pages), a vertical lock toward the
 * dismiss direction starts the drag.
 */
const AXIS_LOCK_SLOP = 8;

/**
 * The settle animation duration in JS must match the CSS token used below so
 * the `onDismiss` timer fires exactly when the fly-out transition ends.
 */
const SETTLE_MS = 200; // keep in sync with animationDuration.slow ("200ms")
const SETTLE_TRANSITION = `transform ${animationDuration.slow} ${animationTimingFunction.easeOut}`;

function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Headless swipe-to-dismiss built on React Aria's `useMove`, which normalises
 * mouse, touch, and pen input, ignores emulated mouse events on touch devices,
 * and disables text selection mid-drag for us.
 *
 * The hook only tracks pointer gestures along the dismiss axis: horizontal
 * drags are handed back to the browser (pair the draggable element with
 * `touch-action: pan-x` so a horizontal carousel still scrolls natively), and
 * keyboard "moves" from `useMove` are ignored so arrow-key navigation is
 * untouched. It writes nothing to the surface until a vertical drag actually
 * starts, and clears everything on release — so it can never affect the
 * surface's resting layout.
 */
export function useSwipeToDismiss({
  onDismiss,
  surfaceRef,
  direction = "down",
  enabled = true,
  distanceThreshold = 120,
  velocityThreshold = 0.35,
  minFlickDistance = 24,
}: UseSwipeToDismissOptions): UseSwipeToDismissResult {
  const [isDragging, setIsDragging] = useState(false);

  // Multiplier that turns a pull in the dismiss direction into positive travel.
  const dirSign = direction === "down" ? 1 : -1;

  const gesture = useRef({
    tracking: false,
    axis: null as null | "horizontal" | "vertical",
    dx: 0,
    dy: 0,
    offset: 0, // always >= 0: travel toward the dismiss direction
    velocity: 0, // px/ms toward the dismiss direction (smoothed)
    lastTime: 0,
  });
  const settleTimer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(
    null,
  );

  const clearSettleTimer = () => {
    if (settleTimer.current !== null) {
      globalThis.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  };

  const writeSurface = (offset: number, transition: string) => {
    const el = surfaceRef.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.transform =
      offset === 0 ? "" : `translate3d(0, ${String(offset * dirSign)}px, 0)`;
  };

  // Wipe every inline style the gesture may have set, returning the surface to
  // its stylesheet-defined resting position. Stable identity so consumers can
  // safely depend on it in effects.
  const resetSurface = useCallback(() => {
    const el = surfaceRef.current;
    if (!el) return;
    el.style.transform = "";
    el.style.transition = "";
  }, [surfaceRef]);

  const endDrag = (dismiss: boolean) => {
    const reduced = prefersReducedMotion();
    setIsDragging(false);

    if (dismiss) {
      if (reduced) {
        resetSurface();
        onDismiss();
        return;
      }
      // Fling the surface the rest of the way out, then close so the content
      // finishes its exit before the parent unmounts it.
      const viewport = globalThis.innerHeight || 0;
      writeSurface(viewport, SETTLE_TRANSITION);
      settleTimer.current = globalThis.setTimeout(() => {
        settleTimer.current = null;
        onDismiss();
      }, SETTLE_MS);
      return;
    }

    // Snap back to rest.
    gesture.current.offset = 0;
    gesture.current.velocity = 0;
    if (reduced) {
      resetSurface();
      return;
    }
    writeSurface(0, SETTLE_TRANSITION);
    settleTimer.current = globalThis.setTimeout(() => {
      settleTimer.current = null;
      // Drop the inline transition so nothing lingers before the next drag.
      resetSurface();
    }, SETTLE_MS);
  };

  const { moveProps } = useMove({
    onMoveStart(event) {
      if (event.pointerType === "keyboard") return;
      clearSettleTimer();
      const g = gesture.current;
      g.tracking = true;
      g.axis = null;
      g.dx = 0;
      g.dy = 0;
      g.offset = 0;
      g.velocity = 0;
      g.lastTime = globalThis.performance.now();
    },
    onMove(event) {
      const g = gesture.current;
      if (!g.tracking) return;
      g.dx += event.deltaX;
      g.dy += event.deltaY;

      if (g.axis === null) {
        const adx = Math.abs(g.dx);
        const ady = Math.abs(g.dy);
        if (adx > ady && adx > AXIS_LOCK_SLOP) {
          // Horizontal intent — yield to native scrolling / carousel paging.
          g.tracking = false;
          return;
        }
        if (ady > adx && ady > AXIS_LOCK_SLOP) {
          if (g.dy * dirSign <= 0) {
            // Vertical, but away from the dismiss direction — ignore.
            g.tracking = false;
            return;
          }
          g.axis = "vertical";
          g.lastTime = globalThis.performance.now();
          setIsDragging(true);
        } else {
          // Still within the slop — wait for a clear direction.
          return;
        }
      }

      const now = globalThis.performance.now();
      const dt = now - g.lastTime;
      g.lastTime = now;
      // Clamp to >= 0 so the surface can't be dragged past its resting origin.
      g.offset = Math.max(0, g.offset + event.deltaY * dirSign);
      if (dt > 0) {
        const instant = (event.deltaY * dirSign) / dt;
        g.velocity = g.velocity * 0.7 + instant * 0.3;
      }
      writeSurface(g.offset, "none");
    },
    onMoveEnd(event) {
      if (event.pointerType === "keyboard") return;
      const g = gesture.current;
      const wasVertical = g.axis === "vertical";
      g.tracking = false;
      g.axis = null;
      if (!wasVertical) {
        // A tap, or a gesture we yielded — make sure nothing lingers.
        setIsDragging(false);
        resetSurface();
        return;
      }
      const dismiss =
        g.offset >= distanceThreshold ||
        (g.velocity >= velocityThreshold && g.offset >= minFlickDistance);
      endDrag(dismiss);
    },
  });

  useEffect(() => clearSettleTimer, []);

  // Drop useMove's keyboard handler: this hook only reacts to pointer/touch
  // drags, and that handler would otherwise `preventDefault`/`stopPropagation`
  // the arrow keys the lightbox uses for navigation.
  const pointerMoveProps: MoveProps = { ...moveProps };
  delete pointerMoveProps.onKeyDown;

  return {
    moveProps: enabled ? pointerMoveProps : {},
    isDragging,
    reset: resetSurface,
  };
}

"use client";

import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
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
   * The element that follows the drag. Its `transform` (and, when
   * `fadeSurface` is set, `opacity`) is written directly for a jank-free,
   * re-render-free gesture.
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
  /** Fade the surface as it is pulled away, for extra feedback. Defaults to `true`. */
  fadeSurface?: boolean;
  /** Opacity the surface reaches at a full pull when `fadeSurface` is on. Defaults to `0.35`. */
  minOpacity?: number;
}

type MoveProps = ReturnType<typeof useMove>["moveProps"];

export interface UseSwipeToDismissResult {
  /** Spread onto the element the user drags to dismiss. */
  moveProps: MoveProps;
  /** True while the user is actively dragging along the dismiss axis. */
  isDragging: boolean;
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
const SETTLE_TRANSITION =
  `transform ${animationDuration.slow} ${animationTimingFunction.easeOut}, ` +
  `opacity ${animationDuration.slow} ${animationTimingFunction.easeOut}`;

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
 * untouched.
 */
export function useSwipeToDismiss({
  onDismiss,
  surfaceRef,
  direction = "down",
  enabled = true,
  distanceThreshold = 120,
  velocityThreshold = 0.35,
  minFlickDistance = 24,
  fadeSurface = true,
  minOpacity = 0.35,
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
    fadeDistance: 1,
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

  const writeSurface = (
    offset: number,
    opacity: number | null,
    transition: string,
  ) => {
    const el = surfaceRef.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.transform =
      offset === 0 ? "" : `translate3d(0, ${String(offset * dirSign)}px, 0)`;
    if (fadeSurface) {
      el.style.opacity = opacity === null ? "" : String(opacity);
    }
  };

  const surfaceOpacity = (offset: number) => {
    const g = gesture.current;
    const progress = Math.min(offset / g.fadeDistance, 1);
    return 1 - progress * (1 - minOpacity);
  };

  const endDrag = (dismiss: boolean) => {
    const el = surfaceRef.current;
    const reduced = prefersReducedMotion();
    setIsDragging(false);

    if (dismiss) {
      if (reduced) {
        writeSurface(0, null, "none");
        if (el) el.style.willChange = "";
        onDismiss();
        return;
      }
      // Fling the surface the rest of the way out, then close so the content
      // finishes its exit before the parent unmounts it.
      const viewport = globalThis.innerHeight || 0;
      writeSurface(viewport, 0, SETTLE_TRANSITION);
      settleTimer.current = globalThis.setTimeout(() => {
        settleTimer.current = null;
        if (el) el.style.willChange = "";
        onDismiss();
      }, SETTLE_MS);
      return;
    }

    // Snap back to rest.
    gesture.current.offset = 0;
    gesture.current.velocity = 0;
    if (reduced) {
      writeSurface(0, null, "none");
      if (el) el.style.willChange = "";
      return;
    }
    writeSurface(0, 1, SETTLE_TRANSITION);
    settleTimer.current = globalThis.setTimeout(() => {
      settleTimer.current = null;
      // Drop the inline styles so nothing lingers before the next drag.
      writeSurface(0, null, "");
      if (el) el.style.willChange = "";
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
      // Fade across ~60% of the viewport so the surface dims gradually.
      g.fadeDistance = Math.max((globalThis.innerHeight || 0) * 0.6, 1);
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
          const el = surfaceRef.current;
          if (el) el.style.willChange = "transform, opacity";
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
      writeSurface(g.offset, surfaceOpacity(g.offset), "none");
    },
    onMoveEnd(event) {
      if (event.pointerType === "keyboard") return;
      const g = gesture.current;
      const wasVertical = g.axis === "vertical";
      g.tracking = false;
      g.axis = null;
      if (!wasVertical) {
        // A tap, or a gesture we yielded — nothing to settle.
        setIsDragging(false);
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

  return { moveProps: enabled ? pointerMoveProps : {}, isDragging };
}

"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  animationDuration,
  animationTimingFunction,
} from "../theme/animations.stylex";

const SCROLL_THRESHOLD = 16;

/**
 * A floating bar's shadow reaches past its border box, so clearing the viewport
 * by exactly the bar's own offset would leave a smudge along the bottom edge.
 * Push it this much further than the geometry says it needs.
 */
const SHADOW_CLEARANCE = 24;

/**
 * Coalesce scroll callbacks down to one per frame — same shim `useAnimatedNavbar`
 * uses, kept local so the design system doesn't take on a dependency for it.
 */
function rafThrottle(callback: () => void) {
  let frame: number | null = null;

  const throttled = () => {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      callback();
    });
  };

  throttled.cancel = () => {
    if (frame === null) return;
    cancelAnimationFrame(frame);
    frame = null;
  };

  return throttled;
}

function prefersReducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The mirror image of {@link useAnimatedNavbar}: a bar pinned to the *bottom* of
 * the viewport that slides down out of frame as the reader scrolls down and
 * comes back the moment they scroll up, so the page keeps as much reading room
 * as it can while the reader is moving forward.
 *
 * Where the top bar animates `top` (it has to stay flush with sticky chrome that
 * lays out on the main thread), this one is free to animate `transform`: nothing
 * pins itself to a bottom bar, so the composited property is the better pick.
 *
 * Two rules this hook keeps, both learned from iOS Safari deciding how tall the
 * page is based on what the page pins to the viewport:
 *
 * 1. **Never write to the fixed element.** `stackTarget` must be an in-flow
 *    wrapper *inside* the viewport-pinned dock, never the dock itself. Putting a
 *    transform on the pinned element promotes it to a composited layer, and
 *    Safari reads that as a reason to hold its toolbars open and shorten the
 *    dynamic viewport — the page then stops short of the bottom edge.
 * 2. **A resting bar carries no inline styles at all**, not even a
 *    `translateY(0)`. An identity transform still makes a layer and a stacking
 *    context, so it still counts against rule 1; the reveal clears itself once
 *    it lands.
 *
 * Like the top bar's hook, everything it drives is written straight to the DOM.
 * Scroll direction flips constantly and re-rendering the shell on each flip
 * would cost far more than the two style writes the flip actually needs.
 */
export const useAnimatedBottomNav = ({
  enabled = true,
  stackTarget,
  scrollContainer: scrollContainerProp,
}: {
  /**
   * Set `false` to leave the bar parked in place — e.g. at widths where the
   * sidebar replaces it, so the hook doesn't watch scroll for a hidden bar.
   */
  enabled?: boolean;
  /**
   * The in-flow stack the bar is the last child of, inside the dock that pins
   * itself to the viewport — **not** the pinned element itself (see rule 1
   * above). When the bar hides, the stack slides down by the bar's footprint so
   * whatever floats above it (the page-reader transport) drops into the vacated
   * slot instead of hovering over a gap. Both moves are transforms on the same
   * duration and easing, so they stay locked together. Omit it and only the bar
   * itself moves.
   */
  stackTarget?: React.RefObject<HTMLElement | null>;
  /**
   * The element that scrolls. Omit it when the document itself is the scroll
   * container: the hook then listens on the window and measures the viewport.
   */
  scrollContainer?: React.RefObject<HTMLElement | null>;
}) => {
  const navRef = useRef<HTMLElement | null>(null);
  const lastScrollY = useRef(0);

  // State machine in refs, deliberately — see the note above. `hidden` is
  // "scrolled out of frame"; `animated` says whether the next write transitions,
  // which the very first write must not (nothing has moved yet).
  const hidden = useRef(false);
  const animated = useRef(false);
  // How far the bar has to travel to clear the bottom edge, and how much of that
  // travel the stack takes on. Measured only while the bar sits in place — the
  // geometry lies once a transform is on it.
  const distance = useRef(0);
  const collapse = useRef(0);
  // Viewport and document heights, cached rather than read per scroll frame:
  // `innerHeight` and `scrollHeight` both force layout, and forcing it on every
  // frame of a scroll is the one thing a scroll handler must not do.
  const viewportHeight = useRef(0);
  const scrollHeight = useRef(0);
  const enabledRef = useRef(enabled);

  const apply = useCallback(() => {
    const nav = navRef.current;
    const stack = stackTarget?.current;
    if (!nav) return;

    const clear = () => {
      nav.style.removeProperty("transform");
      nav.style.removeProperty("transition");
      stack?.style.removeProperty("transform");
      stack?.style.removeProperty("transition");
    };

    const reducedMotion = prefersReducedMotion();

    if (!enabledRef.current || !hidden.current) {
      // Back at rest with nothing to undo, or with no motion to animate: drop
      // every inline style so the resting DOM is exactly what the markup says.
      if (!enabledRef.current || !animated.current || reducedMotion) {
        animated.current = false;
        clear();
        return;
      }
      // Otherwise animate home and let `transitionend` do the clearing.
      const transition = `transform ${animationDuration.slow} ${animationTimingFunction.easeInOut}`;
      nav.style.transition = transition;
      nav.style.transform = "translateY(0px)";
      if (stack) {
        stack.style.transition = transition;
        stack.style.transform = "translateY(0px)";
      }
      return;
    }

    const transition =
      animated.current && !reducedMotion
        ? `transform ${animationDuration.slow} ${animationTimingFunction.easeInOut}`
        : "none";
    // The stack carries part of the travel, so the bar only owes the remainder —
    // nested transforms compose, and the two together still add up to `distance`.
    nav.style.transition = transition;
    nav.style.transform = `translateY(${distance.current - collapse.current}px)`;
    if (stack) {
      stack.style.transition = transition;
      stack.style.transform = `translateY(${collapse.current}px)`;
    }
  }, [stackTarget]);

  const setHidden = useCallback(
    (next: boolean) => {
      if (hidden.current === next) return;
      hidden.current = next;
      animated.current = true;
      apply();
    },
    [apply],
  );

  /**
   * Callback ref rather than a plain one so the observers follow the bar if the
   * shell swaps the element out from under them.
   */
  const setNavNode = useCallback(
    (node: HTMLElement | null) => {
      navRef.current = node;
      if (!node) return;

      const measure = () => {
        viewportHeight.current = globalThis.innerHeight;
        scrollHeight.current = document.documentElement.scrollHeight;
        // The rest is only truthful while the bar is at rest; hidden geometry is
        // the transformed geometry, and re-deriving from it would compound.
        if (hidden.current) return;
        const rect = node.getBoundingClientRect();
        const stack = stackTarget?.current;
        // The bar is the stack's last child, so its footprint is its own height
        // plus the gap that separates it from whatever sits above it.
        const rowGap = stack
          ? Number.parseFloat(globalThis.getComputedStyle(stack).rowGap)
          : 0;
        collapse.current = stack
          ? rect.height + (Number.isNaN(rowGap) ? 0 : rowGap)
          : 0;
        // Distance to the bottom edge rather than a bare height: the dock floats
        // above the safe-area inset, and that gap has to be travelled too.
        distance.current = globalThis.innerHeight - rect.top + SHADOW_CLEARANCE;
        apply();
      };

      measure();
      // The bar grows with the reader's text-size dial, and a hidden bar sits
      // one footprint below the fold, so neither number can be a constant. The
      // document is watched too, so the cached page height follows content that
      // loads in (embeds, images) without a scroll-time layout read.
      const resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(node);
      resizeObserver.observe(document.documentElement);

      // Clearing on `transitionend` is what keeps rule 2 — the reveal is the
      // only write that leaves an identity transform behind, and it undoes it
      // as soon as it lands.
      const onTransitionEnd = (event: TransitionEvent) => {
        if (event.target !== node || event.propertyName !== "transform") return;
        if (hidden.current) return;
        animated.current = false;
        apply();
      };
      node.addEventListener("transitionend", onTransitionEnd);

      // A hidden bar is off-screen but still in the tab order. Bring it back
      // rather than let keyboard focus wander somewhere the reader can't see.
      const onFocusIn = () => setHidden(false);
      node.addEventListener("focusin", onFocusIn);

      return () => {
        resizeObserver.disconnect();
        node.removeEventListener("transitionend", onTransitionEnd);
        node.removeEventListener("focusin", onFocusIn);
        navRef.current = null;
        // The stack outlives the bar — a selection toolbar takes the slot over,
        // and routes swap the bar out. Hand it back unshifted, or whatever
        // replaces the bar inherits an offset meant for a bar that is gone.
        hidden.current = false;
        animated.current = false;
        const stack = stackTarget?.current;
        stack?.style.removeProperty("transform");
        stack?.style.removeProperty("transition");
      };
    },
    [apply, setHidden, stackTarget],
  );

  // Turning the hook off drops the bar back into place. Clear the state with it,
  // or it comes back hidden on re-enable.
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      hidden.current = false;
      animated.current = false;
    }
    apply();
  }, [apply, enabled]);

  // Hide on scroll down, reveal on scroll up.
  useEffect(() => {
    if (!enabled) return;

    const container = scrollContainerProp?.current ?? null;
    const scrollTarget: EventTarget = container ?? globalThis;
    lastScrollY.current = container ? container.scrollTop : globalThis.scrollY;

    const handleScroll = rafThrottle(() => {
      const currentScrollY = container
        ? container.scrollTop
        : globalThis.scrollY;
      const viewport = container
        ? container.clientHeight
        : viewportHeight.current;
      const pageHeight = container
        ? container.scrollHeight
        : scrollHeight.current;

      // Two places the bar always belongs: the top of the page, where hiding it
      // buys nothing, and the end of the page, where the reader has finished and
      // wants somewhere to go next.
      if (
        currentScrollY <= SCROLL_THRESHOLD ||
        currentScrollY + viewport >= pageHeight - SCROLL_THRESHOLD
      ) {
        setHidden(false);
        lastScrollY.current = currentScrollY;
        return;
      }

      // Below the threshold, leave `lastScrollY` alone so a slow drag keeps
      // accumulating instead of resetting its own baseline every frame.
      const delta = currentScrollY - lastScrollY.current;
      if (Math.abs(delta) < SCROLL_THRESHOLD) return;

      setHidden(delta > 0);
      lastScrollY.current = currentScrollY;
    });

    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      handleScroll.cancel();
      scrollTarget.removeEventListener("scroll", handleScroll);
    };
  }, [enabled, scrollContainerProp, setHidden]);

  return {
    navBarProps: { ref: setNavNode },
  };
};

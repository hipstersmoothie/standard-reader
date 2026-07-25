"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  animationDuration,
  animationTimingFunction,
} from "../theme/animations.stylex";
import { shadow } from "../theme/shadow.stylex";

const SCROLL_THRESHOLD = 16;

/**
 * How far below the viewport top other chrome has to sit to clear the navbar:
 * the bar's height while it's revealed, zero while it's parked or in flow. The
 * hook publishes it on `offsetTarget` so a view that pins its own sticky header
 * can ride the bar's bottom edge — `stickyChrome` in article-view.tsx does, and
 * animates `top` on the same duration and easing this bar does. Both sides have
 * to animate the same property: a composited transform advances a frame ahead
 * of anything the main thread lays out, so a transform here could never stay
 * flush against a sticky offset there.
 */
const NAVBAR_OFFSET_PROPERTY = "--app-navbar-offset";

/**
 * Coalesce scroll callbacks down to one per frame. hip-ui reaches for
 * `raf-throttle` here; this copy inlines the handful of lines it uses so the
 * design system doesn't pull in a dependency for them.
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
 * A hook that animates the navbar into view and stick to the top when the user
 * scrolls down.
 *
 * Everything it drives — the bar's own styles and the offset it publishes — is
 * written straight to the DOM rather than held in React state. Scroll direction
 * flips constantly, and re-rendering the tree the navbar lives in on each one
 * costs far more than the two style writes the flip actually needs.
 */
export const useAnimatedNavbar = ({
  enabled = true,
  offsetTarget,
  scrollContainer: scrollContainerProp,
}: {
  /**
   * Set `false` to leave the navbar in normal flow — e.g. at widths where it is
   * hidden altogether, so the hook doesn't watch scroll for an invisible bar.
   */
  enabled?: boolean;
  /**
   * Element to publish {@link NAVBAR_OFFSET_PROPERTY} on. Any sticky chrome
   * inside it can then pin itself to the bar's bottom edge.
   */
  offsetTarget?: React.RefObject<HTMLElement | null>;
  /**
   * The element that scrolls. Omit it when the document itself is the scroll
   * container: the hook then listens on the window and measures against the
   * viewport.
   */
  scrollContainer?: React.RefObject<HTMLElement | null>;
}) => {
  const navRef = useRef<HTMLElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  // The whole state machine, deliberately in refs. `parked` is "scrolled out of
  // view, so the bar is now sticky"; `revealed` is "and currently showing";
  // `animated` says whether the next write should transition — parking as the
  // bar first leaves the viewport has to be instant, since it is already gone.
  const parked = useRef(false);
  const revealed = useRef(false);
  const animated = useRef(false);
  const height = useRef(0);
  const enabledRef = useRef(enabled);

  const apply = useCallback(() => {
    const nav = navRef.current;
    const offsetHost = offsetTarget?.current;
    if (!nav) return;

    if (!enabledRef.current || !parked.current) {
      nav.style.removeProperty("position");
      nav.style.removeProperty("top");
      nav.style.removeProperty("box-shadow");
      nav.style.removeProperty("transition");
      offsetHost?.style.setProperty(NAVBAR_OFFSET_PROPERTY, "0px");
      return;
    }

    nav.style.position = "sticky";
    nav.style.transition =
      animated.current && !prefersReducedMotion()
        ? `top ${animationDuration.slow} ${animationTimingFunction.easeInOut}`
        : "none";
    nav.style.top = revealed.current ? "0px" : `-${height.current}px`;
    nav.style.boxShadow = revealed.current ? shadow.lg : "";
    offsetHost?.style.setProperty(
      NAVBAR_OFFSET_PROPERTY,
      revealed.current ? `${height.current}px` : "0px",
    );
  }, [offsetTarget]);

  /**
   * Callback ref rather than a plain one: the bar swaps elements as the route
   * changes (a brand bar, a back-and-title bar), and the observers have to
   * follow it across the swap.
   */
  const setNavNode = useCallback(
    (node: HTMLElement | null) => {
      navRef.current = node;
      if (!node) return;

      const measure = () => {
        height.current = node.getBoundingClientRect().height;
        apply();
      };

      measure();
      // The bar grows with the reader's text-size dial, and the parked position
      // is one bar-height above the viewport, so the height can't be a constant.
      const resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(node);

      const viewportObserver = new IntersectionObserver(([entry]) => {
        // A disabled bar is usually a hidden one, which never intersects — take
        // it at its word and it would come back parked out of view on re-enable.
        if (!enabledRef.current) return;
        if (!entry || entry.isIntersecting || parked.current) return;
        parked.current = true;
        animated.current = false;
        apply();
      });
      viewportObserver.observe(node);

      return () => {
        resizeObserver.disconnect();
        viewportObserver.disconnect();
        navRef.current = null;
      };
    },
    [apply],
  );

  // Turning the hook off drops the bar back into normal flow. Clear the state
  // with it, or a stale "parked above the viewport" pass comes back on re-enable.
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      parked.current = false;
      revealed.current = false;
      animated.current = false;
    }
    apply();
  }, [apply, enabled]);

  // Reveal on scroll up, hide on scroll down.
  useEffect(() => {
    if (!enabled) return;

    const container = scrollContainerProp?.current ?? null;
    const scrollTarget: EventTarget = container ?? globalThis;
    lastScrollY.current = container ? container.scrollTop : globalThis.scrollY;

    const handleScroll = rafThrottle(() => {
      const currentScrollY = container
        ? container.scrollTop
        : globalThis.scrollY;
      const scrollDirection =
        currentScrollY > lastScrollY.current ? "down" : "up";

      // Track the offset even while the bar is still in flow, so the first flip
      // after it parks compares against where the page actually was.
      if (!parked.current) {
        lastScrollY.current = currentScrollY;
        return;
      }

      if (scrollDirection === "up") {
        // Only hide/show if scrolled past threshold
        if (Math.abs(currentScrollY - lastScrollY.current) < SCROLL_THRESHOLD) {
          return;
        }

        // Show navbar when scrolling up or at the top
        if (
          currentScrollY < lastScrollY.current ||
          currentScrollY <= SCROLL_THRESHOLD
        ) {
          revealed.current = true;
          animated.current = true;
          apply();
        }
      }
      // Animate navbar out when scrolling down past threshold
      else if (
        currentScrollY > lastScrollY.current &&
        currentScrollY > SCROLL_THRESHOLD
      ) {
        revealed.current = false;
        animated.current = true;
        apply();
      }

      lastScrollY.current = currentScrollY;
    });

    scrollTarget.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      handleScroll.cancel();
      scrollTarget.removeEventListener("scroll", handleScroll);
    };
  }, [apply, enabled, scrollContainerProp]);

  // Use IntersectionObserver to detect if scrolled to top (most performant)
  useEffect(() => {
    if (!enabled || !topSentinelRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Back at the top the bar's flow position is its stuck position, so it
        // can rejoin the flow without moving — and without a transition.
        if (!entry?.isIntersecting || !parked.current) return;
        parked.current = false;
        revealed.current = false;
        animated.current = false;
        apply();
      },
      // A `null` root means the viewport — the right frame of reference when the
      // document, rather than an element, is the scroll container.
      { root: scrollContainerProp?.current ?? null },
    );

    observer.observe(topSentinelRef.current);

    return () => {
      observer.disconnect();
    };
  }, [apply, enabled, scrollContainerProp]);

  return {
    sentinel: <div ref={topSentinelRef} />,
    navBarProps: { ref: setNavNode },
  };
};

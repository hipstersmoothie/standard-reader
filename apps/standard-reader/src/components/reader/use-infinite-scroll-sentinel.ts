"use client";

import { useEffect, useRef } from "react";

/** Observe a sentinel against the viewport and call `loadMore` when near view. */
export function useInfiniteScrollSentinel(
  loadMore: () => void,
  enabled: boolean,
  itemCount: number,
) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;

    const sentinel = ref.current;
    if (!sentinel) return;

    // The page scrolls at the document level, so observe against the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore();
        }
      },
      { root: null, rootMargin: "1200px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, loadMore, itemCount]);

  return ref;
}

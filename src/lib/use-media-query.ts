"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * SSR-safe `matchMedia` subscription. Returns `false` on the server and during
 * hydration, so callers must treat "no match" as the safe default.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (globalThis.matchMedia === undefined) return () => {};
      const list = globalThis.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (globalThis.matchMedia === undefined) return false;
    return globalThis.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * True at the widths where the shell shows the floating bottom nav instead of
 * the sidebar. Mirrors the `DESKTOP` breakpoint in `app-shell.tsx`.
 */
export function useCompactNav(): boolean {
  return useMediaQuery("(max-width: 59.999rem)");
}

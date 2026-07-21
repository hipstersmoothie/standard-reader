"use client";

import { useEffect, useState } from "react";

/** Shows `true` only after `active` stays true for `delayMs`. Clears immediately when inactive. */
export function useDelayedLoading(active: boolean, delayMs: number): boolean {
  const [delayedActive, setDelayedActive] = useState(false);

  useEffect(() => {
    if (!active) return;

    const timer = globalThis.setTimeout(() => {
      setDelayedActive(true);
    }, delayMs);

    return () => {
      globalThis.clearTimeout(timer);
      setDelayedActive(false);
    };
  }, [active, delayMs]);

  return active && delayedActive;
}

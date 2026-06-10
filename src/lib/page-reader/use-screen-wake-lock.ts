"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps the screen awake while `enabled` via the Screen Wake Lock API.
 * Browsers release the lock when the tab is hidden; this hook re-acquires when
 * the tab becomes visible again.
 */
export function useScreenWakeLock(enabled: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!("wakeLock" in navigator)) return;

    const release = async () => {
      const sentinel = sentinelRef.current;
      if (!sentinel) return;
      sentinelRef.current = null;
      try {
        await sentinel.release();
      } catch {
        // Already released.
      }
    };

    const acquire = async () => {
      if (!enabledRef.current || sentinelRef.current) return;
      if (document.visibilityState !== "visible") return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (!enabledRef.current) {
          await sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
          }
        });
      } catch {
        // Permission denied, unsupported context, low battery, etc.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      }
    };

    if (enabled) {
      void acquire();
    } else {
      void release();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void release();
    };
  }, [enabled]);
}

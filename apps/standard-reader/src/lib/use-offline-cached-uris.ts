"use client";

import { useEffect, useState } from "react";

import { offlineCachedUris } from "#/pwa/offline-cache";

const NONE: ReadonlySet<string> = new Set();

/**
 * The documents stored for offline reading, for dimming the ones that aren't.
 *
 * Returns an empty set while online — nothing should be dimmed then, and it
 * keeps the ledger off the render path entirely in the common case. Also empty
 * during SSR, since the answer is per-device and reading it while rendering on
 * the server would be a hydration mismatch.
 */
export function useOfflineCachedUris(online: boolean): ReadonlySet<string> {
  const [uris, setUris] = useState<ReadonlySet<string>>(NONE);

  useEffect(() => {
    if (online) {
      setUris(NONE);
      return;
    }
    setUris(offlineCachedUris());
  }, [online]);

  return uris;
}

"use client";

import { useEffect, useState } from "react";

import { offlineAvailableUris } from "#/pwa/offline-cache";

/**
 * `null` means "we don't know yet", which is not the same as "nothing is
 * stored" and must not be rendered as though it were.
 */
export type OfflineAvailability = ReadonlySet<string> | null;

/**
 * The documents that can be opened offline, for dimming the ones that can't.
 *
 * Returns `null` while online (nothing should be dimmed then, and this keeps
 * the cache scan off the render path), during SSR, and until the scan resolves.
 * Callers must treat `null` as "don't dim" — a set that is merely late, or a
 * browser with no Cache Storage, would otherwise dim every row in the feed.
 *
 * The scan is shared and memoised in `offlineAvailableUris`, so fifty rows
 * calling this hook cost one pass over the cache, not fifty.
 */
export function useOfflineCachedUris(online: boolean): OfflineAvailability {
  const [uris, setUris] = useState<OfflineAvailability>(null);

  useEffect(() => {
    if (online) {
      setUris(null);
      return;
    }
    let cancelled = false;
    void offlineAvailableUris().then((next) => {
      if (!cancelled) setUris(next);
    });
    return () => {
      cancelled = true;
    };
  }, [online]);

  return uris;
}

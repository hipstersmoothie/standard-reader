"use client";

import { useEffect, useState } from "react";

/**
 * Whether the browser currently reports a connection.
 *
 * Starts `true` and corrects after mount on purpose: `navigator` does not exist
 * during SSR, and rendering an "offline" state into server markup that the
 * client then has to undo is a hydration mismatch on every request.
 *
 * `navigator.onLine` only knows whether there is *a* network interface, not
 * whether anything is reachable — so treat `false` as reliable ("definitely
 * offline") and `true` as optimistic. Everything here keys off the reliable
 * direction: hiding what cannot work, and explaining a failure after it happens.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(globalThis.navigator?.onLine !== false);
    sync();
    globalThis.addEventListener?.("online", sync);
    globalThis.addEventListener?.("offline", sync);
    return () => {
      globalThis.removeEventListener?.("online", sync);
      globalThis.removeEventListener?.("offline", sync);
    };
  }, []);

  return online;
}

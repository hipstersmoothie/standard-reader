"use client";

import { useEffect, useState } from "react";

import { isStandalone } from "#/pwa/standalone";

/** `/settings?debug` — the flag that shows the panel in a browser tab. */
function debugRequested(): boolean {
  if (globalThis.location === undefined) return false;
  return new URLSearchParams(globalThis.location.search).has("debug");
}

/**
 * Whether to offer the offline-sync troubleshooting disclosure in settings.
 *
 * Always in the installed app — that is the only place sync runs, and a PWA
 * launched from an icon has no address bar to type a flag into. In a browser
 * tab it stays behind `?debug`, where it exists for development.
 *
 * Lives apart from the panel so the settings view can own the `Separator` +
 * `Disclosure` chrome, exactly as it does for push diagnostics; a component
 * that wrapped its own would drift from the section above it.
 */
export function useOfflineSyncDebugVisible(): boolean {
  const [visible, setVisible] = useState(false);

  // Client-only: display mode and the URL's search string are both things the
  // server render must not depend on (and the settings route doesn't validate
  // the flag).
  useEffect(() => {
    setVisible(isStandalone() || debugRequested());
  }, []);

  return visible;
}

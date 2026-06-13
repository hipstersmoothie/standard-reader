import { useEffect, useState } from "react";

import type { ReaderSnapshot } from "./reader-messaging";

import { sendMessage } from "./messaging";
import { isReaderStateBroadcast } from "./reader-messaging";

/**
 * Popup state for the offscreen read-aloud session. Pulls the current snapshot
 * on mount (playback may already be running from a previous popup) and follows
 * the offscreen document's state broadcasts from then on.
 */
export function useReaderSnapshot() {
  // null = unknown (assume supported until the background says otherwise, so
  // the Listen button doesn't flash in and out on open).
  const [supported, setSupported] = useState<boolean | null>(null);
  const [snapshot, setSnapshot] = useState<ReaderSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;

    void sendMessage({ type: "readerGetState" })
      .then((result) => {
        if (cancelled) return;
        setSupported(result.supported);
        setSnapshot(result.snapshot);
      })
      .catch(() => {
        if (!cancelled) setSupported(false);
      });

    const onMessage = (message: unknown) => {
      if (isReaderStateBroadcast(message)) setSnapshot(message.snapshot);
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => {
      cancelled = true;
      browser.runtime.onMessage.removeListener(onMessage);
    };
  }, []);

  return { supported, snapshot, setSnapshot };
}

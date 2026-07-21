import { useCallback, useEffect, useState } from "react";

/**
 * A boolean UI preference persisted to `localStorage` so it survives navigation
 * and reloads. Used for filters like "hide read articles" that should stick when
 * the reader opens an article and comes back to the list.
 *
 * The value starts at `defaultValue` on the first render (so server and client
 * markup match) and is reconciled with the stored value right after mount. It
 * also syncs across tabs via the `storage` event.
 */
export function usePersistentToggle(
  key: string,
  defaultValue = false,
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState(defaultValue);

  // Hydrate from storage after mount to avoid an SSR/CSR markup mismatch.
  useEffect(() => {
    const stored = readStored(key);
    if (stored !== null) {
      setValue(stored);
    }
  }, [key]);

  // Keep tabs in sync when the same preference changes elsewhere.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      const stored = readStored(key);
      setValue(stored ?? defaultValue);
    };
    globalThis.addEventListener?.("storage", onStorage);
    return () => globalThis.removeEventListener?.("storage", onStorage);
  }, [key, defaultValue]);

  const set = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        writeStored(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}

function readStored(key: string): boolean | null {
  if (globalThis.localStorage === undefined) return null;
  try {
    const raw = globalThis.localStorage.getItem(key);
    if (raw === null) return null;
    return raw === "1";
  } catch {
    return null;
  }
}

function writeStored(key: string, value: boolean): void {
  try {
    globalThis.localStorage?.setItem(key, value ? "1" : "0");
  } catch {
    // Private browsing or disabled storage — the toggle still works for the
    // current session, it just won't persist.
  }
}

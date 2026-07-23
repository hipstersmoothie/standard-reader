import { registerSW } from "virtual:pwa-register";

/**
 * Client-only service-worker registration.
 *
 * This is a TanStack Start + Nitro SSR app with `injectRegister: false`, so the
 * plugin does not auto-register the SW — we do it here and drive the update UI
 * from `<ReloadPrompt />`. `registerType: "prompt"` means a waiting SW does not
 * activate until the user opts in via `update()`.
 */

export interface RegisterCallbacks {
  /** A new SW is waiting; show the "reload to update" prompt. */
  onNeedRefresh?: () => void;
  /** The app is fully cached and ready to work offline. */
  onOfflineReady?: () => void;
}

/** Trigger provided by `registerSW`; activates the waiting SW and reloads. */
export type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

/**
 * Registers the service worker. No-op on the server (and returns a stub updater)
 * so it's safe to call from a component that renders during SSR.
 */
export function registerServiceWorker(
  callbacks: RegisterCallbacks = {},
): UpdateServiceWorker {
  if (globalThis.window === undefined) {
    return async () => {};
  }

  return registerSW({
    immediate: true,
    onNeedRefresh: callbacks.onNeedRefresh,
    onOfflineReady: callbacks.onOfflineReady,
  });
}

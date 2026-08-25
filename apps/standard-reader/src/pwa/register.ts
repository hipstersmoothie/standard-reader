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

/** What the last registration attempt did, for the settings diagnostics. */
export interface ServiceWorkerRegistrationReport {
  /** `null` until the first attempt settles. */
  outcome: "registered" | "failed" | null;
  /** Message from `onRegisterError`. */
  error: string | null;
  /** Script URL the plugin registered, when it succeeded. */
  scriptUrl: string | null;
}

/**
 * Registration outcome, kept at module scope because it is the only record of
 * a failure that is otherwise thrown away.
 *
 * vite-plugin-pwa's generated code ends in `.catch(e => onRegisterError?.(e))`,
 * so a service worker that fails to install produces **no signal at all** unless
 * that callback is supplied. That silence is what made a broken worker on an
 * installed iOS PWA look like nothing more than a push timeout — the worker had
 * already failed by then, and nothing said so.
 */
const report: ServiceWorkerRegistrationReport = {
  error: null,
  outcome: null,
  scriptUrl: null,
};

/** Snapshot of the last registration attempt (see {@link report}). */
export function serviceWorkerReport(): ServiceWorkerRegistrationReport {
  return { ...report };
}

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
    onRegisterError: (error: unknown) => {
      report.outcome = "failed";
      report.error = error instanceof Error ? error.message : String(error);
      // Loud on purpose: a failed install takes every caching route down with
      // it, not just push.
      console.error("[pwa] service worker registration failed", error);
    },
    onRegisteredSW: (scriptUrl: string) => {
      report.outcome = "registered";
      report.error = null;
      report.scriptUrl = scriptUrl;
    },
  });
}

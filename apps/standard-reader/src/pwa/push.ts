import { pushApi } from "#/integrations/tanstack-query/api-push.functions";

import { serviceWorkerReport } from "./register";

/**
 * Client-side web push: capability detection, subscribing this browser, and
 * keeping the stored endpoint in step with the one the browser actually has.
 *
 * Everything here is a no-op on the server, so it's safe to import from a
 * component that renders during SSR — but the functions must only be *called*
 * from an event handler or an effect.
 */

/**
 * Why the bell can or can't work in this browser.
 *
 * `needs-ios-install` is the interesting one. iOS only exposes push to a PWA
 * installed on the Home Screen — in a Safari tab `PushManager` simply doesn't
 * exist. That's indistinguishable from an unsupported browser by feature
 * detection alone, but it's the one case the reader can actually fix, so it gets
 * its own state and its own prompt.
 */
export type PushCapability = "ready" | "needs-ios-install" | "unsupported";

/**
 * Outcome of trying to subscribe this browser.
 *
 * `not-configured` is deliberately distinct from `unsupported`: one is the
 * server missing a VAPID key, the other is the browser lacking the API, and
 * collapsing them into one "something went wrong" makes a deployment mistake
 * look identical to an old browser.
 */
export type EnsurePushResult =
  | { status: "ready"; endpoint: string }
  | { status: "denied" }
  | { status: "needs-ios-install" }
  | { status: "not-configured" }
  /** A browser API never settled — see {@link activeRegistration}. */
  | { status: "timed-out" }
  | { status: "unsupported" }
  | { status: "error"; error: unknown };

function isBrowser(): boolean {
  return globalThis.window !== undefined;
}

/** True when the page is running as an installed PWA rather than in a tab. */
export function isStandalone(): boolean {
  if (!isBrowser()) return false;
  if (globalThis.matchMedia?.("(display-mode: standalone)").matches) {
    return true;
  }
  // iOS predates `display-mode` and still reports via this non-standard flag.
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (!isBrowser()) return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports a desktop UA, so the touch-point check is what catches it.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function pushCapability(): PushCapability {
  if (!isBrowser()) return "unsupported";

  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in globalThis &&
    "Notification" in globalThis;

  if (supported) return "ready";
  // On iOS the same feature detection fails for a fixable reason.
  return isIos() && !isStandalone() ? "needs-ios-install" : "unsupported";
}

/** Whether the reader has already blocked notifications at the browser level. */
export function notificationsBlocked(): boolean {
  if (!isBrowser() || !("Notification" in globalThis)) return false;
  return Notification.permission === "denied";
}

/**
 * base64url → the byte array `applicationServerKey` wants. Safari has
 * historically rejected the raw string form, so always pass bytes.
 *
 * The return type is spelled `Uint8Array<ArrayBuffer>` rather than plain
 * `Uint8Array`: since TS 5.7 the latter widens to `Uint8Array<ArrayBufferLike>`,
 * which isn't assignable to `BufferSource`.
 */
function decodeVapidKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding)
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const raw = globalThis.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.codePointAt(i) ?? 0;
  }
  return output;
}

function readKeys(
  subscription: PushSubscription,
): { p256dh: string; auth: string } | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) return null;
  return { p256dh, auth };
}

/** The push subscription this browser currently holds, if any. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (pushCapability() !== "ready") return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * A cold install on a phone has to fetch the worker, its Workbox runtime chunk,
 * and `push-sw.js` before it can activate. 10s was too tight for that over
 * cellular; this is generous because the alternative is telling someone their
 * browser failed when it was only slow.
 */
const ACTIVATION_TIMEOUT_MS = 45_000;
const SUBSCRIBE_TIMEOUT_MS = 20_000;

/** Resolve to `null` rather than hanging forever. */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** Where a registration is in its lifecycle, for diagnostics and for waiting. */
export type ServiceWorkerState =
  | "none"
  | "installing"
  | "waiting"
  | "active"
  | "unsupported";

export function registrationState(
  registration: ServiceWorkerRegistration | null | undefined,
): ServiceWorkerState {
  if (!registration) return "none";
  if (registration.active) return "active";
  if (registration.waiting) return "waiting";
  if (registration.installing) return "installing";
  return "none";
}

/** Resolve once this registration has an active worker, or `null` on timeout. */
async function whenActive(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorkerRegistration | null> {
  if (registration.active) return registration;

  const worker = registration.installing ?? registration.waiting;
  if (!worker) return null;

  // Watch the worker's own state machine rather than racing a blind timer, so
  // this resolves the instant it activates instead of on a fixed delay — and so
  // a worker that dies during install (`redundant`) reports immediately instead
  // of burning the full timeout.
  const settled = await withTimeout(
    new Promise<"activated" | "redundant">((resolve) => {
      const onChange = () => {
        if (worker.state === "activated") {
          worker.removeEventListener("statechange", onChange);
          resolve("activated");
        } else if (worker.state === "redundant") {
          worker.removeEventListener("statechange", onChange);
          resolve("redundant");
        }
      };
      worker.addEventListener("statechange", onChange);
      onChange();
    }),
    ACTIVATION_TIMEOUT_MS,
  );

  if (settled === "redundant") {
    console.error(
      "[push] the service worker became redundant during install — it failed to install",
    );
    return null;
  }
  return settled === "activated" ? registration : null;
}

/**
 * The active service worker registration, or `null` if none activates in time.
 *
 * Two things this must not do, both learned the hard way:
 *
 *   1. **Never await `navigator.serviceWorker.ready` unbounded.** It never
 *      settles when no worker becomes active — a failed install, a browser
 *      blocking service workers, a scope mismatch. That left the bell stuck
 *      disabled with no error, because neither the `catch` nor the `finally`
 *      that re-enables it ever ran.
 *   2. **Never assume something else already registered.** This used to depend
 *      on `<ReloadPrompt />`'s effect having run and succeeded first. If that
 *      registration failed — silently, until `onRegisterError` was wired up —
 *      there was no worker to wait for and no way to find out. Registering here
 *      when none exists removes the ordering dependency entirely.
 */
async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing?.active) return existing;
  if (existing) return whenActive(existing);

  // Nothing registered yet. Do it here rather than waiting on a worker that may
  // never have been requested.
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    return await whenActive(registration);
  } catch (error) {
    console.error("[push] service worker registration failed", error);
    return null;
  }
}

/**
 * Subscribe this browser and record the endpoint server-side. Requests
 * permission if it hasn't been decided yet, so this MUST be called from a user
 * gesture — Safari requires it, and a `denied` in Chrome blocks the site for
 * months, which is why nothing calls this on page load.
 */
export async function ensurePushDevice(): Promise<EnsurePushResult> {
  const capability = pushCapability();
  if (capability !== "ready") return { status: capability };

  try {
    if (Notification.permission === "denied") {
      return { status: "denied" };
    }
    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return { status: "denied" };
    }

    const { publicKey } = await pushApi.getPushConfig();
    if (!publicKey) {
      console.error(
        "[push] the server returned no VAPID public key — VAPID_PUBLIC_KEY is not set on the web service",
      );
      return { status: "not-configured" };
    }

    const registration = await activeRegistration();
    if (!registration) {
      console.error(
        "[push] no service worker ever became active — check the SW registered and installed cleanly",
      );
      return { status: "timed-out" };
    }

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(publicKey),
        }),
        SUBSCRIBE_TIMEOUT_MS,
      ));
    if (!subscription) {
      console.error("[push] pushManager.subscribe() never settled");
      return { status: "timed-out" };
    }

    const keys = readKeys(subscription);
    if (!keys)
      return { status: "error", error: new Error("no subscription keys") };

    await pushApi.registerPushDevice({
      data: {
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: navigator.userAgent.slice(0, 512),
      },
    });

    return { status: "ready", endpoint: subscription.endpoint };
  } catch (error) {
    // The UI can only show generic copy here, so make sure the real cause is
    // reachable from devtools rather than swallowed.
    console.error("[push] could not subscribe this browser", error);
    return { status: "error", error };
  }
}

/** Drop this browser's subscription, locally and server-side. */
export async function removePushDevice(): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  try {
    await subscription.unsubscribe();
  } finally {
    await pushApi.unregisterPushDevice({ data: { endpoint } });
  }
}

/**
 * Everything needed to tell why the bell isn't working, in one object.
 *
 * This exists because the failure surfaced on an installed iPhone PWA, where
 * "open devtools and read the console" is not a usable loop. Rendering this in
 * settings turns a diagnosis round-trip into a screenshot.
 */
export interface PushDiagnostics {
  capability: PushCapability;
  standalone: boolean;
  permission: NotificationPermission | "unavailable";
  serviceWorker: ServiceWorkerState;
  /** Script URL of the registered worker, when there is one. */
  serviceWorkerScript: string | null;
  subscribed: boolean;
  /** Message from the last failed registration, if any. */
  lastError: string | null;
}

export async function pushDiagnostics(): Promise<PushDiagnostics> {
  const capability = pushCapability();
  const swReport = serviceWorkerReport();

  const base: PushDiagnostics = {
    capability,
    lastError: swReport.error,
    permission:
      isBrowser() && "Notification" in globalThis
        ? Notification.permission
        : "unavailable",
    serviceWorker: "unsupported",
    serviceWorkerScript: swReport.scriptUrl,
    standalone: isStandalone(),
    subscribed: false,
  };

  if (!isBrowser() || !("serviceWorker" in navigator)) return base;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return {
      ...base,
      serviceWorker: registrationState(registration),
      subscribed: subscription != null,
    };
  } catch (error) {
    return {
      ...base,
      lastError:
        base.lastError ??
        (error instanceof Error ? error.message : String(error)),
      serviceWorker: "none",
    };
  }
}

/**
 * Re-register the current endpoint if the browser rotated it.
 *
 * Chrome announces rotation via `pushsubscriptionchange`, which `push-sw.js`
 * handles. Safari never fires that event, so without this the subscription
 * silently stops receiving anything. Cheap enough to run on load: it only writes
 * when there's an active subscription to write.
 */
export async function syncPushDevice(): Promise<void> {
  try {
    const subscription = await currentPushSubscription();
    if (!subscription) return;
    const keys = readKeys(subscription);
    if (!keys) return;

    await pushApi.registerPushDevice({
      data: {
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: navigator.userAgent.slice(0, 512),
      },
    });
  } catch {
    // Best effort — a failed refresh just means the next load tries again.
  }
}

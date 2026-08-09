import { pushApi } from "#/integrations/tanstack-query/api-push.functions";

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

const READY_TIMEOUT_MS = 10_000;
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

/**
 * The active service worker registration, or `null` if none activates in time.
 *
 * `navigator.serviceWorker.ready` **never settles** when no worker ever becomes
 * active — a failed install, a browser blocking service workers, a scope
 * mismatch. Awaiting it unbounded is what left the bell stuck in a disabled
 * state with no error: the promise simply never resolved, so neither the
 * `catch` nor the `finally` that re-enables the button ever ran. A hung browser
 * API has to be treated as a failure mode, not an impossibility.
 *
 * Checks for an already-active registration first, since the common case
 * doesn't need to wait at all.
 */
async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing?.active) return existing;
  // Otherwise wait for one to activate — a first visit installs before it
  // activates — but bounded.
  return withTimeout(navigator.serviceWorker.ready, READY_TIMEOUT_MS);
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

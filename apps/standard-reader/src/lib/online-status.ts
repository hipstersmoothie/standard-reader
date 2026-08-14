/**
 * Whether the app can reach the network — the one place that decides it.
 *
 * `navigator.onLine` is the obvious answer and it is not trustworthy in the
 * direction the app relies on. It reports whether the browser believes a
 * network interface exists, and some browsers get that permanently wrong:
 * Chromium's Android WebView returns `false` for the lifetime of the page
 * unless the embedding app holds `ACCESS_NETWORK_STATE`, and lightweight
 * WebView browsers (Via, and others like it) do not ask for it. On those the
 * flag never flips and no `online` event ever fires, so a reader with a working
 * connection got the whole offline treatment — the wordmark reading "Offline
 * Reader", Discover/Search/Collections pulled out of the nav, `/latest`
 * redirected off its network-wide filters, pull-to-refresh disabled, and
 * offline sync refusing to run — while articles loaded around them.
 *
 * So the flag is a hint, never the verdict:
 *
 * - `navigator.onLine !== false` is believed immediately. A browser claiming a
 *   connection is either right or about to fail a request, and there is nothing
 *   cheaper to consult.
 * - `navigator.onLine === false` is *checked* — one small same-origin request.
 *   A network-level failure is the only thing that proves offline; any HTTP
 *   response at all (even a 500) proves the opposite.
 *
 * The verdict starts optimistic and is corrected asynchronously, which is also
 * what keeps SSR honest: `navigator` does not exist on the server, and
 * rendering an offline shell the client immediately undoes is a hydration
 * mismatch on every request.
 */

/**
 * Probed URL: the smallest same-origin file that is *not* precached and matches
 * no runtime-caching route in `vite.config.ts` — a `fetch()` has
 * `request.destination === ""` and `mode !== "navigate"`, so the service worker
 * passes it straight through to the network. That matters: a cached answer
 * would report "online" to a device sitting in a tunnel.
 */
const PROBE_PATH = "/robots.txt";

/**
 * Long enough for a slow mobile connection to answer, short enough that the
 * offline UI is not held back by a stalled request. A genuinely disconnected
 * device rejects in milliseconds; this bounds the case where packets leave and
 * nothing comes back.
 */
const PROBE_TIMEOUT_MS = 5000;

/**
 * How often to re-probe while offline. The `online` event is the normal way
 * back, but it is exactly what cannot be relied on here — a browser that lies
 * about `navigator.onLine` does not fire the events either.
 */
const RECHECK_INTERVAL_MS = 20_000;

type Listener = (online: boolean) => void;

/** Optimistic until a probe proves otherwise — see the module comment. */
let offline = false;
let probing: Promise<boolean> | null = null;
let recheckTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
const listeners = new Set<Listener>();

/** True only when a real request has failed at the network level. */
export function isOffline(): boolean {
  ensureStarted();
  return offline;
}

export function isOnline(): boolean {
  return !isOffline();
}

/** Subscribe to verdict changes. Returns the unsubscribe function. */
export function subscribeToOnlineStatus(listener: Listener): () => void {
  ensureStarted();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Ask again, now.
 *
 * Called when something else has evidence worth acting on — a request that just
 * failed, an app coming back to the foreground. Cheap by construction: it
 * short-circuits without touching the network whenever the browser claims a
 * connection, and only one probe is ever in flight.
 */
export function recheckOnlineStatus(): void {
  ensureStarted();
  evaluate();
}

function ensureStarted(): void {
  if (started || globalThis.window === undefined) return;
  started = true;

  // The events are still worth listening to — they are the fast path on every
  // browser that implements them correctly.
  globalThis.addEventListener?.("online", evaluate);
  globalThis.addEventListener?.("offline", evaluate);
  // Timers are throttled or suspended while the app is backgrounded, so coming
  // back to the foreground is the moment a stale offline verdict is most likely
  // and least excusable.
  globalThis.document?.addEventListener("visibilitychange", () => {
    if (globalThis.document?.visibilityState === "visible") evaluate();
  });

  evaluate();
}

function evaluate(): void {
  if (globalThis.window === undefined) return;
  if (globalThis.navigator?.onLine !== false) {
    setOffline(false);
    return;
  }
  void runProbe().then((reachable) => {
    setOffline(!reachable);
  });
}

function runProbe(): Promise<boolean> {
  // One in flight at a time: the interval, the events and every caller of
  // `recheckOnlineStatus` can all land in the same beat.
  probing ??= probe().finally(() => {
    probing = null;
  });
  return probing;
}

async function probe(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => {
    controller.abort();
  }, PROBE_TIMEOUT_MS);
  try {
    // Any answer proves reachability, so the status is deliberately ignored —
    // a 404 or a 500 still had to travel. `no-store` keeps the HTTP cache from
    // answering for the network.
    await fetch(`${PROBE_PATH}?online-probe=${Date.now()}`, {
      cache: "no-store",
      credentials: "omit",
      method: "GET",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function setOffline(next: boolean): void {
  if (next !== offline) {
    offline = next;
    for (const listener of listeners) listener(!offline);
  }
  syncRecheckTimer();
}

function syncRecheckTimer(): void {
  if (offline && recheckTimer === null) {
    recheckTimer = globalThis.setInterval(evaluate, RECHECK_INTERVAL_MS);
    return;
  }
  if (!offline && recheckTimer !== null) {
    globalThis.clearInterval(recheckTimer);
    recheckTimer = null;
  }
}

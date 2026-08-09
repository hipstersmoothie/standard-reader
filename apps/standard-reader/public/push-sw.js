/* eslint-disable */
/**
 * Web push listeners, pulled into the generated Workbox service worker via
 * `workbox.importScripts` in `vite.config.ts`.
 *
 * Three constraints make this file look the way it does. Please keep them:
 *
 *   1. **It is a classic script.** No `import`, no `export`, no top-level
 *      `await`. Workbox emits the bundled SW in AMD format, so `importScripts`
 *      runs inside the module factory — anything that throws here takes the
 *      whole service worker down with it, including every caching route the app
 *      relies on for offline. Hence the defensive style throughout.
 *   2. **Every `push` event must show a notification.** iOS revokes the push
 *      subscription outright if a push arrives and nothing is displayed, so
 *      there is no early return anywhere in the handler — a malformed payload
 *      falls back to generic copy rather than being dropped.
 *   3. **Old copies stay live for weeks.** `registerType: "prompt"` +
 *      `skipWaiting: false` means a changed service worker doesn't activate
 *      until the reader accepts the reload toast. Treat the payload shape as
 *      append-only: never repurpose a field, only add optional ones.
 *
 * The payload sent by `src/server/push/fan-out.server.ts` is
 * `{ title, body, url, tag }`, all optional from this side's point of view.
 */

/* global self, clients */

const FALLBACK_TITLE = "Standard Reader";
const FALLBACK_BODY = "Something new to read.";
const ICON = "/icon-192.png";
const BADGE = "/icon-192.png";

/** Parse the payload without ever throwing. */
function readPayload(event) {
  try {
    const raw = event && event.data ? event.data.json() : null;
    if (raw && typeof raw === "object") {
      return raw;
    }
  } catch {
    // Not JSON, or no data at all. Fall through to the text form.
  }
  try {
    const text = event && event.data ? event.data.text() : "";
    if (text) {
      return { body: text };
    }
  } catch {
    // Nothing usable — the generic notification below still shows.
  }
  return {};
}

function asString(value, fallback) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  const title = asString(payload.title, FALLBACK_TITLE);
  const url = asString(payload.url, "/");

  event.waitUntil(
    self.registration.showNotification(title, {
      body: asString(payload.body, FALLBACK_BODY),
      icon: ICON,
      badge: BADGE,
      // Collapses a burst from one source into a single notification instead of
      // stacking. Also what keeps a retried send from showing twice.
      tag: asString(payload.tag, url),
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const target = asString(data.url, "/");

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        // Prefer an already-open tab on the same origin — opening a second copy
        // of the app to read one article is worse than navigating the first.
        for (const client of windows) {
          if (client.url === target && "focus" in client) {
            return client.focus();
          }
        }
        for (const client of windows) {
          if ("navigate" in client && "focus" in client) {
            return client.focus().then(() => client.navigate(target));
          }
        }
        return clients.openWindow ? clients.openWindow(target) : undefined;
      })
      .catch(() => {
        return clients.openWindow ? clients.openWindow(target) : undefined;
      }),
  );
});

/**
 * The push service rotated our endpoint. Chrome fires this; Safari does not
 * implement it at all, which is why the app also re-validates its endpoint on
 * load (`syncPushDevice` in `src/pwa/push.ts`). Without both, a rotated
 * subscription silently stops receiving anything.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  const previous = event.oldSubscription || null;
  const applicationServerKey =
    previous && previous.options ? previous.options.applicationServerKey : null;

  if (!applicationServerKey) {
    // Nothing to re-subscribe with. The next app load repairs it.
    return;
  }

  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey })
      .then((subscription) =>
        fetch("/api/push/resubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // The session cookie is what authorizes the swap; the server refuses
          // to move a device row it can't match to the signed-in reader.
          credentials: "include",
          body: JSON.stringify({
            oldEndpoint: previous.endpoint,
            subscription: subscription.toJSON(),
          }),
        }),
      )
      .catch(() => {
        // Best effort. `syncPushDevice` retries on the next app load.
      }),
  );
});

/**
 * Pre-React popup skeleton.
 *
 * Runs before `main.tsx` mounts React so the popup paints a matching shell from
 * `chrome.storage.session` instead of a blank frame. Lives in its own module (not
 * inline in `popup/index.html`) because the extension CSP (`script-src 'self'`)
 * blocks inline scripts. Vite bundles it as a self-origin script referenced by an
 * external `<script src>` tag, which satisfies `'self'`.
 *
 * Sets `window.__SR_POPUP_INIT__`, a promise the React side awaits via
 * `loadInitialPopupState` (`src/lib/popup-load-state.ts`) to hydrate from the same
 * stored state. Kept dependency-free: it executes before React and must not pull
 * any heavy imports into the popup's critical path.
 */

import type { StoredPopupState } from "../../lib/popup-state";

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

type PrerenderState = StoredPopupState;

function renderPrerender(state: PrerenderState): void {
  const root = document.getElementById("root");
  if (!root || root.getAttribute("data-sr-prerender") === "1") {
    return;
  }
  root.setAttribute("data-sr-prerender", "1");

  const session = state.session ?? {};
  const result = state.result ?? { kind: "unknown" };
  const signedIn = session.signedIn === true;
  let body = "";

  if (!signedIn) {
    body =
      '<section class="sr-body sr-body-center">' +
      '<div class="sr-mark" aria-hidden="true"></div>' +
      '<h2 class="sr-headline">Save articles as you read</h2>' +
      '<p class="sr-muted">Sign in to save articles and follow publications.</p>' +
      '<button type="button" class="sr-button sr-button-primary" disabled>Sign in</button>' +
      "</section>";
  } else if (result.kind === "article") {
    const saveLabel = result.isBookmarked ? "Saved" : "Save";
    const followLabel = result.isFollowing ? "Subscribed" : "Subscribe";
    body =
      '<section class="sr-body">' +
      '<h2 class="sr-title">' +
      escapeHtml(result.title ?? "Article") +
      "</h2>" +
      (result.authorName
        ? '<p class="sr-meta">' + escapeHtml(result.authorName) + "</p>"
        : "") +
      '<div class="sr-actions">' +
      '<button type="button" class="sr-button sr-button-secondary" disabled>' +
      escapeHtml(saveLabel) +
      "</button>" +
      '<button type="button" class="sr-button sr-button-secondary" disabled>' +
      escapeHtml(followLabel) +
      "</button>" +
      '<button type="button" class="sr-button sr-button-primary" disabled>Read</button>' +
      "</div>" +
      "</section>";
  } else if (result.kind === "publication") {
    const subscribed = result.isFollowing ? "Subscribed" : "Subscribe";
    body =
      '<section class="sr-body">' +
      '<p class="sr-kicker">Publication</p>' +
      '<h2 class="sr-title">' +
      escapeHtml(result.name ?? "Publication") +
      "</h2>" +
      '<div class="sr-actions">' +
      '<button type="button" class="sr-button sr-button-secondary" disabled>' +
      escapeHtml(subscribed) +
      "</button>" +
      '<button type="button" class="sr-button sr-button-primary" disabled>View</button>' +
      "</div>" +
      "</section>";
  } else if (result.kind === "reader-link") {
    body =
      '<section class="sr-body">' +
      '<p class="sr-muted">You&apos;re already in Standard Reader.</p>' +
      '<button type="button" class="sr-button sr-button-secondary" disabled>Open page</button>' +
      "</section>";
  } else {
    let host = "";
    try {
      host = state.tabUrl ? new URL(state.tabUrl).hostname : "";
    } catch {
      host = "";
    }
    body =
      '<section class="sr-body sr-body-center">' +
      '<div class="sr-mark sr-mark-compass" aria-hidden="true"></div>' +
      '<h2 class="sr-headline">No article detected</h2>' +
      '<p class="sr-muted">This page doesn&apos;t look like a saved article yet.</p>' +
      (host ? '<p class="sr-host">' + escapeHtml(host) + "</p>" : "") +
      '<button type="button" class="sr-button sr-button-primary" disabled>Browse Discover</button>' +
      "</section>";
  }

  root.innerHTML =
    '<div class="sr-shell">' +
    '<header class="sr-header">' +
    '<div class="sr-brand">Standard Reader</div>' +
    '<div class="sr-header-spacer"></div>' +
    '<div class="sr-header-actions" aria-hidden="true"></div>' +
    "</header>" +
    '<div class="sr-separator"></div>' +
    body +
    (signedIn
      ? '<div class="sr-separator"></div>' +
        '<footer class="sr-footer">' +
        '<span class="sr-muted">' +
        escapeHtml(session.name ?? session.handle ?? "Signed in") +
        "</span>" +
        "</footer>"
      : "") +
    "</div>";
}

// Uses the typed `browser` global (WXT's promise-based wrapper) rather than the
// callback-style `chrome` global. async/await keeps the logic flat and type-safe;
// the module still runs before React because it has no heavy imports and `main.tsx`
// awaits `window.__SR_POPUP_INIT__` via `loadInitialPopupState`.
window.__SR_POPUP_INIT__ = (async (): Promise<PrerenderState | null> => {
  if (!browser?.tabs?.query || !browser?.storage?.session?.get) {
    return null;
  }

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || tab.id == null || !tab.url) {
    return null;
  }

  const data = await browser.storage.session.get("srPopupState");
  const state = data.srPopupState as PrerenderState | undefined;
  if (!state || state.tabId !== tab.id || state.tabUrl !== tab.url) {
    return null;
  }

  renderPrerender(state);
  return state;
})();

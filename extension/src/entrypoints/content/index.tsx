import type { Root } from "react-dom/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";

import { createRoot } from "react-dom/client";

import { readDiscoveryHintsFromDocument } from "#/lib/discovery-hints";

import { BskyLinkBadge } from "../../components/BskyLinkBadge";
import { PageChip } from "../../components/PageChip";
import { sendMessage } from "../../lib/messaging";
import "../../load-stylex-styles";

const dismissedOrigins = new Set<string>();

function isDismissed(origin: string): boolean {
  return dismissedOrigins.has(origin);
}

function dismissOrigin(origin: string): void {
  dismissedOrigins.add(origin);
}

const SR_HOSTS = new Set([
  "standard-reader.app",
  "staging.standard-reader.app",
]);
const BSKY_HOSTS = new Set(["bsky.app", "staging.bsky.app"]);
const EXCLUDED_HOSTS = new Set([
  "standard-reader.app",
  "localhost",
  "127.0.0.1",
]);

function collectBskyLinks(): Array<HTMLAnchorElement> {
  const anchors = [
    ...document.querySelectorAll("a[href]"),
  ] as Array<HTMLAnchorElement>;
  return anchors.filter((anchor) => {
    const href = anchor.href;
    if (!href) return false;
    if (href.startsWith("at://")) return true;
    try {
      const url = new URL(href);
      return SR_HOSTS.has(url.hostname) && url.pathname.startsWith("/a/");
    } catch {
      return false;
    }
  });
}

function installSpaNavigationListener(callback: () => void): () => void {
  const notify = () => {
    callback();
  };

  globalThis.addEventListener("popstate", notify);

  const { pushState, replaceState } = history;
  history.pushState = (...args) => {
    pushState.apply(history, args);
    notify();
  };
  history.replaceState = (...args) => {
    replaceState.apply(history, args);
    notify();
  };

  return () => {
    globalThis.removeEventListener("popstate", notify);
    history.pushState = pushState;
    history.replaceState = replaceState;
  };
}

function debounce(fn: () => void, delayMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, delayMs);
  };
}

async function initPageOverlay(ctx: ContentScriptContext): Promise<void> {
  const settings = await sendMessage({ type: "getSettings" });
  if (!settings.overlayEnabled) return;

  let currentRoot: Root | null = null;
  let ui: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
  let lastResolveKey: string | null = null;

  const mountUi = async (refresh = false) => {
    const url = globalThis.location.href;
    const origin = globalThis.location.origin;
    if (isDismissed(origin)) return;

    const hints = readDiscoveryHintsFromDocument(document);
    const resolveKey = `${url}\0${hints.documentUri ?? ""}\0${hints.publicationUri ?? ""}`;
    if (!refresh && resolveKey === lastResolveKey && ui) return;

    let resolved;
    try {
      resolved = await sendMessage({
        type: "resolve",
        url,
        hints,
        refresh: refresh || undefined,
      });
    } catch {
      ui?.remove();
      ui = null;
      return;
    }

    lastResolveKey = resolveKey;
    if (resolved.kind !== "article" && resolved.kind !== "publication") {
      ui?.remove();
      ui = null;
      return;
    }

    if (!ui) {
      ui = await createShadowRootUi(ctx, {
        name: "standard-reader-page-chip",
        position: "overlay",
        anchor: "body",
        onMount(container) {
          currentRoot = createRoot(container);
          currentRoot.render(
            <PageChip
              result={resolved}
              onDismiss={() => {
                dismissOrigin(origin);
                ui?.remove();
              }}
              onRefresh={() => {
                void mountUi(true);
              }}
            />,
          );
          return currentRoot;
        },
        onRemove(root) {
          root?.unmount();
          currentRoot = null;
        },
      });
      ui.mount();
    } else if (currentRoot) {
      currentRoot.render(
        <PageChip
          result={resolved}
          onDismiss={() => {
            dismissOrigin(origin);
            ui?.remove();
          }}
          onRefresh={() => {
            void mountUi(true);
          }}
        />,
      );
    }
  };

  const scheduleMountUi = debounce(() => {
    void mountUi();
  }, 300);

  void mountUi();

  const observer = new MutationObserver(scheduleMountUi);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
  });

  installSpaNavigationListener(() => {
    lastResolveKey = null;
    scheduleMountUi();
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.overlayEnabled) {
      if (changes.overlayEnabled.newValue === false) {
        ui?.remove();
      } else {
        void mountUi();
      }
    }
  });
}

async function initBskyBadges(ctx: ContentScriptContext): Promise<void> {
  const settings = await sendMessage({ type: "getSettings" });
  if (!settings.bskyBadgesEnabled) return;

  const mounted = new Map<
    HTMLAnchorElement,
    Awaited<ReturnType<typeof createShadowRootUi>>
  >();

  const scan = async () => {
    for (const [link, ui] of mounted) {
      if (!document.contains(link)) {
        ui.remove();
        mounted.delete(link);
        delete link.dataset.srBadgeMounted;
      }
    }

    const links = collectBskyLinks();
    const hrefs = [...new Set(links.map((link) => link.href))];
    if (hrefs.length === 0) return;

    const results = await sendMessage({
      type: "resolveBatch",
      urls: hrefs,
    });

    for (const link of links) {
      const result = results[link.href];
      if (!result || result.kind !== "article") {
        if (link.dataset.srBadgeMounted === "true") {
          const existing = mounted.get(link);
          existing?.remove();
          mounted.delete(link);
          delete link.dataset.srBadgeMounted;
        }
        continue;
      }
      if (link.dataset.srBadgeMounted === "true") {
        continue;
      }

      link.dataset.srBadgeMounted = "true";
      const ui = await createShadowRootUi(ctx, {
        name: "standard-reader-bsky-badge",
        position: "inline",
        anchor: link,
        append: "after",
        onMount(container) {
          const root = createRoot(container);
          root.render(
            <BskyLinkBadge
              result={result}
              onUpdate={() => {
                void scan();
              }}
            />,
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      await ui.mount();
      mounted.set(link, ui);
    }
  };

  void scan();

  const observer = new MutationObserver(() => {
    void scan();
  });
  observer.observe(document.body, { subtree: true, childList: true });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.bskyBadgesEnabled) {
      if (changes.bskyBadgesEnabled.newValue === false) {
        for (const ui of mounted.values()) {
          ui.remove();
        }
        mounted.clear();
      } else {
        void scan();
      }
    }
  });
}

const standardReaderContentScript = defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",
  excludeMatches: [
    "*://standard-reader.app/*",
    "*://*.standard-reader.app/*",
    "*://localhost/*",
    "*://127.0.0.1/*",
  ],
  async main(ctx) {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "getDiscoveryHints") {
        sendResponse(readDiscoveryHintsFromDocument(document));
        return true;
      }
      return undefined;
    });

    const host = globalThis.location.hostname;
    if (BSKY_HOSTS.has(host)) {
      await initBskyBadges(ctx);
      return;
    }
    if (EXCLUDED_HOSTS.has(host)) {
      return;
    }
    await initPageOverlay(ctx);
  },
});

export default standardReaderContentScript;

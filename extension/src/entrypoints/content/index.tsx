import type { Root } from "react-dom/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";

import { readDiscoveryHintsFromDocument } from "#/lib/discovery-hints";
import { createRoot } from "react-dom/client";

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

const EXCLUDED_HOSTS = new Set([
  "standard-reader.app",
  "staging.standard-reader.app",
  "bsky.app",
  "staging.bsky.app",
  "localhost",
  "127.0.0.1",
]);

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

const standardReaderContentScript = defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",
  excludeMatches: [
    "*://standard-reader.app/*",
    "*://*.standard-reader.app/*",
    "*://bsky.app/*",
    "*://staging.bsky.app/*",
    "*://localhost/*",
    "*://127.0.0.1/*",
  ],
  async main(ctx) {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "getDiscoveryHints") {
        sendResponse(readDiscoveryHintsFromDocument(document));
        return true;
      }
      return;
    });

    const host = globalThis.location.hostname;
    if (EXCLUDED_HOSTS.has(host)) {
      return;
    }
    await initPageOverlay(ctx);
  },
});

export default standardReaderContentScript;

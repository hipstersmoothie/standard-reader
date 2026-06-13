import { STANDARD_NSID } from "#/lib/atproto/nsids";
import { resolveQuoteOgColors } from "#/lib/publication-theme";

import type {
  ExtensionPublicationTheme,
  ExtensionResolveArticle,
  ExtensionResolveResult,
} from "./types";

import { appHosts, bskyHosts } from "./manifest-hosts";
import { sendMessage } from "./messaging";

const BUTTON_ATTR = "data-sr-bsky-bookmark";
const ICON_ATTR = "data-sr-bsky-bookmark-icon";
const SPINNER_ATTR = "data-sr-bsky-bookmark-spinner";
const EMBED_ATTR = "data-sr-bsky-embed";
const ARTICLE_HREF_ATTR = "data-sr-bsky-article-href";
const TITLE_ROW_ATTR = "data-sr-bsky-embed-row";
const SPACER_ATTR = "data-sr-bsky-bookmark-spacer";
const STYLE_ID = "sr-bsky-bookmark-styles";

const SR_HOSTS = new Set(appHosts(import.meta.env.DEV));
const BSKY_HOSTS = new Set(bskyHosts(import.meta.env.DEV));

const SR_ARTICLE_PATH = /^\/a\/[^/]+\/[^/]+(?:\/|$|\?)/;

const LEAFLET_HOST_SUFFIX = ".leaflet.pub";

const FOOTER_CTA =
  /^(Subscribe(?: on .+)?|Subscribe to .+|View publication|View .+)$/i;

const BOOKMARK_PATH = "m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z";

let embedScanGeneration = 0;

function bumpEmbedScanGeneration(): void {
  embedScanGeneration += 1;
}

type EmbedCandidate = {
  root: HTMLElement;
  articleHref: string;
  articleLink: HTMLAnchorElement;
};

function ensureBookmarkStyles(): void {
  if (document.querySelector(`#${STYLE_ID}`)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [${BUTTON_ATTR}] {
      position: absolute;
      inset: 0;
      z-index: 11;
      pointer-events: auto;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 9999px;
      background-color: var(--sr-bookmark-accent);
      color: var(--sr-bookmark-accent-fg);
      cursor: pointer;
      transition: opacity 150ms ease;
    }
    [${BUTTON_ATTR}]:hover:not(:disabled) {
      opacity: 0.9;
    }
    [${BUTTON_ATTR}]:disabled {
      cursor: wait;
    }
    [${BUTTON_ATTR}]:disabled:not([aria-busy="true"]) {
      opacity: 0.6;
    }
    [${BUTTON_ATTR}] svg {
      width: 14px;
      height: 14px;
    }
    [${BUTTON_ATTR}] [${SPINNER_ATTR}] {
      animation: sr-bsky-bookmark-spin 0.75s linear infinite;
    }
    @keyframes sr-bsky-bookmark-spin {
      to {
        transform: rotate(360deg);
      }
    }
    [${BUTTON_ATTR}][aria-pressed="true"] [${ICON_ATTR}] path {
      fill: currentColor;
      stroke: none;
    }
    [${BUTTON_ATTR}][aria-pressed="false"] [${ICON_ATTR}] path {
      fill: none;
      stroke: currentColor;
    }
    [${TITLE_ROW_ATTR}] {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      width: 100%;
      min-width: 0;
    }
    [${TITLE_ROW_ATTR}] > :first-child {
      flex: 1;
      min-width: 0;
    }
    [${SPACER_ATTR}] {
      position: relative;
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      margin-top: 2px;
      margin-right: 8px;
    }
  `;
  document.head.append(style);
}

function isStandardDocumentAtUri(href: string): boolean {
  return (
    href.startsWith("at://") && href.includes(`/${STANDARD_NSID.document}/`)
  );
}

function isReaderArticleUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return SR_HOSTS.has(url.hostname) && SR_ARTICLE_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

function isLeafletDocumentUrl(href: string): boolean {
  try {
    const url = new URL(href);
    if (!url.hostname.endsWith(LEAFLET_HOST_SUFFIX)) return false;
    const path = url.pathname.replace(/\/+$/, "");
    return path.length > 1;
  } catch {
    return false;
  }
}

function isPublicationHomeUrl(href: string): boolean {
  try {
    const url = new URL(href);
    const path = url.pathname.replace(/\/+$/, "");
    return path.length === 0;
  } catch {
    return false;
  }
}

function isArticleHref(href: string): boolean {
  return (
    isStandardDocumentAtUri(href) ||
    isReaderArticleUrl(href) ||
    isLeafletDocumentUrl(href)
  );
}

function isBskyHost(hostname: string): boolean {
  return BSKY_HOSTS.has(hostname);
}

function normalizeText(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

function clickableLabel(el: HTMLElement): string {
  return (
    el.getAttribute("aria-label")?.trim() || normalizeText(el.textContent ?? "")
  );
}

function isFooterCtaElement(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const label = clickableLabel(el);
  if (!label) return false;
  if (FOOTER_CTA.test(label)) return true;
  if (/^subscribe\b/i.test(label) && label.length < 120) return true;
  if (/^subscribed\b/i.test(label)) return true;
  return false;
}

function findCardRoot(from: Element): HTMLElement | null {
  let el: HTMLElement | null = from.parentElement;
  for (let depth = 0; depth < 14 && el; depth++) {
    const rect = el.getBoundingClientRect();
    const links = el.querySelectorAll('a[href^="http"], a[href^="at://"]');
    if (links.length > 0 && rect.width >= 200 && rect.height >= 64) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function scoreArticleLink(anchor: HTMLAnchorElement): number {
  if (isFooterCtaElement(anchor)) return -1;

  try {
    if (
      anchor.href.startsWith("http") &&
      isBskyHost(new URL(anchor.href).hostname)
    ) {
      return -1;
    }
  } catch {
    return -1;
  }

  if (isPublicationHomeUrl(anchor.href)) return -1;

  const hasImage =
    anchor.querySelector("img") != null ||
    anchor.parentElement?.querySelector("img") != null;
  const textLength = anchor.textContent?.trim().length ?? 0;
  const knownArticleBonus = isArticleHref(anchor.href) ? 2000 : 0;
  const pathDepthBonus = (() => {
    try {
      const segments = new URL(anchor.href).pathname.split("/").filter(Boolean);
      return segments.length * 100;
    } catch {
      return 0;
    }
  })();

  return knownArticleBonus + pathDepthBonus + (hasImage ? 200 : 0) + textLength;
}

function findArticleLink(root: HTMLElement): HTMLAnchorElement | null {
  const anchors = [
    ...root.querySelectorAll('a[href^="http"], a[href^="at://"]'),
  ] as Array<HTMLAnchorElement>;

  let best: HTMLAnchorElement | null = null;
  let bestScore = -1;

  for (const anchor of anchors) {
    const score = scoreArticleLink(anchor);
    if (score < 0) continue;

    if (score > bestScore) {
      bestScore = score;
      best = anchor;
    }
  }

  return best;
}

function findTitleElement(
  root: HTMLElement,
  title: string,
): HTMLElement | null {
  const target = normalizeText(title);
  if (!target) return null;

  let best: HTMLElement | null = null;
  let bestLength = Infinity;

  for (const el of root.querySelectorAll("div, span, p, h1, h2, h3, h4")) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.closest(`[${BUTTON_ATTR}]`)) continue;

    const text = normalizeText(el.textContent ?? "");
    if (text !== target && !text.startsWith(target)) continue;
    if (text.length < target.length) continue;

    if (text.length < bestLength) {
      bestLength = text.length;
      best = el;
    }
  }

  return best;
}

function findTextBlockContainer(titleEl: HTMLElement): HTMLElement | null {
  return titleEl.parentElement;
}

function ensureButtonInSpacer(
  button: HTMLButtonElement,
  spacer: HTMLElement,
): void {
  if (button.parentElement !== spacer) {
    spacer.append(button);
  }
}

function mountBesideTextBlock(
  titleEl: HTMLElement,
  button: HTMLButtonElement,
): void {
  const textBlock = findTextBlockContainer(titleEl);
  if (!textBlock) return;

  let row = textBlock.closest(`[${TITLE_ROW_ATTR}]`);
  let spacer: HTMLElement;

  if (row instanceof HTMLElement) {
    const existingSpacer = row.querySelector(`[${SPACER_ATTR}]`);
    if (existingSpacer instanceof HTMLElement) {
      spacer = existingSpacer;
    } else {
      spacer = document.createElement("span");
      spacer.setAttribute(SPACER_ATTR, "true");
      spacer.setAttribute("aria-hidden", "true");
      row.append(spacer);
    }
  } else {
    const parent = textBlock.parentElement;
    if (!parent) return;

    row = document.createElement("div");
    row.setAttribute(TITLE_ROW_ATTR, "true");
    textBlock.before(row);
    row.append(textBlock);

    spacer = document.createElement("span");
    spacer.setAttribute(SPACER_ATTR, "true");
    spacer.setAttribute("aria-hidden", "true");
    row.append(spacer);
  }

  ensureButtonInSpacer(button, spacer);
}

function stopLinkNavigation(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function attachBookmarkActivationHandlers(
  button: HTMLButtonElement,
  onActivate: (target: HTMLButtonElement) => void,
): void {
  for (const type of ["pointerdown", "mousedown", "touchstart"] as const) {
    button.addEventListener(type, stopLinkNavigation, { capture: true });
  }

  button.addEventListener(
    "click",
    (event) => {
      stopLinkNavigation(event);
      if (event.currentTarget instanceof HTMLButtonElement) {
        onActivate(event.currentTarget);
      }
    },
    { capture: true },
  );

  button.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      stopLinkNavigation(event);
      onActivate(button);
    },
    { capture: true },
  );
}

function collectStandardSiteDocumentEmbeds(): Array<EmbedCandidate> {
  const seenRoots = new Set<HTMLElement>();
  const candidates: Array<EmbedCandidate> = [];

  const register = (root: HTMLElement) => {
    if (seenRoots.has(root)) return;
    const articleLink = findArticleLink(root);
    if (!articleLink) return;
    seenRoots.add(root);
    candidates.push({
      root,
      articleHref: articleLink.href,
      articleLink,
    });
  };

  for (const el of document.querySelectorAll("button, a, [role='button']")) {
    if (!(el instanceof HTMLElement)) continue;
    if (!isFooterCtaElement(el)) continue;
    const root = findCardRoot(el);
    if (root) register(root);
  }

  for (const anchor of document.querySelectorAll(
    'a[href^="http"], a[href^="at://"]',
  )) {
    if (!(anchor instanceof HTMLAnchorElement)) continue;
    if (!isArticleHref(anchor.href)) continue;
    const root = findCardRoot(anchor);
    if (root) register(root);
  }

  return candidates;
}

function applyBookmarkTheme(
  button: HTMLButtonElement,
  theme: ExtensionPublicationTheme,
): void {
  const colors = resolveQuoteOgColors(theme);

  button.style.setProperty("--sr-bookmark-accent", colors.accent);
  button.style.setProperty("--sr-bookmark-accent-fg", colors.accentForeground);
}

function ensureBookmarkIcon(button: HTMLButtonElement): void {
  button.querySelector(`[${SPINNER_ATTR}]`)?.remove();

  if (button.querySelector(`[${ICON_ATTR}]`)) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute(ICON_ATTR, "true");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", BOOKMARK_PATH);
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  button.append(svg);
}

function ensureBookmarkSpinner(button: HTMLButtonElement): void {
  button.querySelector(`[${ICON_ATTR}]`)?.remove();

  if (button.querySelector(`[${SPINNER_ATTR}]`)) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute(SPINNER_ATTR, "true");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");

  const circle = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle",
  );
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "9");
  circle.setAttribute("fill", "none");
  circle.setAttribute("stroke", "currentColor");
  circle.setAttribute("stroke-width", "2");
  circle.setAttribute("stroke-dasharray", "28 56");
  circle.setAttribute("stroke-linecap", "round");
  svg.append(circle);
  button.append(svg);
}

function readBookmarkSavedState(
  button: HTMLButtonElement,
  article: ExtensionResolveArticle,
): boolean {
  if (button.hasAttribute("aria-pressed")) {
    return button.getAttribute("aria-pressed") === "true";
  }
  return Boolean(article.isBookmarked);
}

function updateBookmarkButton(
  button: HTMLButtonElement,
  article: ExtensionResolveArticle,
  saved: boolean,
  busy = false,
): void {
  applyBookmarkTheme(button, article);

  const label = saved ? "Saved to Standard Reader" : "Save to Standard Reader";
  const pressed = saved ? "true" : "false";
  const busyAttr = busy ? "true" : "false";

  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", pressed);
  button.setAttribute("aria-busy", busyAttr);
  button.title = label;

  if (busy) {
    ensureBookmarkSpinner(button);
  } else {
    ensureBookmarkIcon(button);
  }
}

function mountBookmarkButton(
  root: HTMLElement,
  article: ExtensionResolveArticle,
  articleLink: HTMLAnchorElement,
): HTMLButtonElement | null {
  ensureBookmarkStyles();

  const titleEl =
    findTitleElement(root, article.title) ??
    findTitleElement(articleLink, article.title);
  if (!titleEl) return null;

  let button = root.querySelector(
    `[${BUTTON_ATTR}]`,
  ) as HTMLButtonElement | null;

  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.setAttribute(BUTTON_ATTR, "true");

    attachBookmarkActivationHandlers(button, (target) => {
      void toggleBookmark(target, root, article);
    });
  }

  mountBesideTextBlock(titleEl, button);

  root.setAttribute(EMBED_ATTR, article.documentUri);
  root.setAttribute(ARTICLE_HREF_ATTR, articleLink.href);

  if (button.disabled || button.getAttribute("aria-busy") === "true") {
    return button;
  }

  updateBookmarkButton(
    button,
    article,
    readBookmarkSavedState(button, article),
  );
  return button;
}

async function toggleBookmark(
  button: HTMLButtonElement,
  root: HTMLElement,
  article: ExtensionResolveArticle,
): Promise<void> {
  const documentUri = root.getAttribute(EMBED_ATTR);
  if (!documentUri) return;

  bumpEmbedScanGeneration();

  const saved = button.getAttribute("aria-pressed") === "true";
  const nextSaved = !saved;

  button.disabled = true;
  updateBookmarkButton(button, article, nextSaved, true);

  let resolvedSaved = saved;
  try {
    await sendMessage({
      type: "bookmark",
      documentUri,
      save: nextSaved,
      resolveUrl: root.getAttribute(ARTICLE_HREF_ATTR) ?? undefined,
    });
    resolvedSaved = nextSaved;
  } catch {
    resolvedSaved = saved;
  } finally {
    button.disabled = false;
    updateBookmarkButton(button, article, resolvedSaved, false);
  }
}

function removeBookmarkButton(root: HTMLElement): void {
  root.querySelector(`[${BUTTON_ATTR}]`)?.remove();

  for (const spacer of root.querySelectorAll(`[${SPACER_ATTR}]`)) {
    spacer.remove();
  }

  for (const row of root.querySelectorAll(`[${TITLE_ROW_ATTR}]`)) {
    if (!(row instanceof HTMLElement)) continue;
    const textBlock = row.firstElementChild;
    if (textBlock && row.childElementCount === 1) {
      row.before(textBlock);
      row.remove();
    }
  }

  root.removeAttribute(EMBED_ATTR);
  root.removeAttribute(ARTICLE_HREF_ATTR);
}

function debounce(fn: () => void, delayMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, delayMs);
  };
}

function embedHrefSignature(embeds: Array<EmbedCandidate>): string {
  return embeds
    .map((embed) => embed.articleHref)
    .sort()
    .join("|");
}

function isManagedMutationNode(node: Node): boolean {
  if (!(node instanceof Element)) {
    return node.nodeType === Node.TEXT_NODE;
  }

  return (
    node.matches(`[${BUTTON_ATTR}], [${SPACER_ATTR}], [${TITLE_ROW_ATTR}]`) ||
    node.closest(`[${BUTTON_ATTR}], [${SPACER_ATTR}], [${TITLE_ROW_ATTR}]`) !=
      null
  );
}

function shouldScheduleScan(mutations: Array<MutationRecord>): boolean {
  for (const mutation of mutations) {
    if (mutation.type !== "childList") continue;

    const added = [...mutation.addedNodes].filter(
      (node) => !isManagedMutationNode(node),
    );
    const removed = [...mutation.removedNodes].filter(
      (node) => !isManagedMutationNode(node),
    );

    if (added.length > 0 || removed.length > 0) return true;
  }

  return false;
}

export async function initBskyEmbedBookmarks(): Promise<void> {
  const settings = await sendMessage({ type: "getSettings" });
  if (!settings.bskyBadgesEnabled) return;

  ensureBookmarkStyles();

  let lastMountedSignature = "";

  const scan = async () => {
    const generation = embedScanGeneration;
    const embeds = collectStandardSiteDocumentEmbeds();
    if (embeds.length === 0) return;

    const signature = embedHrefSignature(embeds);
    const allMounted = embeds.every((embed) =>
      Boolean(embed.root.querySelector(`[${BUTTON_ATTR}]`)),
    );
    if (signature === lastMountedSignature && allMounted) return;

    const hrefs = [...new Set(embeds.map((embed) => embed.articleHref))];
    let results: Record<string, ExtensionResolveResult>;
    try {
      results = await sendMessage({
        type: "resolveBatch",
        urls: hrefs,
      });
    } catch {
      return;
    }

    if (generation !== embedScanGeneration) return;

    const mountedRoots = new Set<HTMLElement>();

    for (const embed of embeds) {
      const result = results[embed.articleHref];
      if (!result || result.kind !== "article") {
        removeBookmarkButton(embed.root);
        continue;
      }

      const button = mountBookmarkButton(embed.root, result, embed.articleLink);
      if (button) mountedRoots.add(embed.root);
    }

    for (const root of document.querySelectorAll(`[${EMBED_ATTR}]`)) {
      if (!(root instanceof HTMLElement)) continue;
      if (!mountedRoots.has(root)) removeBookmarkButton(root);
    }

    lastMountedSignature = signature;
  };

  const scheduleScan = debounce(() => {
    void scan();
  }, 250);

  void scan();

  const observer = new MutationObserver((mutations) => {
    if (shouldScheduleScan(mutations)) scheduleScan();
  });
  observer.observe(document.body, { subtree: true, childList: true });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.bskyBadgesEnabled) {
      if (changes.bskyBadgesEnabled.newValue === false) {
        for (const root of document.querySelectorAll(`[${EMBED_ATTR}]`)) {
          if (root instanceof HTMLElement) removeBookmarkButton(root);
        }
      } else {
        void scan();
      }
    }
  });
}

import type { BgRequest, BgResponse } from "../lib/messaging";
import type { PopupStateResponse } from "../lib/popup-state";
import type {
  ReaderMessageBody,
  ReaderSentencesResult,
  ReaderSnapshot,
} from "../lib/reader-messaging";
import type {
  ExtensionResolveResult,
  ExtensionSessionResponse,
} from "../lib/types";

import { isActionIconPlaying, setActionIconPlaying } from "../lib/action-icon";
import {
  fetchBookmark,
  fetchDiscussion,
  fetchFollow,
  fetchNarration,
  fetchRecommend,
  fetchSession,
} from "../lib/api";
import {
  consumePendingAction,
  openLoginTab,
  queuePendingAction,
} from "../lib/auth";
import { getEffectiveApiOrigin, loadSettings } from "../lib/config";
import {
  findTabIdsByDocumentUri,
  getSessionCached,
  getTabSnapshot,
  invalidateSessionCache,
  persistPopupState,
  readStoredPopupState,
  rememberTabSnapshot,
  seedSessionCache,
} from "../lib/popup-state";
import {
  READER_TAB_STATE,
  READER_TARGET,
  isReaderStateBroadcast,
} from "../lib/reader-messaging";
import {
  clearResolveCache,
  getCachedResolve,
  invalidateResolveCache,
  patchResolveCacheBookmark,
  patchResolveCacheRecommend,
  resolveBatchWithCache,
  resolveWithCache,
} from "../lib/resolve-cache";

const MENU_SAVE = "sr-save";
const MENU_OPEN = "sr-open";

// ——— Read-aloud (offscreen reader) ———————————————————————————————————————
// The TTS engine runs in an offscreen document (Chromium only) so audio keeps
// playing after the popup closes. The background fetches the narration text
// (it has cookie/storage access; the offscreen page doesn't) and forwards
// transport commands.

function offscreenApi(): typeof browser.offscreen | undefined {
  return (browser as { offscreen?: typeof browser.offscreen }).offscreen;
}

let offscreenCreating: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  const offscreen = offscreenApi();
  if (!offscreen)
    throw new Error("Read aloud isn’t available in this browser.");
  if (await offscreen.hasDocument()) return;
  offscreenCreating ??= offscreen
    .createDocument({
      url: "/offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification:
        "Reads the current article aloud with on-device text-to-speech.",
    })
    .finally(() => {
      offscreenCreating = null;
    });
  await offscreenCreating;
}

function sendReaderMessage<T>(message: ReaderMessageBody): Promise<T> {
  return browser.runtime.sendMessage({
    target: READER_TARGET,
    ...message,
  }) as Promise<T>;
}

// Read-along relay: content scripts can't hear runtime broadcasts, so the
// background forwards reader state to the tab(s) showing the playing article.
// Deduped on (article, status, sentence) — the engine ticks 5×/s while playing
// but the page highlight only changes per sentence.
let lastRelayKey = "";
const relayedTabIds = new Set<number>();

function relayReaderState(snapshot: ReaderSnapshot): void {
  const documentUri = snapshot.nowPlaying?.documentUri ?? null;
  const key = `${documentUri ?? ""}|${snapshot.state.status}|${snapshot.progress?.index ?? -1}`;
  if (key === lastRelayKey) return;
  lastRelayKey = key;

  void syncReaderChromeUi(snapshot);

  const targets = documentUri
    ? new Set([...findTabIdsByDocumentUri(documentUri), ...relayedTabIds])
    : new Set(relayedTabIds);
  for (const tabId of targets) {
    void browser.tabs
      .sendMessage(tabId, { type: READER_TAB_STATE, snapshot })
      .catch(() => {
        relayedTabIds.delete(tabId);
      });
  }
  if (documentUri) {
    for (const tabId of findTabIdsByDocumentUri(documentUri)) {
      relayedTabIds.add(tabId);
    }
  } else {
    relayedTabIds.clear();
  }
}

/**
 * Article text extracted from the active tab's live page — the narration
 * source when the indexed record has no full body. Skipped if the active tab
 * resolved to a different article than the one being played. The text stays
 * on-device (content script → background → offscreen TTS).
 */
async function extractActiveTabText(
  documentUri: string,
): Promise<string | null> {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url) return null;
  const snapshot = getTabSnapshot(tab.id, tab.url);
  if (
    snapshot &&
    snapshot.kind === "article" &&
    snapshot.documentUri !== documentUri
  ) {
    return null;
  }
  try {
    const response = (await browser.tabs.sendMessage(tab.id, {
      type: "extractPageText",
    })) as { text: string | null } | undefined;
    return response?.text ?? null;
  } catch {
    return null;
  }
}

/** Tell read-along tabs the session ended (no broadcast follows a teardown). */
function relayReaderCleared(): void {
  lastRelayKey = "";
  relayReaderState({
    state: {
      status: "idle",
      currentTime: 0,
      duration: 0,
      modelProgress: 0,
      generationProgress: 0,
      rate: 1,
      error: null,
    },
    nowPlaying: null,
    progress: null,
  });
}

let loginTabId: number | undefined;

async function closeLoginTab(): Promise<void> {
  if (loginTabId != null) {
    try {
      await browser.tabs.remove(loginTabId);
    } catch {
      // Tab already closed.
    }
    loginTabId = undefined;
    return;
  }

  const apiOrigin = await getEffectiveApiOrigin();
  const origin = apiOrigin.replace(/\/$/, "");
  const tabs = await browser.tabs.query({
    url: [`${origin}/extension/connected`, `${origin}/extension/connected/*`],
  });
  for (const tab of tabs) {
    if (tab.id != null) {
      await browser.tabs.remove(tab.id).catch(() => {});
    }
  }
}

async function getActiveTab(): Promise<Browser.tabs.Tab | undefined> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab;
}

async function getActiveTabUrl(): Promise<string | null> {
  const tab = await getActiveTab();
  return tab?.url ?? null;
}

async function getTabDiscoveryHints(tabId: number): Promise<{
  documentUri?: string | null;
  publicationUri?: string | null;
} | null> {
  try {
    return await browser.tabs.sendMessage(tabId, {
      type: "getDiscoveryHints",
    });
  } catch {
    return null;
  }
}

async function clearToolbarBadges(): Promise<void> {
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.map((tab) =>
      tab.id == null
        ? Promise.resolve()
        : browser.action.setBadgeText({ tabId: tab.id, text: "" }),
    ),
  );
}

async function syncReaderChromeUi(
  snapshot: ReaderSnapshot | null,
): Promise<void> {
  const playing = snapshot !== null && snapshot.state.status !== "idle";
  const wasPlaying = isActionIconPlaying();
  await setActionIconPlaying(playing);
  if (playing) {
    await clearToolbarBadges();
    return;
  }
  if (wasPlaying) {
    const tab = await getActiveTab();
    if (tab?.id) await refreshTabBadge(tab.id, tab.url);
  }
}

async function updateToolbarBadge(
  tabId: number,
  result: Awaited<ReturnType<typeof resolveWithCache>>,
): Promise<void> {
  if (isActionIconPlaying()) {
    await browser.action.setBadgeText({ tabId, text: "" });
    return;
  }

  if (result.kind === "article" || result.kind === "publication") {
    const label = result.kind === "article" ? result.title : result.name;
    await browser.action.setBadgeText({ tabId, text: "•" });
    await browser.action.setBadgeBackgroundColor({ tabId, color: "#c2502b" });
    await browser.action.setTitle({
      tabId,
      title: `${label} — Standard Reader`,
    });
    return;
  }
  await browser.action.setBadgeText({ tabId, text: "" });
  await browser.action.setTitle({ tabId, title: "Standard Reader" });
}

async function refreshTabBadge(
  tabId: number,
  url: string | undefined,
): Promise<void> {
  if (!url || url.startsWith("chrome://") || url.startsWith("about:")) {
    await browser.action.setBadgeText({ tabId, text: "" });
    return;
  }
  try {
    const cached = await getCachedResolve(url);
    const [result, session] = await Promise.all([
      cached && cached.kind !== "unknown"
        ? Promise.resolve(cached)
        : resolveWithCache(url),
      getSessionCached(fetchSession),
    ]);
    rememberTabSnapshot(tabId, url, result);
    await persistPopupState(tabId, url, result, session);
    await updateToolbarBadge(tabId, result);
  } catch {
    await browser.action.setBadgeText({ tabId, text: "" });
  }
}

async function resolveActiveTabResult(
  tab: Browser.tabs.Tab,
  refresh = false,
): Promise<ExtensionResolveResult> {
  const tabUrl = tab.url;
  const tabId = tab.id;
  if (!tabUrl || tabId == null) return { kind: "unknown" };

  if (!refresh) {
    const snapshot = getTabSnapshot(tabId, tabUrl);
    if (snapshot) return snapshot;

    const cached = await getCachedResolve(tabUrl);
    if (cached && cached.kind !== "unknown") {
      rememberTabSnapshot(tabId, tabUrl, cached);
      return cached;
    }
  }

  const existing = getTabSnapshot(tabId, tabUrl);
  const hints =
    refresh && existing && existing.kind !== "unknown"
      ? null
      : await getTabDiscoveryHints(tabId);
  const result = await resolveWithCache(tabUrl, hints ?? undefined, {
    force: refresh,
  });
  rememberTabSnapshot(tabId, tabUrl, result);
  return result;
}

async function refreshActiveTabSnapshot(tabUrl?: string): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url) return;
  if (tabUrl && tab.url !== tabUrl) return;
  const [session, result] = await Promise.all([
    getSessionCached(fetchSession),
    resolveActiveTabResult(tab, true),
  ]);
  rememberTabSnapshot(tab.id, tab.url, result);
  await persistPopupState(tab.id, tab.url, result, session);
  await updateToolbarBadge(tab.id, result);
}

async function storePopupState(
  tabId: number,
  tabUrl: string,
  result: ExtensionResolveResult,
  session: ExtensionSessionResponse,
  fromCache = false,
): Promise<PopupStateResponse> {
  rememberTabSnapshot(tabId, tabUrl, result);
  seedSessionCache(session);
  await persistPopupState(tabId, tabUrl, result, session);
  return { tabUrl, result, session, fromCache };
}

async function getPopupState(refresh = false): Promise<PopupStateResponse> {
  const tab = await getActiveTab();
  const tabUrl = tab?.url ?? null;
  const tabId = tab?.id;
  const sessionPromise = getSessionCached(fetchSession, refresh);

  if (!tab || !tabUrl || tabId == null) {
    const session = await sessionPromise;
    return {
      tabUrl: null,
      result: { kind: "unknown" },
      session,
      fromCache: false,
    };
  }

  if (!refresh) {
    const stored = await readStoredPopupState(tabId, tabUrl);
    if (stored) {
      return storePopupState(
        tabId,
        tabUrl,
        stored.result,
        stored.session,
        true,
      );
    }

    const memorySnapshot = getTabSnapshot(tabId, tabUrl);
    if (memorySnapshot) {
      const session = await sessionPromise;
      return storePopupState(tabId, tabUrl, memorySnapshot, session, true);
    }

    const cached = await getCachedResolve(tabUrl);
    if (cached && cached.kind !== "unknown") {
      const session = await sessionPromise;
      return storePopupState(tabId, tabUrl, cached, session, true);
    }
  }

  const [session, result] = await Promise.all([
    sessionPromise,
    resolveActiveTabResult(tab, refresh),
  ]);
  return storePopupState(tabId, tabUrl, result, session);
}

async function warmActiveTabPopupState(): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url) return;
  await refreshTabBadge(tab.id, tab.url);
}

async function syncReaderActionIconOnStartup(): Promise<void> {
  const offscreen = offscreenApi();
  if (!offscreen || !(await offscreen.hasDocument())) {
    await syncReaderChromeUi(null);
    return;
  }
  try {
    const snapshot = await sendReaderMessage<ReaderSnapshot>({
      type: "getState",
    });
    await syncReaderChromeUi(snapshot);
  } catch {
    await syncReaderChromeUi(null);
  }
}

function setupContextMenus(): void {
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create({
      id: MENU_SAVE,
      title: "Save to Standard Reader",
      contexts: ["link", "page"],
    });
    browser.contextMenus.create({
      id: MENU_OPEN,
      title: "Open in Standard Reader",
      contexts: ["link"],
    });
  });
}

async function promptLoginForPending(
  action: Parameters<typeof queuePendingAction>[0],
): Promise<void> {
  await queuePendingAction(action);
  await openLoginTab();
}

async function handleBookmark(
  documentUri: string,
  save: boolean,
  signedIn: boolean,
  tabUrl?: string | null,
  resolveUrl?: string | null,
): Promise<void> {
  if (!signedIn) {
    if (save) {
      await promptLoginForPending({
        kind: "bookmark",
        documentUri,
        save: true,
      });
    }
    return;
  }

  try {
    await fetchBookmark(documentUri, save);
    if (resolveUrl) await patchResolveCacheBookmark(resolveUrl, save);
    if (tabUrl) await invalidateResolveCache(tabUrl);
    await refreshActiveTabSnapshot(tabUrl ?? undefined);
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized" && save) {
      await promptLoginForPending({
        kind: "bookmark",
        documentUri,
        save: true,
      });
      return;
    }
    throw error;
  }
}

async function handleRecommend(
  documentUri: string,
  recommend: boolean,
  signedIn: boolean,
  tabUrl?: string | null,
  resolveUrl?: string | null,
  recommendCount?: number,
): Promise<void> {
  if (!signedIn) {
    if (recommend) {
      await promptLoginForPending({
        kind: "recommend",
        documentUri,
        recommend: true,
      });
    }
    return;
  }

  try {
    await fetchRecommend(documentUri, recommend);
    if (resolveUrl && recommendCount != null) {
      await patchResolveCacheRecommend(resolveUrl, recommend, recommendCount);
    }
    if (tabUrl) await invalidateResolveCache(tabUrl);
    await refreshActiveTabSnapshot(tabUrl ?? undefined);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "unauthorized" &&
      recommend
    ) {
      await promptLoginForPending({
        kind: "recommend",
        documentUri,
        recommend: true,
      });
      return;
    }
    throw error;
  }
}

async function handleFollow(
  publicationUri: string,
  follow: boolean,
  signedIn: boolean,
  tabUrl?: string | null,
): Promise<void> {
  if (!signedIn) {
    if (follow) {
      await promptLoginForPending({
        kind: "follow",
        publicationUri,
        follow: true,
      });
    }
    return;
  }

  try {
    await fetchFollow(publicationUri, follow);
    if (tabUrl) await invalidateResolveCache(tabUrl);
    await refreshActiveTabSnapshot(tabUrl ?? undefined);
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized" && follow) {
      await promptLoginForPending({
        kind: "follow",
        publicationUri,
        follow: true,
      });
      return;
    }
    throw error;
  }
}

async function processPendingActions(): Promise<void> {
  const pending = await consumePendingAction();
  if (!pending) return;
  const session = await fetchSession();
  if (!session.signedIn) return;

  if (pending.kind === "bookmark") {
    await fetchBookmark(pending.documentUri, pending.save);
  } else if (pending.kind === "recommend") {
    await fetchRecommend(pending.documentUri, pending.recommend);
  } else {
    await fetchFollow(pending.publicationUri, pending.follow);
  }
  await clearResolveCache();
}

async function handleMessage(request: BgRequest): Promise<BgResponse> {
  try {
    switch (request.type) {
      case "getSession": {
        const data = await fetchSession();
        return { ok: true, data };
      }
      case "resolve": {
        const data = await resolveWithCache(request.url, request.hints, {
          force: request.refresh === true,
        });
        return { ok: true, data };
      }
      case "resolveBatch": {
        const data = await resolveBatchWithCache(request.urls);
        return { ok: true, data };
      }
      case "resolveActiveTab": {
        const tab = await getActiveTab();
        const tabUrl = tab?.url ?? null;
        if (!tabUrl || !tab) {
          return {
            ok: true,
            data: { tabUrl: null, result: { kind: "unknown" } },
          };
        }
        const result = await resolveActiveTabResult(tab);
        return { ok: true, data: { tabUrl, result } };
      }
      case "getPopupState": {
        const data = await getPopupState(request.refresh === true);
        return { ok: true, data };
      }
      case "bookmark": {
        const session = await fetchSession();
        const tabUrl = await getActiveTabUrl();
        await handleBookmark(
          request.documentUri,
          request.save,
          session.signedIn,
          tabUrl,
          request.resolveUrl,
        );
        return { ok: true, data: { ok: true } };
      }
      case "recommend": {
        const session = await fetchSession();
        const tabUrl = await getActiveTabUrl();
        await handleRecommend(
          request.documentUri,
          request.recommend,
          session.signedIn,
          tabUrl,
          request.resolveUrl,
          request.recommendCount,
        );
        return { ok: true, data: { ok: true } };
      }
      case "follow": {
        const session = await fetchSession();
        const tabUrl = await getActiveTabUrl();
        await handleFollow(
          request.publicationUri,
          request.follow,
          session.signedIn,
          tabUrl,
        );
        return { ok: true, data: { ok: true } };
      }
      case "getDiscussion": {
        const data = await fetchDiscussion(request.documentUri);
        return { ok: true, data };
      }
      case "openLogin": {
        loginTabId = await openLoginTab();
        return { ok: true, data: { ok: true } };
      }
      case "loginComplete": {
        await closeLoginTab();
        invalidateSessionCache();
        await clearResolveCache();
        await processPendingActions();
        return { ok: true, data: { ok: true } };
      }
      case "openReader": {
        const origin = await getEffectiveApiOrigin();
        const href = request.url.startsWith("http")
          ? request.url
          : `${origin}${request.url}`;
        await browser.tabs.create({ url: href });
        return { ok: true, data: { ok: true } };
      }
      case "readerPlay": {
        await ensureOffscreenDocument();
        const [settings, narration] = await Promise.all([
          loadSettings(),
          fetchNarration(request.documentUri).catch(() => null),
        ]);

        // When the index has no full body (or no narration at all), read the
        // live page instead — whichever source has more text wins. Page text
        // also aligns 1:1 with the DOM, so the read-along highlight tracks it.
        let text = narration?.text ?? null;
        if (!narration?.complete) {
          const pageText = await extractActiveTabText(request.documentUri);
          if (pageText && pageText.length > (text?.length ?? 0)) {
            text = pageText;
          }
        }
        if (!text) {
          return {
            ok: false,
            error: "This article has nothing to read aloud.",
          };
        }

        await sendReaderMessage({
          type: "play",
          documentUri: request.documentUri,
          title: narration?.title ?? request.title,
          author: narration?.author ?? null,
          text,
          voicePreference: settings.readerVoice,
        });
        return { ok: true, data: { ok: true } };
      }
      case "readerCommand": {
        const offscreen = offscreenApi();
        if (!offscreen || !(await offscreen.hasDocument())) {
          return { ok: true, data: { ok: false } };
        }
        await sendReaderMessage(request.command);
        if (request.command.type === "stop") {
          // Tear the document down so the loaded model's memory is released.
          await offscreen.closeDocument();
          relayReaderCleared();
        }
        return { ok: true, data: { ok: true } };
      }
      case "readerGetState": {
        const offscreen = offscreenApi();
        if (!offscreen) {
          return { ok: true, data: { supported: false, snapshot: null } };
        }
        if (!(await offscreen.hasDocument())) {
          return { ok: true, data: { supported: true, snapshot: null } };
        }
        const snapshot = await sendReaderMessage<ReaderSnapshot>({
          type: "getState",
        });
        return { ok: true, data: { supported: true, snapshot } };
      }
      case "readerGetSentences": {
        const offscreen = offscreenApi();
        if (!offscreen || !(await offscreen.hasDocument())) {
          return { ok: true, data: { documentUri: null, sentences: [] } };
        }
        const data = await sendReaderMessage<ReaderSentencesResult>({
          type: "getSentences",
        });
        return { ok: true, data };
      }
      case "getSettings": {
        const data = await loadSettings();
        return { ok: true, data };
      }
      case "saveSettings": {
        const previous = await loadSettings();
        await browser.storage.sync.set(request.settings);
        const data = await loadSettings();
        if (
          request.settings.apiOrigin !== undefined &&
          request.settings.apiOrigin !== previous.apiOrigin
        ) {
          await clearResolveCache();
        }
        return { ok: true, data };
      }
      default: {
        return { ok: false, error: "Unknown request" };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return { ok: false, error: message };
  }
}

export default defineBackground(() => {
  setupContextMenus();

  void getSessionCached(fetchSession);
  void warmActiveTabPopupState();
  void syncReaderActionIconOnStartup();

  browser.runtime.onInstalled.addListener(() => {
    setupContextMenus();
    void warmActiveTabPopupState();
  });

  browser.runtime.onStartup.addListener(() => {
    void getSessionCached(fetchSession);
    void warmActiveTabPopupState();
  });

  browser.runtime.onMessage.addListener((request: unknown) => {
    // Relay reader state to read-along tabs; don't claim the response channel.
    if (isReaderStateBroadcast(request)) {
      relayReaderState(request.snapshot);
      return;
    }
    // Offscreen-reader commands aren't ours — leave the response channel for
    // the offscreen document.
    const message = request as { type?: string; target?: string };
    if (message.target === READER_TARGET) {
      return;
    }
    return handleMessage(request as BgRequest);
  });

  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    const tab = await browser.tabs.get(tabId);
    await refreshTabBadge(tabId, tab.url);
  });

  browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === "complete") {
      await refreshTabBadge(tabId, tab.url);
    }
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    const targetUrl = info.linkUrl ?? info.pageUrl;
    if (!targetUrl) return;

    if (info.menuItemId === MENU_SAVE || info.menuItemId === MENU_OPEN) {
      const result = await resolveWithCache(targetUrl);
      const session = await fetchSession();

      if (result.kind === "article") {
        if (info.menuItemId === MENU_SAVE) {
          await handleBookmark(result.documentUri, true, session.signedIn);
        } else {
          const origin = await getEffectiveApiOrigin();
          const href = result.readerUrl.startsWith("http")
            ? result.readerUrl
            : `${origin}${result.readerUrl}`;
          await browser.tabs.create({ url: href });
        }
        return;
      }

      if (result.kind === "publication" && info.menuItemId === MENU_SAVE) {
        await handleFollow(result.publicationUri, true, session.signedIn);
        return;
      }

      if (info.menuItemId === MENU_OPEN && result.kind === "reader-link") {
        const origin = await getEffectiveApiOrigin();
        const href = result.readerUrl.startsWith("http")
          ? result.readerUrl
          : `${origin}${result.readerUrl}`;
        await browser.tabs.create({ url: href });
        return;
      }

      if (tab?.id) {
        await browser.action.openPopup();
      }
    }
  });

  browser.cookies.onChanged.addListener((changeInfo) => {
    if (
      changeInfo.cookie.name === "standard-reader-auth.session_token" &&
      !changeInfo.removed
    ) {
      invalidateSessionCache();
      void clearResolveCache().then(() => processPendingActions());
    }
  });
});

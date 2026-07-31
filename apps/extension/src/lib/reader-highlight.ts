import type { HighlightMap } from "#/lib/page-reader/word-highlight";
import {
  buildHighlightMap,
  clearWordHighlight,
  matchedSentenceCount,
  rangeForSentence,
  scrollWordIntoView,
  setWordHighlight,
} from "#/lib/page-reader/word-highlight";

import { sendMessage } from "./messaging";
import type { ReaderSnapshot } from "./reader-messaging";
import { isReaderTabState } from "./reader-messaging";

/** Throttle for (re)building the DOM↔sentence map while it isn't ready yet. */
const BUILD_RETRY_MS = 300;

const SCROLL_UNLOCK_KEYS = new Set([
  " ",
  "ArrowDown",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

/** Same translucent amber as the app's `::highlight(reader-word)` rule. */
const HIGHLIGHT_CSS =
  "::highlight(reader-word) { background-color: oklch(0.86 0.16 92 / 0.25); }";

/**
 * Read-along highlighting on publication pages — the same experience as the
 * app's reader view. The background relays the offscreen engine's state to
 * this tab while its article is playing; we align the narration sentences to
 * the page DOM with the app's `word-highlight` module, light the current
 * sentence, and follow it with the scroll until the user scrolls themselves.
 */
export function initReaderHighlight(): void {
  let activeUri: string | null = null;
  let sentences: Array<string> | null = null;
  let fetchingSentences = false;
  let map: HighlightMap | null = null;
  let lastBuildAt = 0;
  let lastSentence = -1;
  let follow = true;
  let styleEl: HTMLStyleElement | null = null;

  const ensureStyle = () => {
    if (styleEl?.isConnected) return;
    styleEl = document.createElement("style");
    styleEl.textContent = HIGHLIGHT_CSS;
    document.head.append(styleEl);
  };

  const reset = () => {
    if (activeUri === null) return;
    activeUri = null;
    sentences = null;
    map = null;
    lastBuildAt = 0;
    lastSentence = -1;
    follow = true;
    clearWordHighlight();
  };

  const loadSentences = (documentUri: string) => {
    if (fetchingSentences) return;
    fetchingSentences = true;
    void sendMessage({ type: "readerGetSentences" })
      .then(async (result) => {
        if (
          result.documentUri === documentUri &&
          activeUri === documentUri &&
          result.sentences.length > 0
        ) {
          sentences = result.sentences;
          // Relays are change-driven; pull the current position so the
          // highlight starts now rather than at the next sentence boundary.
          const state = await sendMessage({ type: "readerGetState" });
          if (state.snapshot) handleSnapshot(state.snapshot);
        }
      })
      .catch(() => {})
      .finally(() => {
        fetchingSentences = false;
      });
  };

  const handleSnapshot = (snapshot: ReaderSnapshot) => {
    const { status } = snapshot.state;
    const documentUri = snapshot.nowPlaying?.documentUri ?? null;
    if (!documentUri || status === "idle" || status === "error") {
      reset();
      return;
    }

    if (activeUri !== documentUri) {
      reset();
      activeUri = documentUri;
    }

    if (!sentences) {
      loadSentences(documentUri);
      return;
    }

    const progress = snapshot.progress;
    if (!progress) return;

    if (!map) {
      const now = Date.now();
      if (now - lastBuildAt < BUILD_RETRY_MS) return;
      lastBuildAt = now;
      const built = buildHighlightMap(document.body, sentences);
      if (matchedSentenceCount(built) === 0) return;
      map = built;
    }

    const run = map.sentenceTokens[progress.index];
    if (!run) return;
    if (progress.index === lastSentence) return;

    const range = rangeForSentence(map, run);
    if (!range) {
      // DOM changed under us; rebuild on a later relay.
      map = null;
      return;
    }
    lastSentence = progress.index;

    ensureStyle();
    setWordHighlight(range);
    if (follow && status === "playing") {
      scrollWordIntoView(range, document.body);
    }
  };

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (isReaderTabState(message)) handleSnapshot(message.snapshot);
  });

  // Auto-follow stops on user-initiated scrolling and re-arms with the next
  // read-along session (mirrors the app's scroll lock, minus the re-lock FAB).
  const unlock = () => {
    follow = false;
  };
  globalThis.addEventListener("wheel", unlock, { passive: true });
  globalThis.addEventListener("touchmove", unlock, { passive: true });
  globalThis.addEventListener("keydown", (event) => {
    if (SCROLL_UNLOCK_KEYS.has(event.key)) unlock();
  });
}

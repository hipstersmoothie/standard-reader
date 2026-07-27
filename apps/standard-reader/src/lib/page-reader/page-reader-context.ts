import { createContext, use } from "react";

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";

import type { ReaderState } from "./page-reader-engine";

/** Metadata for the article currently loaded into the player. */
export interface NowPlaying {
  uri: string;
  /** Route params for the article (empty when the URI can't be parsed). */
  did: string;
  rkey: string;
  title: string;
  publicationName: string | null;
  author: string | null;
}

export interface PageReaderContextValue {
  state: ReaderState;
  /** True once an article is loaded (controls the global player bar). */
  active: boolean;
  /** The article currently loaded into the player, if any. */
  nowPlaying: NowPlaying | null;
  /** Read the given article from the top (or resume if already loaded). */
  playArticle: (article: ArticleDetail) => void;
  /** Read the given article starting from a selected passage. */
  playFromSelection: (article: ArticleDetail, selectionText: string) => void;
  /**
   * Read an arbitrary passage of text (e.g. a marketing demo) aloud with the
   * app's own voice, surfaced in the global player like any article.
   */
  playSample: (sample: {
    uri: string;
    title: string;
    publicationName?: string | null;
    author?: string | null;
    text: string;
  }) => void;
  /** Re-prepare the last article after an error. */
  retry: () => void;
  /** Sentences currently loaded for playback (in narration order). */
  getSentences: () => Array<string>;
  /** Current sentence index + 0..1 progress within it (for word highlight). */
  getProgress: () => { index: number; fraction: number } | null;
  toggle: () => void;
  skip: (seconds: number) => void;
  seekTo: (seconds: number) => void;
  setRate: (rate: number) => void;
  stop: () => void;
  /** When true, the article view auto-scrolls to the active word while playing. */
  scrollLocked: boolean;
  /** Stop auto-scrolling after the user scrolls manually. */
  unlockScroll: () => void;
  /** Re-enable auto-scroll and jump to the active word. */
  lockScroll: () => void;
}

export const PageReaderContext = createContext<PageReaderContextValue | null>(
  null,
);

export function usePageReader(): PageReaderContextValue {
  const context = use(PageReaderContext);
  if (!context) {
    throw new Error("usePageReader must be used within a PageReaderProvider");
  }
  return context;
}

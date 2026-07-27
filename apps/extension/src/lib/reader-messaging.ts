import type { ReaderState } from "#/lib/page-reader/page-reader-engine";
import type { ReaderVoicePreference } from "#/lib/reader-voice";

/** Marker for messages addressed to the offscreen reader document. */
export const READER_TARGET = "sr-reader";
/** Message type the offscreen reader broadcasts on every state change. */
export const READER_STATE_BROADCAST = "sr-reader-state";
/** Message type the background relays to content scripts on article tabs. */
export const READER_TAB_STATE = "sr-reader-tab-state";

export type ReaderNowPlaying = {
  documentUri: string;
  title: string;
};

/** Transport controls forwarded from the popup to the engine untouched. */
export type ReaderTransportCommand =
  | { type: "toggle" }
  | { type: "retry" }
  | { type: "stop" }
  | { type: "skip"; seconds: number }
  | { type: "seekTo"; seconds: number }
  | { type: "setRate"; rate: number };

export type ReaderMessageBody =
  | ReaderTransportCommand
  | {
      type: "play";
      documentUri: string;
      title: string;
      /** Narration author; drives the auto voice pick (same as the app). */
      author: string | null;
      text: string;
      voicePreference: ReaderVoicePreference;
    }
  | { type: "getState" }
  | { type: "getSentences" };

export type OffscreenReaderMessage = ReaderMessageBody & {
  target: typeof READER_TARGET;
};

export type ReaderSnapshot = {
  state: ReaderState;
  nowPlaying: ReaderNowPlaying | null;
  /**
   * Current narration position (sentence index + 0..1 fraction through its
   * audio) — drives the content script's read-along highlight. Null until the
   * first chunk of audio exists.
   */
  progress: { index: number; fraction: number } | null;
};

/** Answer to `getSentences`: narration sentences for the loaded article. */
export type ReaderSentencesResult = {
  documentUri: string | null;
  sentences: Array<string>;
};

export type ReaderStateBroadcast = {
  type: typeof READER_STATE_BROADCAST;
  snapshot: ReaderSnapshot;
};

/** Background → content-script relay for the tab showing the playing article. */
export type ReaderTabStateMessage = {
  type: typeof READER_TAB_STATE;
  snapshot: ReaderSnapshot;
};

export function isReaderStateBroadcast(
  message: unknown,
): message is ReaderStateBroadcast {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === READER_STATE_BROADCAST
  );
}

export function isReaderTabState(
  message: unknown,
): message is ReaderTabStateMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === READER_TAB_STATE
  );
}

/** Popup-facing answer to `readerGetState`. */
export type ReaderStateResult = {
  /** False when the browser has no offscreen API (Firefox). */
  supported: boolean;
  /** Null when no offscreen reader is running. */
  snapshot: ReaderSnapshot | null;
};

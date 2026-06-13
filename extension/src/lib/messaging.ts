import type { PopupStateResponse } from "./popup-state";
import type {
  ReaderSentencesResult,
  ReaderStateResult,
  ReaderTransportCommand,
} from "./reader-messaging";
import type {
  ExtensionResolveResult,
  ExtensionSessionResponse,
  ExtensionSettings,
} from "./types";

export type PendingAction =
  | { kind: "bookmark"; documentUri: string; save: boolean }
  | { kind: "follow"; publicationUri: string; follow: boolean }
  | { kind: "recommend"; documentUri: string; recommend: boolean };

export type BgRequest =
  | {
      type: "resolve";
      url: string;
      hints?: { documentUri?: string | null; publicationUri?: string | null };
      refresh?: boolean;
    }
  | { type: "resolveBatch"; urls: Array<string> }
  | { type: "resolveActiveTab" }
  | { type: "getPopupState"; refresh?: boolean }
  | {
      type: "bookmark";
      documentUri: string;
      save: boolean;
      resolveUrl?: string;
    }
  | {
      type: "recommend";
      documentUri: string;
      recommend: boolean;
      resolveUrl?: string;
      recommendCount?: number;
    }
  | { type: "follow"; publicationUri: string; follow: boolean }
  | { type: "getSession" }
  | { type: "openLogin" }
  | { type: "loginComplete" }
  | { type: "openReader"; url: string }
  | { type: "getSettings" }
  | { type: "saveSettings"; settings: Partial<ExtensionSettings> }
  | { type: "readerPlay"; documentUri: string; title: string }
  | { type: "readerCommand"; command: ReaderTransportCommand }
  | { type: "readerGetState" }
  | { type: "readerGetSentences" };

export type BgResponse =
  | { ok: true; data: ExtensionResolveResult }
  | { ok: true; data: Record<string, ExtensionResolveResult> }
  | { ok: true; data: ExtensionSessionResponse }
  | { ok: true; data: ExtensionSettings }
  | {
      ok: true;
      data: { tabUrl: string | null; result: ExtensionResolveResult };
    }
  | { ok: true; data: PopupStateResponse }
  | { ok: true; data: ReaderStateResult }
  | { ok: true; data: ReaderSentencesResult }
  | { ok: true; data: { ok: boolean } }
  | { ok: false; error: string };

type BgResponseData<T extends BgRequest["type"]> = T extends "getSettings"
  ? ExtensionSettings
  : T extends "saveSettings"
    ? ExtensionSettings
    : T extends "getSession"
      ? ExtensionSessionResponse
      : T extends "resolve"
        ? ExtensionResolveResult
        : T extends "resolveBatch"
          ? Record<string, ExtensionResolveResult>
          : T extends "resolveActiveTab"
            ? { tabUrl: string | null; result: ExtensionResolveResult }
            : T extends "getPopupState"
              ? PopupStateResponse
              : T extends "readerGetState"
                ? ReaderStateResult
                : T extends "readerGetSentences"
                  ? ReaderSentencesResult
                  : T extends
                        | "bookmark"
                        | "recommend"
                        | "follow"
                        | "openLogin"
                        | "loginComplete"
                        | "openReader"
                        | "readerPlay"
                        | "readerCommand"
                    ? { ok: boolean }
                    : never;

export function sendMessage<T extends BgRequest>(
  request: T,
): Promise<BgResponseData<T["type"]>> {
  return browser.runtime.sendMessage(request).then((response: BgResponse) => {
    if (!response?.ok) {
      throw new Error(
        "error" in response ? response.error : "Extension request failed",
      );
    }
    return response.data as BgResponseData<T["type"]>;
  });
}

import type { PopupStateResponse, StoredPopupState } from "./popup-state";

import { sendMessage } from "./messaging";
import { readStoredPopupState } from "./popup-state";

declare global {
  interface Window {
    __SR_POPUP_INIT__?: Promise<StoredPopupState | null>;
  }
}

function fromStored(state: StoredPopupState): PopupStateResponse {
  return {
    tabUrl: state.tabUrl,
    result: state.result,
    session: state.session,
    fromCache: true,
  };
}

export async function loadInitialPopupState(): Promise<PopupStateResponse> {
  const preloaded = await (globalThis.window?.__SR_POPUP_INIT__ ??
    Promise.resolve(null));
  if (preloaded) {
    return fromStored(preloaded);
  }

  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const tabId = tab?.id;
  const tabUrl = tab?.url ?? null;

  if (tabId != null && tabUrl) {
    const stored = await readStoredPopupState(tabId, tabUrl);
    if (stored) {
      return { ...stored, fromCache: true };
    }
  }

  return sendMessage({ type: "getPopupState", refresh: false });
}

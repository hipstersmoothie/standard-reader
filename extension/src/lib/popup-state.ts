import type { ExtensionResolveResult, ExtensionSessionResponse } from "./types";

import { getEffectiveApiOrigin } from "./config";
import { readSessionCookieValue } from "./session-cookie";

export type PopupStateResponse = {
  tabUrl: string | null;
  result: ExtensionResolveResult;
  session: ExtensionSessionResponse;
  fromCache: boolean;
};

export type StoredPopupState = {
  tabId: number;
  tabUrl: string;
  result: ExtensionResolveResult;
  session: ExtensionSessionResponse;
  at: number;
};

type TabPopupSnapshot = {
  tabUrl: string;
  result: ExtensionResolveResult;
};

const SESSION_TTL_MS = 5 * 60 * 1000;
export const POPUP_STATE_KEY = "srPopupState";

const SIGNED_OUT: ExtensionSessionResponse = {
  signedIn: false,
  handle: null,
  name: null,
  image: null,
  did: null,
};

const tabSnapshots = new Map<number, TabPopupSnapshot>();
let sessionCache: { value: ExtensionSessionResponse; at: number } | null = null;

export function invalidateSessionCache(): void {
  sessionCache = null;
}

export async function clearTabSnapshots(): Promise<void> {
  tabSnapshots.clear();
  try {
    await browser.storage.session.remove(POPUP_STATE_KEY);
  } catch {
    // session storage unavailable
  }
}

export function rememberTabSnapshot(
  tabId: number,
  tabUrl: string,
  result: ExtensionResolveResult,
): void {
  tabSnapshots.set(tabId, { tabUrl, result });
}

export async function persistPopupState(
  tabId: number,
  tabUrl: string,
  result: ExtensionResolveResult,
  session: ExtensionSessionResponse,
): Promise<void> {
  try {
    await browser.storage.session.set({
      [POPUP_STATE_KEY]: {
        tabId,
        tabUrl,
        result,
        session,
        at: Date.now(),
      } satisfies StoredPopupState,
    });
  } catch {
    // session storage unavailable
  }
}

export async function readStoredPopupState(
  tabId: number,
  tabUrl: string,
): Promise<Omit<PopupStateResponse, "fromCache"> | null> {
  try {
    const stored = await browser.storage.session.get(POPUP_STATE_KEY);
    const state = stored[POPUP_STATE_KEY] as StoredPopupState | undefined;
    if (!state || state.tabId !== tabId || state.tabUrl !== tabUrl) {
      return null;
    }
    return {
      tabUrl: state.tabUrl,
      result: state.result,
      session: state.session,
    };
  } catch {
    return null;
  }
}

export function getTabSnapshot(
  tabId: number,
  tabUrl: string,
): ExtensionResolveResult | null {
  const snapshot = tabSnapshots.get(tabId);
  if (!snapshot || snapshot.tabUrl !== tabUrl) return null;
  return snapshot.result;
}

export async function getSessionCached(
  fetchSession: () => Promise<ExtensionSessionResponse>,
  refresh = false,
): Promise<ExtensionSessionResponse> {
  if (
    !refresh &&
    sessionCache &&
    Date.now() - sessionCache.at < SESSION_TTL_MS
  ) {
    return sessionCache.value;
  }

  if (!refresh) {
    const origin = await getEffectiveApiOrigin();
    const token = await readSessionCookieValue(origin);
    if (!token) {
      sessionCache = { value: SIGNED_OUT, at: Date.now() };
      return SIGNED_OUT;
    }
  }

  const value = await fetchSession();
  sessionCache = { value, at: Date.now() };
  return value;
}

export function seedSessionCache(session: ExtensionSessionResponse): void {
  sessionCache = { value: session, at: Date.now() };
}

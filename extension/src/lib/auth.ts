import type { PendingAction } from "./messaging";

import { LOGIN_PATH, getEffectiveApiOrigin } from "./config";
import { readSessionCookieValue } from "./session-cookie";

export async function getSessionCookie(): Promise<string | null> {
  const origin = await getEffectiveApiOrigin();
  return (await readSessionCookieValue(origin)) ?? null;
}

export async function openLoginTab(): Promise<number | undefined> {
  const origin = await getEffectiveApiOrigin();
  const tab = await browser.tabs.create({ url: `${origin}${LOGIN_PATH}` });
  return tab.id;
}

export async function queuePendingAction(action: PendingAction): Promise<void> {
  await browser.storage.session.set({ pendingAction: action });
}

export async function consumePendingAction(): Promise<PendingAction | null> {
  const stored = await browser.storage.session.get("pendingAction");
  const action = stored.pendingAction as PendingAction | undefined;
  if (action) {
    await browser.storage.session.remove("pendingAction");
  }
  return action ?? null;
}

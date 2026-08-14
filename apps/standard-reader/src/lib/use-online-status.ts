"use client";

import { useSyncExternalStore } from "react";

import { isOnline, subscribeToOnlineStatus } from "#/lib/online-status";

/**
 * Whether the app can currently reach the network.
 *
 * Thin subscription over {@link isOnline} — see `online-status.ts` for why the
 * verdict is a probed one rather than `navigator.onLine`, which some Android
 * WebView browsers report as `false` forever on a working connection.
 *
 * The server snapshot is `true` and the client's first snapshot matches it on
 * purpose: `navigator` does not exist during SSR, and rendering an "offline"
 * state into server markup that the client then has to undo is a hydration
 * mismatch on every request. `false` still means "definitely offline"; it just
 * arrives after a failed request rather than on a flag's say-so.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeToOnlineStatus, isOnline, () => true);
}

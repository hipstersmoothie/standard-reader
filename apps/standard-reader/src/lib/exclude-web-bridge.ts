/**
 * "Bridged accounts" preference — how much of Bridgy Fed one reader hides from
 * every network-wide surface. A {@link BridgeExclusion}:
 *
 * - `false` — show everything (the signed-in default).
 * - `"web"` — hide the bulk web bridge (`*.web.brid.gy`) only. Those repos are
 *   sites Bridgy discovered and mirrored; nobody at them asked to be here (see
 *   `#/lib/atproto/bridged-repo`). They are also the overwhelming majority of
 *   the corpus — at time of writing 2.57M of 2.99M documents and 5,227 of
 *   14,869 publications — so a reader who does not want them wants them gone
 *   from Latest "All", Discover, search and tag pages, not filtered a page at
 *   a time. `*.ap.brid.gy` authors opted into the bridge, so this keeps them.
 * - `"all"` — hide every `*.brid.gy` repo, the opted-in bridge included, for a
 *   reader who wants only writing published natively to AT Protocol. It is
 *   also what a signed-out visitor always gets.
 *
 * Deliberately **not** applied to anything the reader chose: their
 * subscriptions feed, a publication page they opened, an article they clicked.
 * Subscribing to a bridged site is an explicit "yes, this one", and a setting
 * about discovery should not quietly retract it.
 *
 * Persisted across two nullable booleans on `user` — `exclude_web_bridge` (the
 * original, web-only setting) and `exclude_all_bridges` (added later, wins when
 * set) — so the older column keeps its meaning and no backfill is needed.
 * Account-level only: there is no cookie mirror.
 */

import type { BridgeExclusion } from "#/lib/atproto/bridged-repo";

export const DEFAULT_BRIDGE_EXCLUSION: BridgeExclusion = false;

export const BRIDGE_EXCLUSION_OPTIONS = ["show", "web", "all"] as const;

/** A {@link BridgeExclusion} as a string key, for pickers and validators. */
export type BridgeExclusionKey = (typeof BRIDGE_EXCLUSION_OPTIONS)[number];

export function bridgeExclusionToKey(
  exclusion: BridgeExclusion,
): BridgeExclusionKey {
  return exclusion === false ? "show" : exclusion;
}

export function bridgeExclusionFromKey(
  key: BridgeExclusionKey,
): BridgeExclusion {
  return key === "show" ? false : key;
}

export function isBridgeExclusionKey(
  value: unknown,
): value is BridgeExclusionKey {
  return (
    typeof value === "string" &&
    (BRIDGE_EXCLUSION_OPTIONS as ReadonlyArray<string>).includes(value)
  );
}

export function bridgeExclusionToDbValues(exclusion: BridgeExclusion): {
  excludeWebBridge: boolean;
  excludeAllBridges: boolean;
} {
  return {
    excludeWebBridge: exclusion !== false,
    excludeAllBridges: exclusion === "all",
  };
}

export function dbValuesToBridgeExclusion(row: {
  excludeWebBridge?: boolean | null;
  excludeAllBridges?: boolean | null;
}): BridgeExclusion {
  if (row.excludeAllBridges === true) return "all";
  if (row.excludeWebBridge === true) return "web";
  return false;
}

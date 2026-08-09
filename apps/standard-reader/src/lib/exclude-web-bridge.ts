/**
 * "Hide mirrored websites" preference — drops Bridgy Fed's bulk web bridge
 * (`*.web.brid.gy`) from every network-wide surface for one reader.
 *
 * Those repos are sites Bridgy discovered and mirrored; nobody at them asked to
 * be here (see `#/lib/atproto/bridged-repo`). They are also the overwhelming
 * majority of the corpus — at time of writing 2.57M of 2.99M documents and
 * 5,227 of 14,869 publications — so a reader who does not want them wants them
 * gone from Latest "All", Discover, search and tag pages, not filtered a page at
 * a time.
 *
 * Deliberately **not** applied to anything the reader chose: their
 * subscriptions feed, a publication page they opened, an article they clicked.
 * Subscribing to a mirrored site is an explicit "yes, this one", and a setting
 * about discovery should not quietly retract it.
 *
 * `*.ap.brid.gy` is never touched — those authors opted into the bridge, and
 * they are squarely what this reader is for.
 *
 * Persisted on `user.exclude_web_bridge` (`null`/`false` = show, the default —
 * today's behaviour for everyone). Account-level only: there is no cookie
 * mirror, so guests and signed-out sessions always get the default.
 */

export const DEFAULT_EXCLUDE_WEB_BRIDGE = false;

export function excludeWebBridgeToDbValue(enabled: boolean): boolean {
  return enabled;
}

export function dbValueToExcludeWebBridge(
  value: boolean | null | undefined,
): boolean {
  return value === true;
}

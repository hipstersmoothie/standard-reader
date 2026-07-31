/**
 * Bridgy Fed repos, and the lane they belong in.
 *
 * [Bridgy Fed](https://fed.brid.gy) mirrors the wider web into AT Protocol, and
 * its two bridges behave very differently:
 *
 * - **`*.web.brid.gy`** — a website Bridgy discovered and mirrored. Tens of
 *   thousands of them, thousands of posts each, and nobody at that site asked
 *   for a publication or verified one. This is the bulk.
 * - **`*.ap.brid.gy`** — an ActivityPub blog whose author *chose* to bridge.
 *   Small in number, and squarely the sort of writing this reader is for.
 *
 * Both are welcome; what they cannot do is share a queue with everyone else.
 * Pointing the bulk bridge at the main tap put publishers and readers behind
 * its backfill *inside tap's resyncer*, and repos silently sat weeks behind
 * their PDS while tap still reported them `active`. So bridged repos get their
 * own tap instance — their own resync queue, their own volume — and a bridge
 * backfill can then only ever delay other bridged repos.
 *
 * The distinction is drawn on the handle because that is the only place the two
 * bridges differ: both are served by the same PDS (`https://atproto.brid.gy`),
 * so the service endpoint cannot tell them apart.
 */

/** Handle suffix shared by every Bridgy Fed bridge. */
export const BRIDGE_HANDLE_SUFFIX = ".brid.gy";

/** Handle suffix of Bridgy's web bridge — mirrored sites, the bulk of it. */
export const WEB_BRIDGE_HANDLE_SUFFIX = ".web.brid.gy";

function endsWithSuffix(
  handle: string | null | undefined,
  suffix: string,
): boolean {
  if (!handle) return false;
  return handle.toLowerCase().endsWith(suffix);
}

/**
 * True for any Bridgy Fed repo — the repos that belong in the bridge lane.
 *
 * A null/unknown handle is never bridged. Identity resolution fails for plenty
 * of ordinary reasons, and misrouting a real publisher because their DID
 * document was briefly unreachable is worse than either alternative, so an
 * unresolved handle takes the main lane.
 */
export function isBridgedHandle(handle: string | null | undefined): boolean {
  return endsWithSuffix(handle, BRIDGE_HANDLE_SUFFIX);
}

/** True for Bridgy's high-volume web bridge specifically. */
export function isWebBridgeHandle(handle: string | null | undefined): boolean {
  return endsWithSuffix(handle, WEB_BRIDGE_HANDLE_SUFFIX);
}

/**
 * Whether to turn this repo away entirely.
 *
 * Only the bulk web bridge, and only while there is no bridge lane to put it
 * in: with `TAP_BRIDGE_API_URL` configured the repo is routed there instead and
 * nothing is excluded. This is what makes the isolated lane the thing that
 * turns Bridgy fully back on, rather than a second switch to remember.
 *
 * `ap.brid.gy` is never excluded — those authors opted in, and the volume was
 * never the problem.
 */
export function isExcludedBridgeHandle(
  handle: string | null | undefined,
  { hasBridgeLane }: { hasBridgeLane: boolean },
): boolean {
  if (hasBridgeLane) return false;
  return isWebBridgeHandle(handle);
}

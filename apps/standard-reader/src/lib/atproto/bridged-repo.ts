/**
 * Bridgy Fed repos, and how the read-model treats them.
 *
 * [Bridgy Fed](https://fed.brid.gy) mirrors the wider web into AT Protocol, and
 * its two bridges behave very differently:
 *
 * - **`*.web.brid.gy`** — a website Bridgy discovered and mirrored. Tens of
 *   thousands of them, thousands of posts each, and nobody at that site asked
 *   for a publication or verified one. This is the bulk: it is the overwhelming
 *   majority of indexed documents.
 * - **`*.ap.brid.gy`** — an ActivityPub blog whose author *chose* to bridge.
 *   Small in number, and squarely the sort of writing this reader is for.
 *
 * Both are indexed; what the web bridge does not get is a place in the curated
 * surfaces, which is what {@link WEB_BRIDGE_HANDLE_PATTERN} is for — every feed,
 * directory, and topic derivation excludes it by handle.
 *
 * The distinction is drawn on the handle because that is the only place the two
 * bridges differ: both are served by the same PDS (`https://atproto.brid.gy`),
 * so the service endpoint cannot tell them apart.
 *
 * Ingestion used to care too: tap only streamed repos we registered with it, so
 * bulk-bridge volume had to be routed to a dedicated tap instance or turned away
 * outright, and this module owned that routing. Jetstream subscribes by
 * collection across the whole network, so there is no queue to protect and no
 * lane to assign — the routing helpers are gone and only the display-side
 * distinction remains.
 */

/** Handle suffix shared by every Bridgy Fed bridge. */
export const BRIDGE_HANDLE_SUFFIX = ".brid.gy";

/** Handle suffix of Bridgy's web bridge — mirrored sites, the bulk of it. */
export const WEB_BRIDGE_HANDLE_SUFFIX = ".web.brid.gy";

/**
 * SQL `ILIKE` pattern for {@link WEB_BRIDGE_HANDLE_SUFFIX}, for the read-model
 * queries that exclude passively mirrored sites (see the topic derivation
 * and its feed in `#/server/reader/topics`).
 *
 * Lives here so every such query spells the exclusion the same way — the
 * derivation and the topic article feed drifted apart once already.
 */
export const WEB_BRIDGE_HANDLE_PATTERN = `%${WEB_BRIDGE_HANDLE_SUFFIX}`;

/** SQL `ILIKE` pattern matching *every* Bridgy bridge, web and ActivityPub. */
export const BRIDGE_HANDLE_PATTERN = `%${BRIDGE_HANDLE_SUFFIX}`;

/**
 * How much of Bridgy Fed a network-wide read-model query hides.
 *
 * - `false` — nothing. The signed-in default: both bridges are indexed and a
 *   reader who has not said otherwise sees them.
 * - `"web"` — the bulk mirrors only (`*.web.brid.gy`). What the reader-facing
 *   "Hide mirrored websites" setting turns on, and all it has ever meant:
 *   `*.ap.brid.gy` authors chose to be here, so the setting keeps them.
 * - `"all"` — every `*.brid.gy` repo, both bridges. The **signed-out** app:
 *   a reader with no account has expressed no preferences and subscribed to
 *   nobody, so the network surfaces they land on show only writing published
 *   natively to AT Protocol. Signing in restores the bridges, and the setting
 *   above then governs the mirrors.
 *
 * Scoped per request rather than baked into the filters because the two
 * audiences want different corpora out of the same queries.
 */
export type BridgeExclusion = false | "web" | "all";

/**
 * The exclusion a **curated** surface uses — the Discover rails and the digest,
 * which drop the bulk mirrors for everybody because "here is a suggestion" and
 * "nobody at this site asked to be suggested" do not go together.
 *
 * Never narrows: a signed-out reader hiding every bridge keeps hiding every
 * bridge on those surfaces too.
 */
export function curatedBridgeExclusion(
  exclusion: BridgeExclusion,
): Exclude<BridgeExclusion, false> {
  return exclusion === "all" ? "all" : "web";
}

/** The `ILIKE` pattern an active {@link BridgeExclusion} filters on. */
export function bridgeHandlePattern(
  exclusion: Exclude<BridgeExclusion, false>,
): string {
  return exclusion === "all"
    ? BRIDGE_HANDLE_PATTERN
    : WEB_BRIDGE_HANDLE_PATTERN;
}

function endsWithSuffix(
  handle: string | null | undefined,
  suffix: string,
): boolean {
  if (!handle) return false;
  return handle.toLowerCase().endsWith(suffix);
}

/**
 * True for Bridgy's high-volume web bridge specifically.
 *
 * A null/unknown handle is never treated as bridged. Identity resolution fails
 * for plenty of ordinary reasons, and hiding a real publisher because their DID
 * document was briefly unreachable is the worse mistake.
 */
export function isWebBridgeHandle(handle: string | null | undefined): boolean {
  return endsWithSuffix(handle, WEB_BRIDGE_HANDLE_SUFFIX);
}

/** True for any Bridgy Fed repo — both bridges. */
export function isBridgeHandle(handle: string | null | undefined): boolean {
  return endsWithSuffix(handle, BRIDGE_HANDLE_SUFFIX);
}

/** True when `exclusion` would hide `handle`. `false` hides nothing. */
export function isExcludedBridgeHandle(
  handle: string | null | undefined,
  exclusion: BridgeExclusion,
): boolean {
  if (!exclusion) return false;
  return exclusion === "all"
    ? isBridgeHandle(handle)
    : isWebBridgeHandle(handle);
}

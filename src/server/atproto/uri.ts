/**
 * Minimal AT-URI helpers. An AT-URI looks like:
 *
 *   at://<authority>/<collection>/<rkey>
 *
 * where `authority` is a DID (we don't resolve handle-authorities here — `tap`
 * always emits DIDs). We avoid pulling in `@atproto/syntax` for these few ops.
 */

import { APP_NSID, STANDARD_NSID } from "../../lib/atproto/nsids.ts";

export interface ParsedAtUri {
  did: string;
  collection: string;
  rkey: string;
}

/** Standard.site / app collection NSIDs we care about. */
export const Collections = {
  publication: STANDARD_NSID.publication,
  document: STANDARD_NSID.document,
  subscription: STANDARD_NSID.subscription,
  recommend: STANDARD_NSID.recommend,
  theme: "site.standard.theme.basic",
  bskyProfile: "app.bsky.actor.profile",
  read: APP_NSID.read,
  bookmark: APP_NSID.bookmark,
  collection: APP_NSID.collection,
  collectionsPublication: APP_NSID.collectionsPublication,
  publicationTheme: APP_NSID.publicationTheme,
  labelerSubscription: APP_NSID.labelerSubscription,
} as const;

export type KnownCollection = (typeof Collections)[keyof typeof Collections];

/**
 * Parse a full record AT-URI into its parts. Returns null for anything that
 * isn't a well-formed `at://did/<collection>/<rkey>` (e.g. https:// site URLs
 * or repo/collection-level URIs).
 */
export function parseAtUri(uri: string): ParsedAtUri | null {
  if (typeof uri !== "string" || !uri.startsWith("at://")) {
    return null;
  }
  const rest = uri.slice("at://".length);
  const slash = rest.indexOf("/");
  if (slash === -1) {
    return null;
  }
  const did = rest.slice(0, slash);
  const after = rest.slice(slash + 1);
  const nextSlash = after.indexOf("/");
  if (nextSlash === -1) {
    return null;
  }
  const collection = after.slice(0, nextSlash);
  const rkey = after.slice(nextSlash + 1);
  if (!did.startsWith("did:") || collection.length === 0 || rkey.length === 0) {
    return null;
  }
  return { did, collection, rkey };
}

/** Build a record AT-URI from its parts. */
export function buildAtUri(
  did: string,
  collection: string,
  rkey: string,
): string {
  return `at://${did}/${collection}/${rkey}`;
}

/** Extract just the repo DID from an AT-URI, or null. */
export function didFromAtUri(uri: string): string | null {
  return parseAtUri(uri)?.did ?? null;
}

/** Whether a document `site` value is an at:// publication reference (vs an
 * https:// loose-document site URL). */
export function isAtUri(value: string): boolean {
  return typeof value === "string" && value.startsWith("at://");
}

/**
 * AT Protocol collection NSIDs Standard Reader reads and writes.
 *
 * Client-safe (no server-only imports), so it can be referenced from query keys
 * in the UI as well as from server functions and the tap ingester. Keep this the
 * single source of truth — `src/server/atproto/uri.ts` re-exports these into its
 * `Collections` map for the ingester.
 */

/**
 * App-owned lexicons under the `app.standard-reader` namespace — the reader's
 * personal state that we write back to their repo (see `APP_VISION.md` §5).
 *
 * `labelerSubscription` (the flat NSID) is the original published collection;
 * `labelerSubscriptionV2` (`app.standard-reader.labeler.subscription`) is the
 * successor, nested under the `labeler` NSID group so a single
 * `_lexicon.labeler.standard-reader.app` DNS record covers the whole family
 * (`labeler.defs`, `labeler.service`, `labeler.subscription`). New writes go
 * to V2; reads accept both until per-reader migration completes (see the lazy
 * migration on the labeler write path). The flat NSID stays published for
 * backwards compatibility with already-authorized sessions and existing repo
 * records until Phase 2 deprecation.
 */
export const APP_NSID = {
  read: "app.standard-reader.read",
  bookmark: "app.standard-reader.bookmark",
  list: "app.standard-reader.list",
  listSave: "app.standard-reader.listSave",
  collection: "app.standard-reader.collection",
  collectionsPublication: "app.standard-reader.collectionsPublication",
  publicationTheme: "app.standard-reader.publicationTheme",
  labelerSubscription: "app.standard-reader.labelerSubscription",
  labelerSubscriptionV2: "app.standard-reader.labeler.subscription",
  labelerService: "app.standard-reader.labeler.service",
} as const;

/**
 * `standard.site` lexicons we reuse. `subscription` is the only one we *write*
 * (a follow); the rest are read-model only.
 */
export const STANDARD_NSID = {
  publication: "site.standard.publication",
  document: "site.standard.document",
  subscription: "site.standard.graph.subscription",
  recommend: "site.standard.graph.recommend",
} as const;

/** Every collection NSID we map, app-owned + reused. */
export const COLLECTION = {
  ...STANDARD_NSID,
  ...APP_NSID,
} as const;

export type AppNsid = (typeof APP_NSID)[keyof typeof APP_NSID];
export type StandardNsid = (typeof STANDARD_NSID)[keyof typeof STANDARD_NSID];

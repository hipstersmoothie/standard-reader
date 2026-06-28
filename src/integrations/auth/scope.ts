import { scope as atprotoScope } from "@atcute/oauth-node-client";

/** Required on every ATProto OAuth session (see atproto.com/specs/oauth). */
export const ATPROTO_BASE_SCOPE = "atproto";

/**
 * Blob upload for image-bearing records. The `blob` resource cannot live
 * inside a permission set, so it's always requested as a granular scope
 * alongside the `include:` sets.
 */
const BLOB_SCOPE = atprotoScope.blob({ accept: ["image/*"] });

/**
 * Permission-set scope strings published by Standard Reader and standard.site.
 * See APP_VISION.md §5 "OAuth scopes" for the full design.
 *
 * App-owned sets (we publish these as lexicons in `lexicons/app/standard-reader/`):
 *  - `app.standard-reader.authBasicFeatures` — reader-state: bookmark, read, list,
 *    listSave, labelerSubscription (legacy) + labeler.subscription (V2).
 *  - `app.standard-reader.authCollections` — collections-authoring state:
 *    collection, collectionsPublication, publicationTheme.
 *
 * standard.site sets (published upstream, we reference via `include:`):
 *  - `site.standard.authSocial` — site.standard.graph.subscription + .recommend
 *    (follows + likes).
 *  - `site.standard.authFull` — all four site.standard.* collections
 *    (publication + document + subscription + recommend).
 */
const AUTH_BASIC_FEATURES = "include:app.standard-reader.authBasicFeatures";
const AUTH_COLLECTIONS = "include:app.standard-reader.authCollections";
const SITE_AUTH_SOCIAL = "include:site.standard.authSocial";
const SITE_AUTH_FULL = "include:site.standard.authFull";

/**
 * Basic sign-in scope — what 95% of readers need. Covers app-owned reader-state
 * (`authBasicFeatures`) plus standard.site follows & likes (`authSocial`).
 */
export const basicScope = [
  ATPROTO_BASE_SCOPE,
  BLOB_SCOPE,
  AUTH_BASIC_FEATURES,
  SITE_AUTH_SOCIAL,
];

/**
 * Collections-authoring scope — basic plus app-owned collections state
 * (`authCollections`) and full standard.site record access (`authFull`,
 * replacing `authSocial` so publication/document writes are allowed).
 */
export const collectionsScope = [
  // basicScope minus the site.standard.authSocial set (replaced by authFull).
  ...basicScope.filter((s) => s !== SITE_AUTH_SOCIAL),
  AUTH_COLLECTIONS,
  SITE_AUTH_FULL,
];

/**
 * Minimal scope for the publication subscribe embed (subscription write only).
 * `authSocial` is the smallest published set covering `subscription`; it also
 * grants `recommend`, which matches the standard.site consent UX.
 */
export const subscribeScope = [ATPROTO_BASE_SCOPE, SITE_AUTH_SOCIAL];

/**
 * Every scope string we may request at authorize time. ATProto OAuth requires
 * each requested scope to appear in client metadata (a single-collection `repo`
 * scope is not treated as a subset of a multi-collection one; the same applies
 * to `include:` set scopes).
 */
export const clientMetadataScope = [
  ...new Set([...basicScope, ...collectionsScope, ...subscribeScope]),
];

export type AuthScopeIntent = "basic" | "collections" | "subscribe";

const SCOPE_BY_INTENT: Record<AuthScopeIntent, Array<string>> = {
  basic: basicScope,
  collections: collectionsScope,
  subscribe: subscribeScope,
};

/** Serialize OAuth scope entries for the authorize request. */
export function formatOAuthScope(entries: Array<string>): string {
  return entries.join(" ");
}

/**
 * User row shape consulted for progressive scope upgrades. Only the
 * `collectionsAuthoringEnabled` flag is read here.
 */
export interface ScopeUserLookup {
  collectionsAuthoringEnabled: boolean | null;
}

/**
 * Resolve the OAuth scope string for an authorize request. If the user has
 * opted into collections authoring (the flag is set on their `user` row),
 * automatically upgrade to the collections tier so subsequent logins silently
 * include the expanded scopes. Explicit `intent: "collections"` (the upgrade
 * flow itself) and `intent: "subscribe"` (the subscribe embed) override the
 * flag.
 */
export function resolveAuthScopeForUser(
  user: ScopeUserLookup | null | undefined,
  intent: AuthScopeIntent | undefined,
): string {
  if (intent === "subscribe") {
    return formatOAuthScope(SCOPE_BY_INTENT.subscribe);
  }
  if (intent === "collections" || user?.collectionsAuthoringEnabled === true) {
    return formatOAuthScope(SCOPE_BY_INTENT.collections);
  }
  return formatOAuthScope(SCOPE_BY_INTENT.basic);
}

/**
 * Resolve scope without a known user (used when the user can't be looked up at
 * authorize time — e.g. handle resolution failed). Falls back to the basic
 * tier; the collections upgrade flow re-authorizes once the flag is set.
 */
export function resolveAuthScope(intent: AuthScopeIntent | undefined): string {
  return formatOAuthScope(SCOPE_BY_INTENT[intent ?? "basic"]);
}

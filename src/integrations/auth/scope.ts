import { scope as atprotoScope } from "@atcute/oauth-node-client";

/** Required on every ATProto OAuth session (see atproto.com/specs/oauth). */
export const ATPROTO_BASE_SCOPE = "atproto";

/**
 * OAuth permission scope requested at sign-in. Standard Reader writes the
 * reader's personal state back to their own repo (see `APP_VISION.md` §5):
 * standard.site subscriptions and recommends (likes), plus app-owned read and
 * bookmark records. We also request blob upload for image-bearing records.
 */
export const scope = [
  ATPROTO_BASE_SCOPE,
  atprotoScope.blob({ accept: ["image/*"] }),
  atprotoScope.repo({
    collection: [
      "site.standard.graph.subscription",
      "site.standard.graph.recommend",
      // Collections: we write the user's own publication + collection documents.
      "site.standard.publication",
      "site.standard.document",
      "app.standard-reader.read",
      "app.standard-reader.bookmark",
      "app.standard-reader.list",
      "app.standard-reader.listSave",
      "app.standard-reader.collection",
      "app.standard-reader.collectionsPublication",
      "app.standard-reader.publicationTheme",
      "app.standard-reader.labelerSubscription",
    ],
  }),
];

/** Minimal scope for the publication subscribe embed (subscription write only). */
export const subscribeScope = [
  ATPROTO_BASE_SCOPE,
  atprotoScope.repo({
    collection: ["site.standard.graph.subscription"],
  }),
];

/**
 * Every scope string we may request at authorize time. ATProto OAuth requires
 * each requested scope to appear in client metadata (a single-collection `repo`
 * scope is not treated as a subset of a multi-collection one).
 */
export const clientMetadataScope = [...new Set([...scope, ...subscribeScope])];

export type AuthScopeIntent = "full" | "subscribe";

const SCOPE_BY_INTENT: Record<AuthScopeIntent, Array<string>> = {
  full: scope,
  subscribe: subscribeScope,
};

/** Serialize OAuth scope entries for the authorize request. */
export function formatOAuthScope(entries: Array<string>): string {
  return entries.join(" ");
}

export function resolveAuthScope(intent: AuthScopeIntent | undefined): string {
  return formatOAuthScope(SCOPE_BY_INTENT[intent ?? "full"]);
}

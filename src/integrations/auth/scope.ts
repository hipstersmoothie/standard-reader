import { scope as atprotoScope } from "@atcute/oauth-node-client";

/**
 * OAuth permission scope requested at sign-in. Standard Reader writes the
 * reader's personal state back to their own repo (see `APP_VISION.md` §5):
 * standard.site subscriptions plus the app-owned bookmark / read records.
 * We also request blob upload for image-bearing records.
 */
export const scope = [
  atprotoScope.blob({ accept: ["image/*"] }),
  atprotoScope.repo({
    collection: [
      "site.standard.graph.subscription",
      "app.standard-reader.bookmark",
      "app.standard-reader.read",
    ],
  }),
];

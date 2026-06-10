import { scope as atprotoScope } from "@atcute/oauth-node-client";

/**
 * OAuth permission scope requested at sign-in. Standard Reader writes the
 * reader's personal state back to their own repo (see `APP_VISION.md` §5):
 * standard.site subscriptions and recommends (likes), plus app-owned read and
 * bookmark records. We also request blob upload for image-bearing records.
 */
export const scope = [
  atprotoScope.blob({ accept: ["image/*"] }),
  atprotoScope.repo({
    collection: [
      "site.standard.graph.subscription",
      "site.standard.graph.recommend",
      "app.standard-reader.read",
      "app.standard-reader.bookmark",
      "app.standard-reader.list",
      "app.standard-reader.listSave",
    ],
  }),
];

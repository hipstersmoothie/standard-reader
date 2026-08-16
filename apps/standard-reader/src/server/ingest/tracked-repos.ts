import { db } from "../../db/index.ts";
import { trackedRepos } from "../../db/schema.ts";

/** Reason a repo entered our tracking set (mirrors `tracked_repos.reason`). */
export type TrackReason =
  | "publication"
  | "document"
  | "contributor"
  | "subscriber"
  | "recommender"
  | "reader"
  | "followed"
  | "manual";

/**
 * Note that a repo is one we care about.
 *
 * Under tap this was load-bearing for *ingestion*: tap only streamed repos we
 * had registered, so every reference we discovered — a document's contributor,
 * a subscription's target, a reader marking something read — had to be pushed
 * to tap's `/repos/add` or its records would never arrive. Missing a call meant
 * missing data, which is why it ended up threaded through two dozen call sites,
 * a per-repo `added_to_tap_at` watermark, a retry sweep for repos tap never
 * acknowledged, and a routing table deciding which of three tap instances a
 * given handle belonged to.
 *
 * Jetstream subscribes by collection across the whole network, so none of that
 * decides what we index any more — a repo's records arrive whether or not we
 * have ever heard of it. What the table is still good for is the inventory:
 * which DIDs we display, and therefore whose profiles the refresh sweep should
 * keep fresh (`profile-refresh.ts`) and whose repos the PDS reconcile should
 * check (`repo-sync.ts`). So this stayed, and shrank to the row it always
 * wanted to be.
 */
export async function ensureTracked(
  did: string,
  reason: TrackReason,
): Promise<void> {
  await db
    .insert(trackedRepos)
    .values({ did, reason })
    .onConflictDoNothing({ target: trackedRepos.did });
}

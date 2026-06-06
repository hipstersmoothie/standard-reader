import { sql } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { trackedRepos } from "../../db/schema.ts";
import { ingestConfig } from "./config.ts";

const TAP_ADMIN_TIMEOUT_MS = 1500;

/** Reason a repo entered our tracking set (mirrors `tracked_repos.reason`). */
export type TrackReason =
  | "publication"
  | "document"
  | "contributor"
  | "subscriber"
  | "recommender"
  | "reader"
  | "manual";

function basicAuthHeader(): Record<string, string> {
  const password = ingestConfig.tapAdminPassword;
  if (!password) {
    return {};
  }
  const token = Buffer.from(`admin:${password}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

/**
 * POST a batch of DIDs to tap's `/repos/add`, triggering backfill. No-op when
 * tap's API URL isn't configured (static seeding mode).
 */
async function tapAddRepos(dids: Array<string>): Promise<boolean> {
  const apiUrl = ingestConfig.tapApiUrl;
  if (!apiUrl || dids.length === 0) {
    return false;
  }
  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/repos/add`, {
      body: JSON.stringify({ dids }),
      headers: { "Content-Type": "application/json", ...basicAuthHeader() },
      method: "POST",
      signal: AbortSignal.timeout(TAP_ADMIN_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure a repo is in our tracking set and (best-effort) asked of tap exactly
 * once. Discovery is idempotent: we upsert the `tracked_repos` row, and only
 * call tap `/repos/add` the first time the row transitions to "added".
 *
 * Because standard.site subscriptions/recommends can originate from arbitrary
 * reader repos that aren't publications, this is how the index expands to cover
 * the whole graph beyond the seed (signal) collection.
 */
export async function ensureTracked(
  did: string,
  reason: TrackReason,
): Promise<void> {
  // Insert the discovery row if new; report whether it was freshly inserted.
  const inserted = await db
    .insert(trackedRepos)
    .values({ did, reason })
    .onConflictDoNothing({ target: trackedRepos.did })
    .returning({ did: trackedRepos.did });

  if (inserted.length === 0 || !ingestConfig.dynamicTrackingEnabled) {
    return;
  }

  const ok = await tapAddRepos([did]);
  if (ok) {
    await db
      .update(trackedRepos)
      .set({ addedToTapAt: sql`now()`, updatedAt: sql`now()` })
      .where(sql`${trackedRepos.did} = ${did}`);
  }
}

export { tapAddRepos };

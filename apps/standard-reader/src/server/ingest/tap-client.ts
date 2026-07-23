import { eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { trackedRepos } from "../../db/schema.ts";
import { logEvent } from "../observability/log.ts";
import { ingestConfig } from "./config.ts";

const TAP_ADMIN_TIMEOUT_MS = 5000;
/** How often the ingest worker retries repos that never reached tap. */
const RECONCILE_PENDING_INTERVAL_MS = 60_000;

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
    if (!res.ok) {
      console.warn(
        `[ingest] tap /repos/add failed (${res.status}) for ${dids.length} repo(s)`,
      );
    }
    return res.ok;
  } catch (error: unknown) {
    console.warn(
      `[ingest] tap /repos/add error for ${dids.length} repo(s)`,
      error,
    );
    return false;
  }
}

async function markAddedToTap(dids: Array<string>): Promise<void> {
  if (dids.length === 0) {
    return;
  }
  await db
    .update(trackedRepos)
    .set({ addedToTapAt: sql`now()`, updatedAt: sql`now()` })
    .where(inArray(trackedRepos.did, dids));
}

/**
 * Ensure a repo is in our tracking set and (best-effort) registered with tap.
 * Discovery is idempotent: we upsert the `tracked_repos` row, then call tap
 * `/repos/add` when dynamic tracking is enabled and the repo has not yet been
 * added (`added_to_tap_at` is null). Failed tap calls are retried on later
 * calls and by {@link reconcilePendingTrackedRepos}.
 *
 * Because standard.site subscriptions/recommends can originate from arbitrary
 * reader repos that aren't publications, this is how the index expands to cover
 * the whole graph beyond the seed (signal) collection.
 */
export async function ensureTracked(
  did: string,
  reason: TrackReason,
): Promise<void> {
  const inserted = await db
    .insert(trackedRepos)
    .values({ did, reason })
    .onConflictDoNothing({ target: trackedRepos.did })
    .returning({ did: trackedRepos.did });

  if (!ingestConfig.dynamicTrackingEnabled) {
    return;
  }

  if (inserted.length > 0) {
    const ok = await tapAddRepos([did]);
    if (ok) {
      await markAddedToTap([did]);
    }
    return;
  }

  const [row] = await db
    .select({ addedToTapAt: trackedRepos.addedToTapAt })
    .from(trackedRepos)
    .where(eq(trackedRepos.did, did))
    .limit(1);

  if (row?.addedToTapAt != null) {
    return;
  }

  const ok = await tapAddRepos([did]);
  if (ok) {
    await markAddedToTap([did]);
  }
}

/**
 * Register every repo in `tracked_repos` that tap never acknowledged. The web
 * app may discover reader repos without `TAP_API_URL` configured; the ingest
 * worker runs this on startup and on a timer so those repos still backfill.
 */
export async function reconcilePendingTrackedRepos(): Promise<{
  added: number;
  addedDids: Array<string>;
  attempted: number;
}> {
  if (!ingestConfig.dynamicTrackingEnabled) {
    return { added: 0, addedDids: [], attempted: 0 };
  }

  const pending = await db
    .select({ did: trackedRepos.did })
    .from(trackedRepos)
    .where(isNull(trackedRepos.addedToTapAt));

  if (pending.length === 0) {
    return { added: 0, addedDids: [], attempted: 0 };
  }

  const dids = pending.map((row) => row.did);
  const addedDids: Array<string> = [];

  if (await tapAddRepos(dids)) {
    await markAddedToTap(dids);
    addedDids.push(...dids);
  } else {
    for (const did of dids) {
      if (await tapAddRepos([did])) {
        await markAddedToTap([did]);
        addedDids.push(did);
      }
    }
  }

  logEvent("ingest.reconcileTracked", {
    added: addedDids.length,
    attempted: dids.length,
    ok: addedDids.length > 0 || dids.length === 0,
  });

  return { added: addedDids.length, addedDids, attempted: dids.length };
}

/** Periodic reconcile for repos stuck with `added_to_tap_at = null`. */
export function startPendingTrackedReconcile(
  reconcile: () => Promise<unknown>,
): { stop: () => void } {
  const run = () => {
    void reconcile().catch((error: unknown) => {
      console.warn("[ingest] pending tracked repo reconcile failed", error);
    });
  };
  run();
  const timer = setInterval(run, RECONCILE_PENDING_INTERVAL_MS);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

export { tapAddRepos };

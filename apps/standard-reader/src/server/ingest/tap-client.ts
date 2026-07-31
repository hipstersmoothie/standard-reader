import { eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { profiles, trackedRepos } from "../../db/schema.ts";
import {
  isBridgedHandle,
  isExcludedBridgeHandle,
} from "../../lib/atproto/bridged-repo.ts";
import { getCachedIdentity, resolveIdentity } from "../atproto/identity.ts";
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
 * POST a batch of DIDs to a tap's `/repos/add`, triggering backfill. No-op when
 * that tap's API URL isn't configured (static seeding mode).
 *
 * `apiUrl` defaults to the main tap; the bridge lane passes its own so bulk
 * bridged repos never enter the same resync queue as publishers and readers
 * (see {@link tapUrlForRepo}).
 */
async function tapAddRepos(
  dids: Array<string>,
  apiUrl: string | null = ingestConfig.tapApiUrl,
): Promise<boolean> {
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
 * This repo's handle, for lane routing.
 *
 * The cached identity answers first, and for tap-delivered work it almost
 * always can: an identity event primes the handle before any record from that
 * repo is applied. Only a genuinely unseen DID pays the DID-document lookup,
 * and that is the same call the repo would need moments later anyway. Null on
 * failure, which every caller reads as "treat it as an ordinary repo".
 */
async function handleForRepo(did: string): Promise<string | null> {
  const cached = getCachedIdentity(did);
  if (cached) return cached.handle;
  const resolved = await resolveIdentity(did).catch(() => null);
  return resolved?.handle ?? null;
}

/**
 * Which tap a repo belongs to: the bridge lane for `*.brid.gy`, the main tap
 * for everyone else.
 *
 * Returns null when the repo has no lane at all — the bulk web bridge with no
 * `TAP_BRIDGE_API_URL` configured — and the caller then leaves it untracked.
 */
function tapUrlForRepo(handle: string | null): string | null {
  const bridgeUrl = ingestConfig.tapBridgeApiUrl;
  if (isExcludedBridgeHandle(handle, { hasBridgeLane: bridgeUrl != null })) {
    return null;
  }
  if (bridgeUrl && isBridgedHandle(handle)) {
    return bridgeUrl;
  }
  return ingestConfig.tapApiUrl;
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
  const tapUrl = tapUrlForRepo(await handleForRepo(did));
  if (tapUrl == null) {
    // A bulk bridge repo with no isolated lane to put it in.
    return;
  }

  const inserted = await db
    .insert(trackedRepos)
    .values({ did, reason })
    .onConflictDoNothing({ target: trackedRepos.did })
    .returning({ did: trackedRepos.did });

  if (!ingestConfig.dynamicTrackingEnabled) {
    return;
  }

  if (inserted.length > 0) {
    const ok = await tapAddRepos([did], tapUrl);
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

  const ok = await tapAddRepos([did], tapUrl);
  if (ok) {
    await markAddedToTap([did]);
  }
}

/**
 * Register every repo in `tracked_repos` that tap never acknowledged. The web
 * app may discover reader repos without `TAP_API_URL` configured; the ingest
 * worker runs this on startup and on a timer so those repos still backfill.
 *
 * Routed per lane, exactly like {@link ensureTracked} — this sweep sees rows
 * that predate the current routing, so handing them all to the main tap would
 * quietly undo the split (and, with no bridge lane configured, re-subscribe to
 * the very repos that were turned away). The mirrored `profiles.handle` decides
 * the lane, joined here rather than resolved per DID so a long pending list
 * stays one query.
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
    .select({ did: trackedRepos.did, handle: profiles.handle })
    .from(trackedRepos)
    .leftJoin(profiles, eq(profiles.did, trackedRepos.did))
    .where(isNull(trackedRepos.addedToTapAt));

  // One batch per tap; repos with no lane are dropped rather than added.
  const byLane = new Map<string, Array<string>>();
  for (const row of pending) {
    const tapUrl = tapUrlForRepo(row.handle);
    if (tapUrl == null) continue;
    const bucket = byLane.get(tapUrl);
    if (bucket) bucket.push(row.did);
    else byLane.set(tapUrl, [row.did]);
  }

  const dids = [...byLane.values()].flat();
  if (dids.length === 0) {
    return { added: 0, addedDids: [], attempted: 0 };
  }

  const addedDids: Array<string> = [];
  for (const [tapUrl, laneDids] of byLane) {
    if (await tapAddRepos(laneDids, tapUrl)) {
      await markAddedToTap(laneDids);
      addedDids.push(...laneDids);
      continue;
    }
    // Batch rejected — fall back to one at a time so a single bad DID can't
    // strand the rest of the lane.
    for (const did of laneDids) {
      if (await tapAddRepos([did], tapUrl)) {
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

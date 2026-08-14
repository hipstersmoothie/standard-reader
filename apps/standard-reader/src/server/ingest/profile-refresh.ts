import { eq, isNull, or, sql } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { profiles } from "../../db/schema.ts";
import { fetchRepoRecordWithFallback } from "../atproto/fetch-record.ts";
import { refreshIdentity } from "../atproto/identity.ts";
import type { BskyProfileRecord } from "../atproto/types.ts";
import { Collections, buildAtUri } from "../atproto/uri.ts";
import { logEvent } from "../observability/log.ts";
import { applyIdentity, upsertBskyProfile } from "./handlers.ts";

/**
 * Pull `app.bsky.actor.profile` for the actors we mirror, instead of streaming
 * it.
 *
 * tap delivered profiles because it was already tracking each repo, so the
 * profile came along for free. Jetstream filters by collection across the whole
 * network, and that inverts the economics: `app.bsky.actor.profile` network-wide
 * is tens of millions of records for the ~15k we actually display, and
 * Jetstream's DID filter caps at 10,000 — fewer than we track, so we cannot
 * even ask for exactly our set. So we fetch instead of subscribe.
 *
 * The trade is freshness for volume: a display-name edit lands on the next
 * sweep rather than within seconds. Everything that decides *what* a reader
 * sees — publications, documents, subscriptions — still streams live; only the
 * decoration of who wrote it is pulled.
 *
 * Handles ride along on the same sweep for the same reason: `kinds: ["commit"]`
 * means no `#identity` events either, and taking those network-wide would be
 * the same bad trade.
 */

/** Profiles refreshed per sweep. */
const DEFAULT_BATCH = 200;
/** Concurrent fetches. Slingshot fronts these, so this is polite, not slow. */
const DEFAULT_CONCURRENCY = 8;
/** How old a `profile_fetched_at` must be before the sweep revisits it. */
const DEFAULT_STALE_AFTER_HOURS = 24;
/** Gap between sweeps in the ingest worker. */
const SWEEP_INTERVAL_MS = 60_000;

export interface ProfileRefreshResult {
  scanned: number;
  updated: number;
  missing: number;
  failed: number;
}

/**
 * Refresh the least-recently-fetched batch of profiles.
 *
 * Ordering is `profile_fetched_at` nulls first, so a DID discovered by a
 * publication or subscription upsert — which inserts a bare stub row — is
 * always first in line, and the sweep degrades into a round-robin once the
 * backlog is drained.
 */
export async function refreshProfiles(
  opts: {
    batch?: number;
    concurrency?: number;
    staleAfterHours?: number;
  } = {},
): Promise<ProfileRefreshResult> {
  const batch = opts.batch ?? DEFAULT_BATCH;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const staleAfterHours = opts.staleAfterHours ?? DEFAULT_STALE_AFTER_HOURS;

  const rows = await db
    .select({ did: profiles.did })
    .from(profiles)
    .where(
      or(
        isNull(profiles.profileFetchedAt),
        sql`${profiles.profileFetchedAt} < now() - make_interval(hours => ${staleAfterHours})`,
      ),
    )
    // Written out rather than `asc(sql\`… nulls first\`)`: Drizzle appends the
    // direction *after* the expression, so that form emits the invalid
    // `… nulls first asc`.
    .orderBy(sql`${profiles.profileFetchedAt} asc nulls first`)
    .limit(batch);

  const result: ProfileRefreshResult = {
    failed: 0,
    missing: 0,
    scanned: rows.length,
    updated: 0,
  };
  if (rows.length === 0) {
    return result;
  }

  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
      for (;;) {
        const mine = index++;
        if (mine >= rows.length) return;
        const { did } = rows[mine];
        try {
          const outcome = await refreshOne(did);
          if (outcome === "updated") result.updated += 1;
          else result.missing += 1;
        } catch {
          result.failed += 1;
        }
      }
    }),
  );

  logEvent("ingest.profileRefresh", {
    failed: result.failed,
    missing: result.missing,
    ok: result.failed === 0,
    scanned: result.scanned,
    updated: result.updated,
  });
  return result;
}

async function refreshOne(did: string): Promise<"updated" | "missing"> {
  // Forced, not cached: a handle change is exactly the thing this sweep exists
  // to notice, and the cache may still hold the pre-change value.
  const identity = await refreshIdentity(did).catch(() => null);
  if (identity?.handle) {
    await applyIdentity({ did, handle: identity.handle });
  }

  const uri = buildAtUri(did, Collections.bskyProfile, "self");
  const fetched = await fetchRepoRecordWithFallback(uri, identity?.pds ?? null);
  if (!fetched) {
    // No profile record (or the repo is unreachable). Stamp the row anyway so a
    // DID that will never have one stops being first in line on every sweep.
    await db
      .update(profiles)
      .set({ profileFetchedAt: sql`now()` })
      .where(eq(profiles.did, did));
    return "missing";
  }

  await upsertBskyProfile(
    uri,
    did,
    fetched.cid,
    fetched.value as unknown as BskyProfileRecord,
  );
  return "updated";
}

/** Run {@link refreshProfiles} on a timer for the long-lived ingest worker. */
export function startProfileRefresh(): { stop: () => void } {
  const run = () => {
    void refreshProfiles().catch((error: unknown) => {
      console.warn("[ingest] profile refresh failed", error);
    });
  };
  run();
  const timer = setInterval(run, SWEEP_INTERVAL_MS);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

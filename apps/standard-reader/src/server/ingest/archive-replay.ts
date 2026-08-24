import { Jetstream } from "@bsky/jetstream";
import { eq } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { trackedRepos } from "../../db/schema.ts";
import { buildAtUri } from "../atproto/uri.ts";
import { logEvent } from "../observability/log.ts";
import { ingestConfig } from "./config.ts";
import { handleRecord } from "./consumer.ts";
import {
  INGESTED_COLLECTIONS,
  toIngestRecordPayload,
} from "./jetstream-event.ts";

/**
 * Rebuild a repo's records from Jetstream's sealed archive instead of its PDS.
 *
 * The read-model used to repair itself by listing each collection off the
 * author's PDS. That worked, but it made the backstop depend on ~15k third-party
 * servers being reachable and correct: a repo behind a slow host, a PDS that
 * 4xxs one collection, a `RepoGoneError` mid-sweep, all showed up as repair
 * failures on data that was perfectly intact. Jetstream already holds every one
 * of those records, indexed per block by DID *and* collection, so the same
 * question — "what does this repo actually have?" — can be asked of one service
 * we already depend on.
 *
 * It is also dramatically cheaper. The segment-level DID bloom rejects almost
 * the whole archive without touching disk: a plan scoped to one DID examines
 * ~7,000 segments and matches 1–6 of them, which is 1–67 blocks (~67 KB–4.4 MB)
 * against the 66,795 blocks a network-wide plan selects. And `dids` accepts up
 * to 10,000 per plan, so a whole sweep batch can be planned in one request
 * rather than one PDS round trip per repo.
 *
 * **`kinds` is deliberately not set.** A collection filter constrains commits
 * only, and omitting `kinds` is what keeps the DID-level markers — `#account`,
 * `#sync` — in the plan via the archive's sentinel index. Those are how a
 * deleted account and a diverged repo announce themselves; asking for
 * `kinds: ["commit"]` here would filter out exactly the events that tell us to
 * purge a repo.
 */

/**
 * The SDK brands `dids` as `DidString[]`. Ours are plain strings that came out
 * of the read-model, so this is derived from the SDK's own signature rather
 * than by taking a dependency on `@atproto/lex` just for the brand.
 */
type ArchiveDids = NonNullable<
  Parameters<Jetstream["snapshotRawBatches"]>[0]["dids"]
>;

/** What folding one repo's archive history produced. */
export interface RepoFold {
  did: string;
  /** Records re-applied through the dispatcher (creates/updates). */
  applied: number;
  /** Delete events applied. */
  deleted: number;
  /** The account was deleted upstream — every mirrored row is an orphan. */
  gone: boolean;
  /**
   * Live record URIs per collection once creates/updates/deletes are folded in
   * seq order. This is the archive's answer to "what does this repo have now",
   * and it is what the caller diffs against the read-model to find stale rows.
   */
  live: Map<string, Set<string>>;
  /** Highest Jetstream seq seen for this repo. */
  lastSeq: number;
  /**
   * True when the plan selected nothing at all for this DID.
   *
   * Load-bearing for safety: an empty result is *not* proof the repo is empty.
   * A repo the relay never saw (firewalled, or newer than the archive's
   * bootstrap) plans to zero blocks exactly like a repo that genuinely has no
   * records, and pruning on that would delete a live publisher's whole
   * catalogue. Callers must refuse to prune when this is set.
   */
  empty: boolean;
}

function emptyFold(did: string): RepoFold {
  return {
    applied: 0,
    deleted: 0,
    did,
    empty: true,
    gone: false,
    lastSeq: 0,
    live: new Map(),
  };
}

function noteLive(fold: RepoFold, collection: string, uri: string): void {
  let set = fold.live.get(collection);
  if (!set) {
    set = new Set();
    fold.live.set(collection, set);
  }
  set.add(uri);
}

function dropLive(fold: RepoFold, collection: string, uri: string): void {
  fold.live.get(collection)?.delete(uri);
}

let client: Jetstream | undefined;

/**
 * Attempts per segment/block download before the fetch is allowed to fail.
 *
 * The SDK defaults to `maxAttempts: Infinity` with a 30s backoff ceiling and no
 * error callback, which is the wrong shape for a fold: the reconcile sweep and
 * the read path both *await* one, so an archive that keeps 503ing does not fail
 * them — it hangs them, invisibly and forever. Six attempts is about a minute
 * of the SDK's jittered backoff, after which the caller gets an error it can
 * log, skip, or retry on its own schedule.
 */
const DOWNLOAD_MAX_ATTEMPTS = 6;

/**
 * Process-wide gate on concurrent folds.
 *
 * `blockConcurrency` bounds in-flight downloads inside *one* snapshot
 * iterator, so it never saw the whole picture: the reconcile sweep repairs
 * eight repos at once, which put 8 × 16 = 128 block requests in flight against
 * a service that 429s nearly everything past 64. Jetstream duly rate-limited
 * us, every 429 went onto the retry backoff above, single-repo folds that
 * should take 200ms started taking two minutes, and the failures piled up as
 * reconcile backoff on two thirds of the tracked fleet. Bounding the retries
 * makes that visible; this is what stops us causing it.
 *
 * A semaphore here rather than a smaller `blockConcurrency`: fold latency is
 * dominated by the planning round trip, so it is better to let a fold use the
 * full block budget briefly than to give every fold a slice of it.
 */
const foldSlots = { free: ingestConfig.jetstreamFoldConcurrency };
const foldWaiters: Array<() => void> = [];

async function acquireFoldSlot(): Promise<void> {
  if (foldSlots.free > 0) {
    foldSlots.free -= 1;
    return;
  }
  await new Promise<void>((resolve) => foldWaiters.push(resolve));
}

function releaseFoldSlot(): void {
  const next = foldWaiters.shift();
  if (next) {
    // Hand the slot straight over rather than returning it to the pool: a
    // waiter that has to re-check `free` can lose the slot to a fold arriving
    // in the same tick, and under a saturated sweep that starves.
    next();
    return;
  }
  foldSlots.free += 1;
}

function jetstream(): Jetstream {
  client ??= new Jetstream({
    ...(ingestConfig.jetstreamApiKey
      ? { apiKey: ingestConfig.jetstreamApiKey }
      : {}),
    blockConcurrency: ingestConfig.jetstreamBlockConcurrency,
    retry: {
      maxAttempts: DOWNLOAD_MAX_ATTEMPTS,
      onRetry: (error, info) =>
        logEvent("ingest.archiveDownloadRetry", {
          attempt: info.attempt,
          delayMs: info.delayMs,
          ok: false,
          reason: error.message,
          target: info.target.kind,
        }),
    },
    service: ingestConfig.jetstreamService,
  });
  return client;
}

/**
 * Fold the archive for `dids` and re-apply what it holds.
 *
 * Every surviving record is replayed through {@link handleRecord} — the same
 * dispatcher the live channel feeds — so a repaired row and a live one are
 * written by identical code. `live: false` keeps the replay from queueing a
 * push notification per document.
 *
 * Keep batches modest. The `dids` filter allows 10,000, but this accumulates a
 * live-URI set per repo, and bulk web-bridge mirrors carry thousands of
 * documents each — the planning call is what scales to 10,000, not the fold.
 */
export async function foldReposFromArchive(
  dids: ReadonlyArray<string>,
  opts: {
    afterSeq?: number;
    signal?: AbortSignal;
    /**
     * Compute the live set without writing anything. This is what makes a
     * `--dry-run` reconcile honest: the same fold, the same diff, no upserts.
     */
    skipApply?: boolean;
  } = {},
): Promise<Map<string, RepoFold>> {
  const folds = new Map<string, RepoFold>();
  for (const did of dids) {
    folds.set(did, emptyFold(did));
  }
  if (dids.length === 0) {
    return folds;
  }

  const started = performance.now();
  let events = 0;

  await acquireFoldSlot();
  // Separated from `ms` so a saturated sweep is legible: `ms` covers the whole
  // call, `waitMs` says how much of it was spent queued behind other folds.
  const waitMs = Math.round(performance.now() - started);
  try {
    for await (const event of jetstream().snapshot({
      afterSeq: opts.afterSeq ?? 0,
      collections: INGESTED_COLLECTIONS,
      dids: dids as ArchiveDids,
      onError: (error) =>
        logEvent("ingest.archiveReplayError", {
          ok: false,
          reason: error.message,
        }),
      // Raw, not typed: typed decode drops every record without a `$type`, and on
      // this network that is ~0.05% of standard.site records — live publications
      // and documents included. See `toIngestRecordPayload`.
      raw: true,
      ...(opts.signal ? { signal: opts.signal } : {}),
    })) {
      // The planner is one-sided (no false negatives, possible false positives),
      // so a block selected for one DID can carry another's events.
      const fold = folds.get(event.did);
      if (!fold) continue;

      events += 1;
      fold.empty = false;
      fold.lastSeq = Math.max(fold.lastSeq, event.seq);

      if (event.kind === "account") {
        // The one marker that means "this repo is gone": everything mirrored for
        // the DID is an orphan. Deactivations and suspensions are not deletions —
        // the records still exist and come back when the account does.
        if (
          event.account.active === false &&
          event.account.status === "deleted"
        ) {
          fold.gone = true;
        }
        continue;
      }

      if (event.kind === "sync") {
        // Sync 1.1 divergence: the archive discarded this repo's pre-divergence
        // rows and follows with the authoritative replacement records. Anything
        // folded so far is exactly what was discarded, so start the live set over
        // rather than unioning stale URIs into it.
        fold.live.clear();
        continue;
      }

      if (event.kind !== "commit") continue;

      const { collection, operation, rkey } = event.commit;
      const uri = buildAtUri(event.did, collection, rkey);

      if (operation === "delete") {
        dropLive(fold, collection, uri);
      } else {
        noteLive(fold, collection, uri);
      }

      if (opts.skipApply) continue;

      const payload = toIngestRecordPayload(event, { live: false });
      if (!payload) continue;
      try {
        await handleRecord(payload);
        if (operation === "delete") fold.deleted += 1;
        else fold.applied += 1;
      } catch (error: unknown) {
        logEvent("ingest.archiveReplayApplyFailed", {
          collection,
          did: event.did,
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
          uri,
        });
      }
    }
  } finally {
    releaseFoldSlot();
  }

  logEvent("ingest.archiveReplay", {
    dids: dids.length,
    events,
    empty: [...folds.values()].filter((f) => f.empty).length,
    gone: [...folds.values()].filter((f) => f.gone).length,
    ms: Math.round(performance.now() - started),
    ok: true,
    waitMs,
  });

  return folds;
}

/**
 * Fold a single repo, from `afterSeq` onwards.
 *
 * `afterSeq` is the gate that replaces `com.atproto.sync.getLatestCommit`: the
 * planner drops every block below the watermark before anything is downloaded,
 * so a repo that has not moved since we last swept it costs one planning
 * request and yields no events. Pass 0 for a full rebuild — that is the only
 * mode whose `live` set is complete enough to prune against.
 */
export async function foldRepoFromArchive(
  did: string,
  opts: { afterSeq?: number; signal?: AbortSignal; skipApply?: boolean } = {},
): Promise<RepoFold> {
  const folds = await foldReposFromArchive([did], opts);
  return folds.get(did) ?? emptyFold(did);
}

/**
 * How long a completed read-path backfill suppresses another for the same DID.
 *
 * The old per-collection PDS backfills were narrow, so a first shell load
 * firing three of them (sidebar prefs, lists, saved-list sidebar) cost three
 * small reads. The fold is one *broad* read — every collection at once — so
 * without a guard the same first visit would run the identical fold three
 * times. Sixty seconds is enough to collapse a page load's burst while staying
 * irrelevant next visit.
 */
const BACKFILL_TTL_MS = 60_000;

const backfillInflight = new Map<string, Promise<RepoFold>>();
const backfillDone = new Map<string, { at: number; fold: RepoFold }>();

/**
 * Hydrate a repo the read path just found missing from the read-model.
 *
 * This replaces the `backfillXFromRepo` family — four near-identical
 * functions, each listing one collection off the author's PDS for one caller
 * (subscriptions for the reconcile endpoint, lists + sidebar prefs for the
 * shell snapshot, recommends/documents/sidecars for a fresh follow). One fold
 * covers every collection in a single pass and applies through
 * {@link handleRecord}, so all four callers now share the exact code path the
 * live stream and the reconcile sweep use.
 *
 * It is also *more* correct than what it replaces: the old backfills were
 * upsert-only, so a record whose delete event we missed lived on as a ghost
 * row forever (the "second sidebar list" bug). The archive retains delete
 * markers durably, and the fold replays them as events — a missed delete gets
 * applied here instead of surviving the backfill.
 *
 * Seal lag is not a gap for this use: everything newer than the sealed tip
 * arrived through the live channel and is already in the read-model. What the
 * fold supplies is exactly the history that predates our watching.
 *
 * On success the repo's `last_seen_seq` watermark advances so the reconcile
 * sweep resumes from here instead of re-folding the same history on its next
 * lap. Concurrent and recent calls for the same DID coalesce — see
 * {@link BACKFILL_TTL_MS}.
 */
export function backfillRepoFromArchive(did: string): Promise<RepoFold> {
  // Lazy eviction keeps the cache proportional to *recent* backfills rather
  // than every DID a long-lived worker has ever hydrated — folds hold their
  // full live-URI sets, so an append-only map would be a slow leak.
  const now = Date.now();
  for (const [key, entry] of backfillDone) {
    if (now - entry.at >= BACKFILL_TTL_MS) backfillDone.delete(key);
  }
  const done = backfillDone.get(did);
  if (done) {
    return Promise.resolve(done.fold);
  }
  const inflight = backfillInflight.get(did);
  if (inflight) {
    return inflight;
  }

  const run = (async () => {
    const fold = await foldRepoFromArchive(did, { afterSeq: 0 });
    if (!fold.empty && !fold.gone) {
      // No-op for an untracked DID; callers that track do so themselves.
      await db
        .update(trackedRepos)
        .set({ lastSeenSeq: fold.lastSeq, updatedAt: new Date() })
        .where(eq(trackedRepos.did, did));
    }
    backfillDone.set(did, { at: Date.now(), fold });
    return fold;
  })().finally(() => backfillInflight.delete(did));

  backfillInflight.set(did, run);
  return run;
}

/**
 * Repos this process has already settled for the read path — either folded
 * here or found to carry a reconcile watermark, which says the same thing.
 * DID strings only, one per signed-in reader the process has served, so it is
 * bounded by the user base rather than by traffic.
 */
const readHydrationSettled = new Set<string>();
const readHydrationInflight = new Map<string, Promise<void>>();

/**
 * Hydrate a repo for a *read path* that just found the read-model empty.
 *
 * Distinct from {@link backfillRepoFromArchive} in the two ways a read path
 * needs, both learned from an outage:
 *
 * 1. **It never throws.** The shell snapshot awaited the raw backfill, so a
 *    503 from Jetstream's planner did not degrade a sidebar — it rejected
 *    `loadShellSnapshot`, and every signed-in surface with it. An archive we
 *    cannot reach means "no extra rows to show", not "this reader cannot use
 *    the app".
 * 2. **It fires at most once per repo.** "No rows" is indistinguishable from
 *    "no records exist", and most readers own no sidebar lists at all — so the
 *    old call re-folded ~97% of readers' repos on every shell load, throttled
 *    only by a 60s cache. A `tracked_repos` row with a `last_seen_seq` means we
 *    have already folded this repo and the live channel has had it since; the
 *    read-model is authoritative and the fold is pure waste. Only a repo we
 *    have genuinely never reconciled is worth a planning request.
 */
export function hydrateRepoForRead(did: string): Promise<void> {
  if (readHydrationSettled.has(did)) {
    return Promise.resolve();
  }
  const inflight = readHydrationInflight.get(did);
  if (inflight) {
    return inflight;
  }

  const run = (async () => {
    try {
      const rows = await db
        .select({ lastSeenSeq: trackedRepos.lastSeenSeq })
        .from(trackedRepos)
        .where(eq(trackedRepos.did, did))
        .limit(1);
      if (rows[0]?.lastSeenSeq == null) {
        await backfillRepoFromArchive(did);
      }
      readHydrationSettled.add(did);
    } catch (error: unknown) {
      // Left unsettled on purpose: a later request retries, and until then the
      // caller serves whatever the read-model already holds.
      logEvent("ingest.readHydrationFailed", {
        did,
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  })().finally(() => readHydrationInflight.delete(did));

  readHydrationInflight.set(did, run);
  return run;
}

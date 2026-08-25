import {
  and,
  asc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  not,
  or,
  sql,
} from "drizzle-orm";

import { db } from "../../db/index.ts";
import {
  documents,
  profiles,
  publications,
  trackedRepos,
} from "../../db/schema.ts";
import { WEB_BRIDGE_HANDLE_PATTERN } from "../../lib/atproto/bridged-repo.ts";
import { chunk, mapWithConcurrency } from "../../lib/concurrency.ts";
import {
  SERIAL_DIRECTION,
  parsePrevNextDirection,
} from "../../lib/publication/serial.ts";
import {
  LEAFLET_HOST,
  LEAFLET_NSID_PREFIX,
} from "../../lib/publishing-platform.ts";
import { fetchRepoRecordWithFallback } from "../atproto/fetch-record.ts";
import { resolveIdentity } from "../atproto/identity.ts";
import type { PublicationRecord } from "../atproto/types.ts";
import { Collections } from "../atproto/uri.ts";
import { logEvent } from "../observability/log.ts";
import { foldRepoFromArchive } from "./archive-replay.ts";
import { upsertPublication } from "./handlers.ts";

const DELETE_CHUNK = 500;

/**
 * Repos repaired at once inside one batch.
 *
 * A repair is almost entirely waiting — listRecords pages, CID lookups, record
 * writes — and the worker and its database sit in different regions, so the
 * sequential loop this replaces spent nearly all of its time idle and capped
 * the sweep at roughly one repo per round trip. Raising the *batch* alone did
 * nothing for that; only overlapping the waiting does.
 *
 * Kept deliberately modest. Most repos resolve to a handful of shared PDS
 * hosts, so this is really this many requests deep against those few hosts.
 */
const RECONCILE_CONCURRENCY = 8;

/**
 * Repos per batch when the caller doesn't say.
 *
 * Only manual callers land here — the scheduled sweep
 * (`scripts/reconcile-repos-cron.ts`) sizes its own batch from the fleet count
 * so the lap length stays fixed as the fleet grows, which a constant can't do.
 */
const RECONCILE_BATCH_DEFAULT = 50;

/**
 * Backoff after a reconcile failure (transient fetch error, or a PDS that
 * can't be resolved). Doubles per consecutive failure up to the cap, so a
 * persistently-broken DID stops being retried every sweep — previously a
 * handful of permanently-failing DIDs could fill the entire batch, forever,
 * starving healthy repos out of the round-robin.
 */
const RECONCILE_FAIL_BACKOFF_MS = 30 * 60_000;
/**
 * Ceiling on that backoff.
 *
 * Was 24 hours, which still meant a repo that can never succeed was retried
 * every single lap forever — 169 of them were, one having failed 33 consecutive
 * times. A week keeps a hopeless repo in the rotation (repos do get fixed, and
 * we want to notice when they are) at a seventh of the cost.
 */
const RECONCILE_FAIL_BACKOFF_MAX_MS = 7 * 24 * 60 * 60_000;

/**
 * Share of a batch given to bulk web-bridge mirrors, on top of the batch.
 *
 * The round-robin's affordability rests on the seq watermark: "a quiet repo
 * costs one planning request". Bulk `*.web.brid.gy` mirrors are never quiet —
 * Bridgy Fed rewrites them continuously — so the gate opens on essentially
 * every visit and each one re-applies a whole repo, up to a couple of thousand
 * documents. At a third of the fleet they were a third of every batch, and
 * measured at ~72k document rows an hour, all of it against the same Neon pool
 * that live publisher and reader edits go through.
 *
 * So they get their own, much slower lap. At the default daily lap this is a
 * handful of mirrors an hour — a week and a half to walk them all, against 24
 * hours for everyone else. They still self-heal, just slowly.
 *
 * That is the right trade for what these are: passive mirrors of sites that
 * never asked to be here, already excluded from Discover's Recommended rail and
 * topic derivation. `*.ap.brid.gy` is deliberately *not* included — those
 * authors chose to bridge, their repos are small, and the volume was never
 * them.
 */
const WEB_BRIDGE_BATCH_SHARE = 0.05;

/** Whether a tracked repo is a bulk web-bridge mirror, by mirrored handle. */
const isWebBridgeRepo = exists(
  db
    .select({ one: sql`1` })
    .from(profiles)
    .where(
      and(
        eq(profiles.did, trackedRepos.did),
        ilike(profiles.handle, WEB_BRIDGE_HANDLE_PATTERN),
      ),
    ),
);

function nextRetryAfter(failCount: number): Date {
  const backoffMs = Math.min(
    RECONCILE_FAIL_BACKOFF_MS * 2 ** (failCount - 1),
    RECONCILE_FAIL_BACKOFF_MAX_MS,
  );
  return new Date(Date.now() + backoffMs);
}

/**
 * Record a reconcile failure for `did` and schedule its next retry with
 * exponential backoff. Returns the new consecutive-failure count.
 *
 * There is no longer a "permanent" class. That existed for one PDS-shaped
 * failure — a host that 400s a whole collection because one record trips
 * lexicon validation — which parked the repo at the week-long ceiling because
 * retrying could never help. The archive serves raw CBOR and validates nothing
 * on read, so those repos are readable again and every remaining failure is
 * transient by construction.
 */
async function bumpReconcileFailure(did: string): Promise<number> {
  const [row] = await db
    .update(trackedRepos)
    .set({ reconcileFailCount: sql`${trackedRepos.reconcileFailCount} + 1` })
    .where(eq(trackedRepos.did, did))
    .returning({ reconcileFailCount: trackedRepos.reconcileFailCount });
  const failCount = row?.reconcileFailCount ?? 1;
  await db
    .update(trackedRepos)
    .set({ reconcileRetryAfter: nextRetryAfter(failCount) })
    .where(eq(trackedRepos.did, did));
  return failCount;
}

/**
 * `tracked_repos.backfill_state` lifecycle values.
 *
 * - `pending`  — discovered, not yet backfilled.
 * - `complete` — backfill finished; live events keep the read-model fresh.
 * - `gone`     — the repo no longer exists at its resolved PDS (the PDS returned
 *   a permanent "repo not found" error during reconcile, and refreshing the
 *   DID doc didn't surface a new PDS — so the repo is truly deleted, not just
 *   migrated). Excluded from the round-robin so we stop paying 400s every
 *   tick; read-model rows for the DID are pruned once when the state is set.
 */
export const BACKFILL_STATE = {
  complete: "complete",
  gone: "gone",
  pending: "pending",
} as const;

export interface RepoReconcileResult {
  did: string;
  pdsPublications: number;
  pdsDocuments: number;
  upsertedDocuments: number;
  prunedPublications: number;
  prunedDocuments: number;
  /**
   * Records the PDS holds that the read-model had never mirrored at all — the
   * repair's measure of what tap failed to deliver.
   *
   * Deliberately narrower than `upsertedDocuments`, which also counts records
   * we already held at a stale CID (a missed *update*, less user-visible than a
   * missed *create* — the article exists, it's just out of date). Counted with
   * `has`, not a truthy CID, so a row deduped away by `dedupeRecords` reads as
   * mirrored: we saw that record, we chose to drop it.
   *
   * Only meaningful when the reconcile actually upserts (`upsert && !dryRun`);
   * 0 otherwise.
   */
  unmirroredPublications: number;
  unmirroredDocuments: number;
  skipped?: boolean;
  /** True when the PDS reported the repo is permanently gone (after the
   * migration retry in `listRepoRecords` already failed to find a new PDS). */
  gone?: boolean;
  /** True when the repo migrated to a new PDS during this reconcile — the
   * cached identity was stale, `listRepoRecords` refreshed the DID doc and
   * recovered the records from the new PDS. `migratedFrom`/`migratedTo` carry
   * the old/new PDS hosts for observability. */
  migrated?: boolean;
  migratedFrom?: string;
  migratedTo?: string;
}

function rkeyOf(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

async function deleteInChunks(
  table: typeof documents | typeof publications,
  uris: Array<string>,
): Promise<number> {
  if (uris.length === 0) {
    return 0;
  }
  for (const batch of chunk(uris, DELETE_CHUNK)) {
    await db.delete(table).where(inArray(table.uri, batch));
  }
  return uris.length;
}

async function pruneStaleRepoRecords(
  did: string,
  liveUris: { publications: Set<string>; documents: Set<string> },
  dryRun: boolean,
): Promise<{ publications: number; documents: number }> {
  const dbPubs = await db
    .select({ uri: publications.uri })
    .from(publications)
    .where(eq(publications.did, did));
  const dbDocs = await db
    .select({ uri: documents.uri })
    .from(documents)
    .where(eq(documents.did, did));

  const stalePubs = dbPubs
    .map((row) => row.uri)
    .filter((uri) => !liveUris.publications.has(uri));
  const staleDocs = dbDocs
    .map((row) => row.uri)
    .filter((uri) => !liveUris.documents.has(uri));

  if (dryRun) {
    return { documents: staleDocs.length, publications: stalePubs.length };
  }

  await deleteInChunks(publications, stalePubs);
  await deleteInChunks(documents, staleDocs);

  return { documents: staleDocs.length, publications: stalePubs.length };
}

/**
 * Hard-delete every read-model row authored by `did` (publications + documents).
 * Used when the PDS confirms the repo is gone — the repo was deleted or
 * migrated, so every mirrored row for the DID is an orphan tap missed deleting.
 * Returns counts for observability; never throws (best-effort cleanup).
 */
async function pruneAllRepoRecords(
  did: string,
): Promise<{ publications: number; documents: number }> {
  const dbPubs = await db
    .select({ uri: publications.uri })
    .from(publications)
    .where(eq(publications.did, did));
  const dbDocs = await db
    .select({ uri: documents.uri })
    .from(documents)
    .where(eq(documents.did, did));
  await deleteInChunks(
    publications,
    dbPubs.map((row) => row.uri),
  );
  await deleteInChunks(
    documents,
    dbDocs.map((row) => row.uri),
  );
  return {
    documents: dbDocs.length,
    publications: dbPubs.length,
  };
}

/**
 * Mark a tracked repo `gone`: prune its read-model rows and set
 * `backfill_state = 'gone'` so the round-robin stops retrying a PDS that has
 * permanently lost the repo. Idempotent — safe to call repeatedly. Returns the
 * prune counts for observability.
 */
export async function markRepoGone(
  did: string,
): Promise<{ publications: number; documents: number }> {
  const pruned = await pruneAllRepoRecords(did);
  await db
    .update(trackedRepos)
    .set({ backfillState: BACKFILL_STATE.gone, updatedAt: new Date() })
    .where(eq(trackedRepos.did, did));
  return pruned;
}

/**
 * Compare a repo's `site.standard.*` records against its PDS and prune
 * read-model rows that no longer exist on-chain. Optionally upsert live
 * records (manual backfill). The PDS is the source of truth for deletes tap
 * missed (dead-letter cap, stream gaps, out-of-order backfill).
 *
 * `listRepoRecords` (in `fetch-record.ts`) handles the Slingshot-first fetch
 * and the migration retry internally: if the cached PDS reports the repo gone,
 * it refreshes the DID doc and retries against the fresh PDS before re-throwing
 * `RepoGoneError`. So a `RepoGoneError` here means the repo is *truly* gone —
 * not just migrated. The caller is expected to call {@link markRepoGone} to
 * prune + retire the tracked repo. Transient failures (502, fetch failed,
 * timeout) still propagate as thrown errors so the round-robin retries them.
 */
export async function reconcileRepoFromArchive(
  did: string,
  opts: { dryRun?: boolean; upsert?: boolean } = {},
): Promise<RepoReconcileResult> {
  const dryRun = opts.dryRun ?? false;
  const upsert = opts.upsert ?? false;

  // A full rebuild: `afterSeq` 0 is the only mode whose live set is complete
  // enough to prune against. An incremental fold sees only what changed, and
  // "not in the last hour's events" is not "deleted".
  const fold = await foldRepoFromArchive(did, {
    afterSeq: 0,
    // A dry run must not write; the fold applies as it goes, so the caller gets
    // the diff from a fold it never runs.
    skipApply: !upsert || dryRun,
  });

  if (fold.gone) {
    return {
      did,
      gone: true,
      pdsDocuments: 0,
      pdsPublications: 0,
      prunedDocuments: 0,
      prunedPublications: 0,
      unmirroredDocuments: 0,
      unmirroredPublications: 0,
      upsertedDocuments: 0,
    };
  }

  const livePubUris = fold.live.get(Collections.publication) ?? new Set();
  const liveDocUris = fold.live.get(Collections.document) ?? new Set();

  // An empty plan is not proof of an empty repo — a repo the relay never saw
  // plans to zero blocks exactly like one that has no records. Pruning on that
  // would delete a live publisher's whole catalogue, so an empty fold reports
  // "skipped" and changes nothing.
  if (fold.empty) {
    logEvent("ingest.reconcileSkippedEmpty", {
      did,
      ok: true,
      reason: "archive-plan-matched-nothing",
    });
    if (!dryRun) {
      // Advance the round-robin past it; nothing here is a failure.
      await db
        .update(trackedRepos)
        .set({
          reconcileFailCount: 0,
          reconcileRetryAfter: null,
          updatedAt: new Date(),
        })
        .where(eq(trackedRepos.did, did));
    }
    return {
      did,
      pdsDocuments: 0,
      pdsPublications: 0,
      prunedDocuments: 0,
      prunedPublications: 0,
      skipped: true,
      unmirroredDocuments: 0,
      unmirroredPublications: 0,
      upsertedDocuments: 0,
    };
  }

  const pruned = await pruneStaleRepoRecords(
    did,
    { documents: liveDocUris, publications: livePubUris },
    dryRun,
  );

  if (!dryRun) {
    await db
      .update(trackedRepos)
      .set({
        lastSeenSeq: fold.lastSeq,
        reconcileFailCount: 0,
        reconcileRetryAfter: null,
        updatedAt: new Date(),
      })
      .where(eq(trackedRepos.did, did));
  }

  return {
    did,
    pdsDocuments: liveDocUris.size,
    pdsPublications: livePubUris.size,
    prunedDocuments: pruned.documents,
    prunedPublications: pruned.publications,
    unmirroredDocuments: 0,
    unmirroredPublications: 0,
    upsertedDocuments: fold.applied,
  };
}

/** Publication records read from Slingshot at once. */
const SERIAL_BACKFILL_CONCURRENCY = 16;
/** Leaflet's own host, and each publication's subdomain of it. */
const LEAFLET_URL_PATTERN = String.raw`^https?://([^/]+\.)?${LEAFLET_HOST.replaceAll(".", String.raw`\.`)}(/|$)`;

/**
 * Publications that could carry `preferences.prevNextDirection`.
 *
 * The field is Leaflet's — it's how a Leaflet publisher says "this reads
 * forwards from post one" — so a whole-network sweep spends most of its time
 * reading records that cannot possibly answer. Leaflet publications are
 * identified the way {@link publishingPlatform} does it: the content format of
 * their posts first (custom domains are common, so the host alone misses
 * plenty), falling back to Leaflet's own host for publications whose documents
 * we never resolved content for.
 *
 * Scoping this way trades completeness for speed, and can afford to: a
 * publication outside the filter that *does* set the field still lights up on
 * its first view, via `ensurePublicationSerial`. This pass only decides who
 * gets warmed ahead of that.
 */
function leafletPublication() {
  return or(
    sql`exists (
      select 1 from ${documents}
      where ${documents.publicationUri} = ${publications.uri}
        and ${documents.deleted} = false
        and ${documents.contentFormat} like ${`${LEAFLET_NSID_PREFIX}%`}
    )`,
    sql`${publications.url} ~* ${LEAFLET_URL_PATTERN}`,
  );
}

/**
 * Re-mirror every Leaflet publication from its own record.
 *
 * `preferences.prevNextDirection` is Leaflet's field — it is how a publisher
 * says "this reads forwards from post one", and it is the only thing that marks
 * a serial — so this pass warms it ahead of any reader rather than leaving each
 * publication to `ensurePublicationSerial` on first view.
 *
 * It used to do that by writing that single column, guarded by `IS NULL` so it
 * would never overwrite the tap. Both halves of that were wrong. Writing one
 * column left `cid` pointing at a record the row no longer matched, so every
 * CID-gated repair downstream saw a row that looked faithfully mirrored and
 * skipped it. And `IS NULL` meant the value could only ever be written once:
 * one stale read was permanent, with nothing on any schedule able to revisit
 * it. That is exactly how a comic came to be stored as an ordinary blog — the
 * record had said `"ltr"` for weeks.
 *
 * So it now re-upserts the whole record through {@link upsertPublication}: the
 * row and its `cid` move together and cannot disagree, and a later run can
 * always correct an earlier one. Records are read {@link
 * fetchRepoRecordWithFallback | PDS-first}, because a decision derived from a
 * cached copy is how the wrong value got written in the first place.
 *
 * Idempotent, and safe to re-run.
 */
export async function backfillSerialPublicationRecords(): Promise<{
  candidates: number;
  read: number;
  serials: number;
  failed: number;
}> {
  const candidates = await db
    .select({ uri: publications.uri, did: publications.did })
    .from(publications)
    .where(and(eq(publications.deleted, false), leafletPublication()))
    .orderBy(asc(publications.uri));

  let read = 0;
  let serials = 0;
  let failed = 0;

  await mapWithConcurrency(
    candidates,
    SERIAL_BACKFILL_CONCURRENCY,
    async ({ uri, did }): Promise<void> => {
      try {
        const identity = await resolveIdentity(did).catch(() => null);
        const fetched = await fetchRepoRecordWithFallback(
          uri,
          identity?.pds,
          undefined,
          { preferPds: true },
        );
        const value = fetched?.value;
        if (!value || typeof value !== "object") {
          failed += 1;
          return;
        }
        const record = value as PublicationRecord;

        // Write the whole record, not the one column. The bespoke UPDATE this
        // replaces set `prev_next_direction` while leaving `cid` untouched,
        // which made the row claim to be a faithful mirror of a record it no
        // longer matched — invisible to every CID-gated repair downstream.
        await upsertPublication(uri, did, rkeyOf(uri), fetched?.cid, record);

        read += 1;
        if (
          parsePrevNextDirection(record.preferences?.prevNextDirection) ===
          SERIAL_DIRECTION
        ) {
          serials += 1;
        }
      } catch (error) {
        failed += 1;
        logEvent("ingest.serialBackfill", {
          uri,
          error: error instanceof Error ? error.message : String(error),
          ok: false,
        });
      }
    },
  );

  return { candidates: candidates.length, read, serials, failed };
}

export interface RepoRepairResult extends RepoReconcileResult {
  /** Repo head at the PDS, null when it couldn't be read. */
  headRev: string | null;
  /** True when the head matched `last_seen_rev` and nothing was enumerated. */
  unchanged?: boolean;
  /** Reader-side records re-applied from the PDS. */
  repairedReaderRecords?: number;
}

/**
 * Bring a repo back in line with its PDS — the ingester noticing for itself
 * that a repo has moved on without us.
 *
 * **Why this exists.** tap is the write path for everything mirrored here, and
 * a tap subscription can stop delivering a repo while still reporting itself
 * healthy (`state: "active"`, no error, zero retries) — repos have sat weeks
 * behind their PDS that way, and nothing downstream could tell, because "no
 * events" and "no changes" look identical from the read-model. The only
 * trustworthy signal is the repo's own commit rev, so that is what this asks
 * for, and it asks the PDS rather than a cache.
 *
 * **Why it's cheap.** `last_seen_rev` records the head as of our last full
 * reconcile. A repo whose head still matches has provably not committed
 * anything since, so it costs exactly one request and stops there. Only a repo
 * that actually moved pays enumeration, and even then the CID gate means only
 * genuinely changed records are written.
 *
 * A head we cannot read is treated as "unknown", not "unchanged" — the repo is
 * reconciled anyway. Skipping repair on a failed lookup would reproduce the
 * exact silence this exists to break.
 */
export async function repairRepoFromArchive(
  did: string,
): Promise<RepoRepairResult> {
  const [tracked] = await db
    .select({ lastSeenSeq: trackedRepos.lastSeenSeq })
    .from(trackedRepos)
    .where(eq(trackedRepos.did, did))
    .limit(1);
  const lastSeenSeq = tracked?.lastSeenSeq ?? null;

  // A repo we have never folded gets a full rebuild — that is the case where
  // pruning is both safe and needed, and it is the one that replaces tap's
  // "register the repo and let it backfill".
  if (lastSeenSeq == null) {
    const result = await reconcileRepoFromArchive(did, { upsert: true });
    return { ...result, headRev: null, unchanged: false };
  }

  // Incremental: fold only what the archive has gained since we last swept
  // this repo. The planner drops every block at or below the watermark before
  // anything is downloaded, so a quiet repo costs one planning request and
  // yields nothing — the same "cheap when unchanged" property the PDS rev gate
  // had, without asking a third-party host for it.
  const fold = await foldRepoFromArchive(did, { afterSeq: lastSeenSeq });

  if (fold.gone) {
    return {
      did,
      gone: true,
      headRev: null,
      pdsDocuments: 0,
      pdsPublications: 0,
      prunedDocuments: 0,
      prunedPublications: 0,
      unchanged: false,
      unmirroredDocuments: 0,
      unmirroredPublications: 0,
      upsertedDocuments: 0,
    };
  }

  // Nothing new. Touch `updated_at` so the round-robin advances past it.
  if (fold.empty) {
    await db
      .update(trackedRepos)
      .set({
        reconcileFailCount: 0,
        reconcileRetryAfter: null,
        updatedAt: new Date(),
      })
      .where(eq(trackedRepos.did, did));
    return {
      did,
      headRev: null,
      pdsDocuments: 0,
      pdsPublications: 0,
      prunedDocuments: 0,
      prunedPublications: 0,
      unchanged: true,
      unmirroredDocuments: 0,
      unmirroredPublications: 0,
      upsertedDocuments: 0,
    };
  }

  // Deletes in the folded window were applied as events, so there is nothing to
  // prune: an incremental fold cannot distinguish "deleted" from "unchanged and
  // therefore absent". Pruning stays with the full rebuild above.
  //
  // Advance the watermark only now, after the records are in. Recording it
  // first would let a mid-way failure be remembered as a clean sync, and the
  // gate would then skip the repo forever.
  await db
    .update(trackedRepos)
    .set({
      lastSeenSeq: fold.lastSeq,
      reconcileFailCount: 0,
      reconcileRetryAfter: null,
      updatedAt: new Date(),
    })
    .where(eq(trackedRepos.did, did));

  return {
    did,
    headRev: null,
    pdsDocuments: 0,
    pdsPublications: 0,
    prunedDocuments: 0,
    prunedPublications: 0,
    repairedReaderRecords: fold.applied,
    unchanged: false,
    unmirroredDocuments: 0,
    unmirroredPublications: 0,
    upsertedDocuments: fold.applied,
  };
}

/** Round-robin publisher repos (least recently reconciled first).
 *
 * Repos marked `backfill_state = 'gone'` (PDS confirmed the repo was deleted /
 * migrated away) are excluded so the round-robin stops paying a 400 every
 * tick for repos that will not reappear on their resolved PDS. */
export async function reconcilePublisherReposBatch(
  limit = RECONCILE_BATCH_DEFAULT,
): Promise<{
  attempted: number;
  goneMarked: number;
  migrated: number;
  prunedDocuments: number;
  prunedPublications: number;
  results: Array<RepoReconcileResult>;
  /** How many of `attempted` came from the web-bridge quota, so the split is
   * visible in the cron's telemetry rather than inferred from the constant. */
  webBridgeAttempted: number;
}> {
  // Every tracked repo, not just publishers. Restricting this to
  // `publication`/`document` is what left readers with no safety net: a
  // `subscriber`/`reader` repo that tap stopped streaming was never visited by
  // anything, so their reads and subscriptions silently stopped arriving and
  // "mark all as read" sprang back. The seq watermark in `repairRepoFromArchive`
  // makes the wider set affordable — a quiet repo costs one request.
  //
  // Two selects rather than one, because the rev gate does *not* make bulk
  // web-bridge mirrors affordable (see {@link WEB_BRIDGE_BATCH_SHARE}). They
  // get a small quota beside the batch instead of competing for it, so a fleet
  // that is a third Bridgy mirrors doesn't spend a third of every lap on them.
  const dueForReconcile = and(
    ne(trackedRepos.backfillState, BACKFILL_STATE.gone),
    or(
      isNull(trackedRepos.reconcileRetryAfter),
      lte(trackedRepos.reconcileRetryAfter, new Date()),
    ),
  );

  const selectLane = (lane: "bridge" | "main", take: number) =>
    db
      .select({ did: trackedRepos.did })
      .from(trackedRepos)
      .where(
        and(
          dueForReconcile,
          lane === "bridge" ? isWebBridgeRepo : not(isWebBridgeRepo),
        ),
      )
      // Never-reconciled repos first, then least-recently-reconciled.
      //
      // The `last_seen_rev is null` term is what replaces tap's `/repos/add`.
      // Under tap, discovering a repo (a document's contributor, a
      // subscription's target) registered it and tap backfilled its history
      // within minutes. Jetstream needs no registration and already delivers
      // that repo's *new* records, but records it wrote before we were watching
      // still have to come off its PDS — and this sweep is now the only thing
      // that fetches them. Ordering by `updated_at` alone put a brand-new row
      // (stamped `now()` on insert) at the *back* of the lap, so that history
      // would sit unfetched for a full lap. A repo we have never reconciled has
      // no `last_seen_seq`, which is exactly the set to visit first.
      //
      // Written as raw SQL rather than `asc(...)`: Drizzle appends the
      // direction after the expression, which would emit `... is null asc desc`.
      .orderBy(
        sql`${trackedRepos.lastSeenSeq} is null desc, ${trackedRepos.updatedAt} asc`,
      )
      .limit(take);

  const webBridgeQuota = Math.max(1, Math.ceil(limit * WEB_BRIDGE_BATCH_SHARE));
  const [mainRepos, webBridgeRepos] = await Promise.all([
    selectLane("main", limit),
    selectLane("bridge", webBridgeQuota),
  ]);
  const repos = [...mainRepos, ...webBridgeRepos];

  const results: Array<RepoReconcileResult> = [];
  let prunedDocuments = 0;
  let prunedPublications = 0;
  let goneMarked = 0;
  let migrated = 0;

  await mapWithConcurrency(repos, RECONCILE_CONCURRENCY, async (repo) => {
    try {
      const result = await repairRepoFromArchive(repo.did);
      if (result.unchanged) {
        // Head matched `last_seen_rev` — one request, nothing to do.
        return;
      }
      if (result.gone) {
        // PDS reports the repo is permanently gone (and the migration retry
        // in `listRepoRecords` didn't recover a new PDS) — prune its
        // read-model rows and retire the tracked repo so the round-robin
        // skips it.
        const pruned = await markRepoGone(repo.did);
        goneMarked += 1;
        prunedDocuments += pruned.documents;
        prunedPublications += pruned.publications;
        logEvent("ingest.repoReconcile", {
          did: repo.did,
          gone: true,
          ok: true,
          prunedDocuments: pruned.documents,
          prunedPublications: pruned.publications,
        });
        return;
      }
      if (result.skipped) {
        // The archive plan matched nothing for this DID. Under the PDS sweep
        // the equivalent — an unresolvable host — was a failure worth backing
        // off. Here it is the ordinary state of a tracked repo that has never
        // written one of our records (a followed account, a contributor whose
        // own repo is empty), so it advances the round-robin without inflating
        // a failure count that would eventually park a perfectly healthy row.
        results.push(result);
        return;
      }
      // What the repair had to insert from scratch is the only measurement we
      // have of the live stream's loss rate. tap reports a dropped repo as
      // healthy (`state: "active"`, no error, no retries) and the ingester
      // acks the events it never got, so nothing on the write path can tell
      // us; this is the read-back that can. `pdsDocuments` rides along because
      // the ratio is what separates the two shapes: a handful out of hundreds
      // is stream loss, all-of-them is a repo whose first backfill the
      // round-robin simply reached first.
      if (result.unmirroredDocuments > 0 || result.unmirroredPublications > 0) {
        logEvent("ingest.repoStreamGap", {
          did: repo.did,
          ok: false,
          pdsDocuments: result.pdsDocuments,
          pdsPublications: result.pdsPublications,
          unmirroredDocuments: result.unmirroredDocuments,
          unmirroredPublications: result.unmirroredPublications,
        });
      }
      if (result.migrated) {
        migrated += 1;
        logEvent("ingest.repoReconcile", {
          did: repo.did,
          migrated: true,
          migratedFrom: result.migratedFrom,
          migratedTo: result.migratedTo,
          ok: true,
          pdsDocuments: result.pdsDocuments,
          pdsPublications: result.pdsPublications,
          prunedDocuments: result.prunedDocuments,
          prunedPublications: result.prunedPublications,
        });
      } else if (result.prunedDocuments > 0 || result.prunedPublications > 0) {
        logEvent("ingest.repoReconcile", {
          did: repo.did,
          ok: true,
          pdsDocuments: result.pdsDocuments,
          prunedDocuments: result.prunedDocuments,
          prunedPublications: result.prunedPublications,
        });
      }
      results.push(result);
      prunedDocuments += result.prunedDocuments;
      prunedPublications += result.prunedPublications;
    } catch (error: unknown) {
      const failCount = await bumpReconcileFailure(repo.did);
      logEvent("ingest.repoReconcile", {
        did: repo.did,
        error: error instanceof Error ? error.message : String(error),
        failCount,
        ok: false,
      });
    }
  });
  return {
    attempted: repos.length,
    goneMarked,
    migrated,
    prunedDocuments,
    prunedPublications,
    results,
    webBridgeAttempted: webBridgeRepos.length,
  };
}

/**
 * Repos eligible for the round-robin — the denominator of one full lap.
 *
 * Web-bridge mirrors are excluded because they are not on this lap: they run
 * their own, far slower one (see {@link WEB_BRIDGE_BATCH_SHARE}). Counting them
 * here would inflate the derived batch on their behalf and then hand those
 * extra slots to everyone else, quietly shortening the lap the sizing is
 * supposed to hold fixed.
 */
export async function countReconcilableRepos(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
    .from(trackedRepos)
    .where(
      and(
        ne(trackedRepos.backfillState, BACKFILL_STATE.gone),
        not(isWebBridgeRepo),
      ),
    );
  return row?.count ?? 0;
}

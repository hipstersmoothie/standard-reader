import { and, asc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { db } from "../../db/index.ts";
import {
  bookmarks,
  documents,
  labelerSubscriptions,
  listSaves,
  lists,
  publications,
  reads,
  recommends,
  sidebarPrefs,
  subscriptions,
  trackedRepos,
  userFollows,
} from "../../db/schema.ts";
import { chunk, mapWithConcurrency } from "../../lib/concurrency.ts";
import {
  SERIAL_DIRECTION,
  parsePrevNextDirection,
} from "../../lib/publication/serial.ts";
import {
  LEAFLET_HOST,
  LEAFLET_NSID_PREFIX,
} from "../../lib/publishing-platform.ts";
import {
  RepoGoneError,
  fetchRepoHeadRev,
  fetchRepoRecordWithFallback,
  listRepoRecords,
} from "../atproto/fetch-record.ts";
import { resolveIdentity } from "../atproto/identity.ts";
import type { DocumentRecord, PublicationRecord } from "../atproto/types.ts";
import { Collections } from "../atproto/uri.ts";
import { logEvent } from "../observability/log.ts";
import { handleRecord } from "./consumer.ts";
import { upsertDocument, upsertPublication } from "./handlers.ts";

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
 * hosts, so this is really this many requests deep against those few hosts,
 * and the same worker is serving live ingest at the same time.
 */
const RECONCILE_CONCURRENCY = 8;

/** Publisher repos reconciled per hourly recompute sweep. */
const RECONCILE_BATCH_DEFAULT = 50;
/** Publisher repos reconciled on each ingest timer tick. */
const RECONCILE_TICK_BATCH = 5;
/**
 * How often the ingest worker runs background PDS reconcile.
 *
 * Delete-gap repair (catching deletes tap missed) doesn't need to be
 * minute-fresh — a stale-deleted publication lingering in the read-model for
 * half an hour is low-impact, and the hourly recompute sweep already covers
 * the full set once an hour. 30 min spreads load without the 288-tick/day
 * noise of a 5-min interval (and the 400 storm for gone repos that drove
 * the `gone` state).
 */
export const RECONCILE_INTERVAL_MS = 30 * 60_000;

/**
 * Backoff after a reconcile failure (transient fetch error, or a PDS that
 * can't be resolved). Doubles per consecutive failure up to the cap, so a
 * persistently-broken DID stops being retried every tick — previously a
 * handful of permanently-failing DIDs could fill the entire
 * `RECONCILE_TICK_BATCH` every 30 minutes, forever, starving healthy repos
 * out of the round-robin.
 */
const RECONCILE_FAIL_BACKOFF_MS = RECONCILE_INTERVAL_MS;
const RECONCILE_FAIL_BACKOFF_MAX_MS = 24 * 60 * 60_000;

function nextRetryAfter(failCount: number): Date {
  const backoffMs = Math.min(
    RECONCILE_FAIL_BACKOFF_MS * 2 ** (failCount - 1),
    RECONCILE_FAIL_BACKOFF_MAX_MS,
  );
  return new Date(Date.now() + backoffMs);
}

/** Record a reconcile failure for `did` and schedule its next retry with
 * exponential backoff. Returns the new consecutive-failure count. */
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

/** URIs per `uri in (...)` lookup when reading mirrored CIDs. */
const CID_LOOKUP_CHUNK = 500;

/** Any mirrored record table — every one of ours is keyed `(uri, cid)`. */
type MirroredTable = PgTable & { uri: PgColumn; cid: PgColumn };

/**
 * Tables carrying a mirrored record's `cid`, keyed by collection.
 *
 * Every one of these has `(uri, cid)`, which is all the repair needs: the
 * record's CID *is* the content hash, so a listed record whose CID already
 * matches the mirrored row is byte-identical and can be skipped without
 * looking at it. That is what keeps a repair proportional to what actually
 * changed rather than to repo size — a 10,000-post repo with three new posts
 * costs three writes.
 *
 * `publication` and `document` are absent on purpose: {@link
 * reconcileRepoFromPds} already walks those two (it also prunes them), and
 * gates them with {@link mirroredCids} itself.
 */
const REPAIRABLE_COLLECTIONS: ReadonlyArray<{
  collection: string;
  table: MirroredTable;
}> = [
  { collection: Collections.read, table: reads },
  { collection: Collections.subscription, table: subscriptions },
  { collection: Collections.bookmark, table: bookmarks },
  { collection: Collections.recommend, table: recommends },
  { collection: Collections.list, table: lists },
  { collection: Collections.listSave, table: listSaves },
  { collection: Collections.labelerSubscription, table: labelerSubscriptions },
  {
    collection: Collections.labelerSubscriptionV2,
    table: labelerSubscriptions,
  },
  { collection: Collections.sidebarPref, table: sidebarPrefs },
  { collection: Collections.userFollow, table: userFollows },
];

/**
 * The CIDs we already hold for `uris`, as a `uri -> cid` map. A URI absent from
 * the map (or mapped to null) has never been mirrored, so it always repairs.
 */
async function mirroredCids(
  table: MirroredTable,
  uris: Array<string>,
): Promise<Map<string, string | null>> {
  const known = new Map<string, string | null>();
  for (const batch of chunk(uris, CID_LOOKUP_CHUNK)) {
    const rows = await db
      .select({ uri: table.uri, cid: table.cid })
      .from(table)
      .where(inArray(table.uri, batch));
    for (const row of rows) {
      known.set(String(row.uri), (row.cid as string | null) ?? null);
    }
  }
  return known;
}

/**
 * Records from `listed` that our read-model doesn't already hold verbatim.
 *
 * A record with no CID from the host can't be compared, so it repairs — an
 * unnecessary idempotent write is the safe side of that coin.
 */
function changedRecords(
  listed: Array<{ uri: string; cid?: string; value?: Record<string, unknown> }>,
  known: Map<string, string | null>,
): Array<{ uri: string; cid?: string; value?: Record<string, unknown> }> {
  return listed.filter((record) => {
    if (!record.value) return false;
    if (!record.cid) return true;
    return known.get(record.uri) !== record.cid;
  });
}

/**
 * Re-apply a repo's reader-side records (reads, subscriptions, bookmarks,
 * lists, …) from its PDS.
 *
 * These collections had no safety net at all: the reconcile round-robin only
 * ever selected `publication`/`document` repos, and even for those it only
 * walked those two collections. So when tap silently stopped streaming a
 * reader's repo, their reads simply stopped arriving and nothing on any
 * schedule would ever notice — which is what makes "mark all as read" spring
 * back to unread.
 *
 * Records are replayed through {@link handleRecord}, the same dispatcher tap
 * feeds, so a repaired row is written by exactly the code that writes a live
 * one. Deletes are *not* inferred here — a record missing from the PDS is left
 * alone rather than pruned. Enumerating a collection is not proof it was ever
 * populated (a host that 4xxs a collection returns the same empty list as a
 * reader who has never bookmarked anything), and treating that as "delete
 * everything" would erase a reader's history on a transient error. Prune stays
 * where the record set is corroborated: publications and documents.
 */
async function repairReaderCollections(
  did: string,
  pds: string | null,
  headRev: string | null,
): Promise<{ scanned: number; repaired: number }> {
  let scanned = 0;
  let repaired = 0;

  for (const { collection, table } of REPAIRABLE_COLLECTIONS) {
    const listed = await listRepoRecords(did, collection, pds).catch(
      (error: unknown) => {
        // A repo that has never used a collection is the common case and reads
        // as an error on some hosts; one unreadable collection must not abort
        // the rest of the repair.
        if (error instanceof RepoGoneError) throw error;
        return null;
      },
    );
    const records = listed?.records ?? [];
    if (records.length === 0) continue;
    scanned += records.length;

    const known = await mirroredCids(
      table,
      records.map((record) => record.uri),
    );
    for (const record of changedRecords(records, known)) {
      await handleRecord({
        action: "create",
        cid: record.cid,
        collection,
        did,
        // Not a firehose delivery — this record is being replayed from the
        // repo precisely because the live stream didn't bring it.
        live: false,
        record: record.value,
        rev: headRev ?? "",
        rkey: rkeyOf(record.uri),
      });
      repaired += 1;
    }
  }

  return { repaired, scanned };
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
export async function reconcileRepoFromPds(
  did: string,
  opts: { dryRun?: boolean; upsert?: boolean } = {},
): Promise<RepoReconcileResult> {
  const dryRun = opts.dryRun ?? false;
  const upsert = opts.upsert ?? false;

  const identity = await resolveIdentity(did);
  if (!identity.pds) {
    return {
      did,
      pdsDocuments: 0,
      pdsPublications: 0,
      prunedDocuments: 0,
      prunedPublications: 0,
      skipped: true,
      upsertedDocuments: 0,
    };
  }

  const pubResult = await listRepoRecords(
    did,
    Collections.publication,
    identity.pds,
  ).catch((error: unknown) => {
    if (error instanceof RepoGoneError) {
      return { gone: true as const };
    }
    throw error;
  });
  if ("gone" in pubResult) {
    return {
      did,
      gone: true,
      pdsDocuments: 0,
      pdsPublications: 0,
      prunedDocuments: 0,
      prunedPublications: 0,
      upsertedDocuments: 0,
    };
  }
  const pubs = pubResult.records;
  const livePubUris = new Set(pubs.map((record) => record.uri));
  if (upsert && !dryRun) {
    const known = await mirroredCids(
      publications,
      pubs.map((record) => record.uri),
    );
    for (const record of changedRecords(pubs, known)) {
      await upsertPublication(
        record.uri,
        did,
        rkeyOf(record.uri),
        record.cid,
        record.value as unknown as PublicationRecord,
      );
    }
  }

  const docResult = await listRepoRecords(
    did,
    Collections.document,
    identity.pds,
  ).catch((error: unknown) => {
    if (error instanceof RepoGoneError) {
      return { gone: true as const };
    }
    throw error;
  });
  if ("gone" in docResult) {
    return {
      did,
      gone: true,
      pdsDocuments: 0,
      pdsPublications: pubs.length,
      prunedDocuments: 0,
      prunedPublications: 0,
      upsertedDocuments: 0,
    };
  }
  const docs = docResult.records;
  const liveDocUris = new Set(docs.map((record) => record.uri));
  let upsertedDocuments = 0;
  if (upsert && !dryRun) {
    const known = await mirroredCids(
      documents,
      docs.map((record) => record.uri),
    );
    for (const record of changedRecords(docs, known)) {
      await upsertDocument(
        record.uri,
        did,
        rkeyOf(record.uri),
        record.cid,
        record.value as unknown as DocumentRecord,
      );
      upsertedDocuments += 1;
    }
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
        reconcileFailCount: 0,
        reconcileRetryAfter: null,
        updatedAt: new Date(),
      })
      .where(eq(trackedRepos.did, did));
  }

  // Surface migration if either fetch recovered records from a new PDS.
  const migrated = pubResult.migrated || docResult.migrated;
  const migratedFrom = pubResult.migratedFrom ?? docResult.migratedFrom;
  // `servedBy` is the host that actually served the records. When a migration
  // happened, that host is the new PDS — pick whichever result differs from
  // the cached identity's PDS (prefer the publications fetch, then docs).
  const migratedTo = migrated
    ? pubResult.servedBy === identity.pds
      ? docResult.servedBy === identity.pds
        ? identity.pds
        : docResult.servedBy
      : pubResult.servedBy
    : undefined;

  return {
    did,
    pdsDocuments: docs.length,
    pdsPublications: pubs.length,
    prunedDocuments: pruned.documents,
    prunedPublications: pruned.publications,
    upsertedDocuments,
    migrated: migrated || undefined,
    migratedFrom,
    migratedTo: migrated ? migratedTo : undefined,
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
export async function repairRepoIfAdvanced(
  did: string,
): Promise<RepoRepairResult> {
  const identity = await resolveIdentity(did);
  const headRev = await fetchRepoHeadRev(did, identity.pds);

  const [tracked] = await db
    .select({ lastSeenRev: trackedRepos.lastSeenRev })
    .from(trackedRepos)
    .where(eq(trackedRepos.did, did))
    .limit(1);

  if (headRev != null && tracked?.lastSeenRev === headRev) {
    // Nothing has been committed since we last mirrored this repo. Touch
    // `updated_at` so the round-robin still advances past it.
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
      headRev,
      pdsDocuments: 0,
      pdsPublications: 0,
      prunedDocuments: 0,
      prunedPublications: 0,
      unchanged: true,
      upsertedDocuments: 0,
    };
  }

  const result = await reconcileRepoFromPds(did, { upsert: true });

  if (result.gone || result.skipped) {
    return { ...result, headRev };
  }

  const reader = await repairReaderCollections(did, identity.pds, headRev);

  // Only now is the head the mark of a *completed* mirror. Recording it before
  // the repair would let a mid-way failure be remembered as a clean sync, and
  // the gate above would then skip the repo forever.
  if (headRev != null) {
    await db
      .update(trackedRepos)
      .set({ lastSeenRev: headRev, updatedAt: new Date() })
      .where(eq(trackedRepos.did, did));
  }

  return { ...result, headRev, repairedReaderRecords: reader.repaired };
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
}> {
  // Every tracked repo, not just publishers. Restricting this to
  // `publication`/`document` is what left readers with no safety net: a
  // `subscriber`/`reader` repo that tap stopped streaming was never visited by
  // anything, so their reads and subscriptions silently stopped arriving and
  // "mark all as read" sprang back. The rev gate in `repairRepoIfAdvanced`
  // makes the wider set affordable — a quiet repo costs one request.
  const repos = await db
    .select({ did: trackedRepos.did })
    .from(trackedRepos)
    .where(
      and(
        ne(trackedRepos.backfillState, BACKFILL_STATE.gone),
        or(
          isNull(trackedRepos.reconcileRetryAfter),
          lte(trackedRepos.reconcileRetryAfter, new Date()),
        ),
      ),
    )
    .orderBy(asc(trackedRepos.updatedAt))
    .limit(limit);

  const results: Array<RepoReconcileResult> = [];
  let prunedDocuments = 0;
  let prunedPublications = 0;
  let goneMarked = 0;
  let migrated = 0;

  await mapWithConcurrency(repos, RECONCILE_CONCURRENCY, async (repo) => {
    try {
      const result = await repairRepoIfAdvanced(repo.did);
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
        // Identity couldn't be resolved to a usable PDS (unreachable DID doc,
        // or a malformed/missing service endpoint) — back off like a
        // transient failure instead of retrying every tick.
        const failCount = await bumpReconcileFailure(repo.did);
        logEvent("ingest.repoReconcile", {
          did: repo.did,
          failCount,
          ok: false,
          reason: "unresolved-pds",
        });
        return;
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
  };
}

/** Periodic background reconcile — smaller batch than the hourly sweep. */
export function startPublisherRepoReconcile(): { stop: () => void } {
  const run = () => {
    void reconcilePublisherReposBatch(RECONCILE_TICK_BATCH).catch(
      (error: unknown) => {
        console.warn("[ingest] publisher repo reconcile failed", error);
      },
    );
  };
  const timer = setInterval(run, RECONCILE_INTERVAL_MS);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

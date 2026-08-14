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
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { db } from "../../db/index.ts";
import {
  bookmarks,
  documents,
  labelerSubscriptions,
  listSaves,
  lists,
  mutes,
  profiles,
  publications,
  reads,
  recommends,
  sidebarPrefs,
  subscriptions,
  trackedRepos,
  userFollows,
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
 * Does this error mean the repo cannot be read until its *contents* change?
 *
 * A PDS refuses to serve an entire collection when a single record in it fails
 * lexicon validation — Bridgy Fed writes `site.standard.document` tags past
 * `maxGraphemes 128`, and `listRecords` then 400s for that repo's whole
 * document collection. No amount of retrying fixes that; only the author
 * rewriting the offending record does, and we cannot observe that happening
 * except through the very call that is failing.
 *
 * So these jump straight to the ceiling instead of climbing to it over a week
 * of daily failures. Classified by the error and never by the handle: this is
 * emphatically not a Bridgy-only problem — of the repos stuck in backoff, a
 * quarter are `ap.brid.gy` or ordinary repos.
 */
function isPermanentlyUnreadable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes("400: InvalidRequest") &&
    error.message.includes("listRecords")
  );
}

/**
 * Share of a batch given to bulk web-bridge mirrors, on top of the batch.
 *
 * The round-robin's affordability rests on the rev gate: "a quiet repo costs
 * one request". Bulk `*.web.brid.gy` mirrors are never quiet — Bridgy Fed
 * rewrites them continuously — so the gate opens on essentially every visit and
 * each one re-lists and re-applies a whole repo, up to a couple of thousand
 * documents. At a third of the fleet they were a third of every batch, and
 * measured at ~72k document rows an hour: more rows than the ingest worker's
 * three tap channels deliver events, and all of it against the same Neon pool
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

function nextRetryAfter(failCount: number, permanent: boolean): Date {
  const backoffMs = permanent
    ? RECONCILE_FAIL_BACKOFF_MAX_MS
    : Math.min(
        RECONCILE_FAIL_BACKOFF_MS * 2 ** (failCount - 1),
        RECONCILE_FAIL_BACKOFF_MAX_MS,
      );
  return new Date(Date.now() + backoffMs);
}

/** Record a reconcile failure for `did` and schedule its next retry with
 * exponential backoff. Returns the new consecutive-failure count.
 *
 * `permanent` skips the climb and parks the repo at the ceiling — see
 * {@link isPermanentlyUnreadable}. */
async function bumpReconcileFailure(
  did: string,
  { permanent = false }: { permanent?: boolean } = {},
): Promise<number> {
  const [row] = await db
    .update(trackedRepos)
    .set({ reconcileFailCount: sql`${trackedRepos.reconcileFailCount} + 1` })
    .where(eq(trackedRepos.did, did))
    .returning({ reconcileFailCount: trackedRepos.reconcileFailCount });
  const failCount = row?.reconcileFailCount ?? 1;
  await db
    .update(trackedRepos)
    .set({ reconcileRetryAfter: nextRetryAfter(failCount, permanent) })
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
  { collection: Collections.mute, table: mutes },
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
 * How many of `listed` the read-model has never held under any CID.
 *
 * This is the repair measuring the live stream's loss rate. A record here is
 * one tap never delivered — not one it delivered and we then reconsidered, so
 * `has` rather than a CID comparison: {@link dedupeRecords} soft-deletes
 * identical-content duplicates, and those rows stay in the map and stay
 * uncounted. Otherwise every repair of a repo that once published a duplicate
 * would report a permanent phantom gap.
 */
function unmirroredCount(
  listed: Array<{ uri: string; value?: Record<string, unknown> }>,
  known: Map<string, string | null>,
): number {
  return listed.filter((record) => record.value && !known.has(record.uri))
    .length;
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
      unmirroredDocuments: 0,
      unmirroredPublications: 0,
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
      unmirroredDocuments: 0,
      unmirroredPublications: 0,
      upsertedDocuments: 0,
    };
  }
  const pubs = pubResult.records;
  const livePubUris = new Set(pubs.map((record) => record.uri));
  let unmirroredPublications = 0;
  if (upsert && !dryRun) {
    const known = await mirroredCids(
      publications,
      pubs.map((record) => record.uri),
    );
    unmirroredPublications = unmirroredCount(pubs, known);
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
      unmirroredDocuments: 0,
      unmirroredPublications,
      upsertedDocuments: 0,
    };
  }
  const docs = docResult.records;
  const liveDocUris = new Set(docs.map((record) => record.uri));
  let upsertedDocuments = 0;
  let unmirroredDocuments = 0;
  if (upsert && !dryRun) {
    const known = await mirroredCids(
      documents,
      docs.map((record) => record.uri),
    );
    unmirroredDocuments = unmirroredCount(docs, known);
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
    unmirroredDocuments,
    unmirroredPublications,
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
      unmirroredDocuments: 0,
      unmirroredPublications: 0,
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
  /** How many of `attempted` came from the web-bridge quota, so the split is
   * visible in the cron's telemetry rather than inferred from the constant. */
  webBridgeAttempted: number;
}> {
  // Every tracked repo, not just publishers. Restricting this to
  // `publication`/`document` is what left readers with no safety net: a
  // `subscriber`/`reader` repo that tap stopped streaming was never visited by
  // anything, so their reads and subscriptions silently stopped arriving and
  // "mark all as read" sprang back. The rev gate in `repairRepoIfAdvanced`
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
      .orderBy(asc(trackedRepos.updatedAt))
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
      const permanent = isPermanentlyUnreadable(error);
      const failCount = await bumpReconcileFailure(repo.did, { permanent });
      logEvent("ingest.repoReconcile", {
        did: repo.did,
        error: error instanceof Error ? error.message : String(error),
        failCount,
        ok: false,
        permanent,
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

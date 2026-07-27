import { and, asc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { documents, publications, trackedRepos } from "../../db/schema.ts";
import { RepoGoneError, listRepoRecords } from "../atproto/fetch-record.ts";
import { resolveIdentity } from "../atproto/identity.ts";
import type { DocumentRecord, PublicationRecord } from "../atproto/types.ts";
import { Collections } from "../atproto/uri.ts";
import { logEvent } from "../observability/log.ts";
import { upsertDocument, upsertPublication } from "./handlers.ts";

const DELETE_CHUNK = 500;

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

async function deleteInChunks(
  table: typeof documents | typeof publications,
  uris: Array<string>,
): Promise<number> {
  if (uris.length === 0) {
    return 0;
  }
  for (let i = 0; i < uris.length; i += DELETE_CHUNK) {
    const chunk = uris.slice(i, i + DELETE_CHUNK);
    await db.delete(table).where(inArray(table.uri, chunk));
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
    for (const record of pubs) {
      if (!record.value) {
        continue;
      }
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
    for (const record of docs) {
      if (!record.value) {
        continue;
      }
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
  const repos = await db
    .select({ did: trackedRepos.did })
    .from(trackedRepos)
    .where(
      and(
        or(
          eq(trackedRepos.reason, "publication"),
          eq(trackedRepos.reason, "document"),
        ),
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

  for (const repo of repos) {
    try {
      const result = await reconcileRepoFromPds(repo.did);
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
        continue;
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
        continue;
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
  }

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

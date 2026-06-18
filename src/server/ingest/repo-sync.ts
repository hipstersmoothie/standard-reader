import type { DocumentRecord, PublicationRecord } from "../atproto/types.ts";

import { asc, eq, inArray, or } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { documents, publications, trackedRepos } from "../../db/schema.ts";
import { resolveIdentity } from "../atproto/identity.ts";
import { logEvent } from "../observability/log.ts";
import { Collections } from "../atproto/uri.ts";
import { upsertDocument, upsertPublication } from "./handlers.ts";

const LIST_PAGE = 100;
const FETCH_TIMEOUT_MS = 15_000;
const DELETE_CHUNK = 500;

/** Publisher repos reconciled per hourly recompute sweep. */
const RECONCILE_BATCH_DEFAULT = 50;
/** Publisher repos reconciled on each ingest timer tick. */
const RECONCILE_TICK_BATCH = 5;
/** How often the ingest worker runs background PDS reconcile. */
export const RECONCILE_INTERVAL_MS = 5 * 60_000;

interface ListedRecord {
  uri: string;
  cid?: string;
  value?: Record<string, unknown>;
}

export interface RepoReconcileResult {
  did: string;
  pdsPublications: number;
  pdsDocuments: number;
  upsertedDocuments: number;
  prunedPublications: number;
  prunedDocuments: number;
  skipped?: boolean;
}

function rkeyOf(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

export async function listPdsRecords(
  pds: string,
  did: string,
  collection: string,
): Promise<Array<ListedRecord>> {
  const records: Array<ListedRecord> = [];
  let cursor: string | undefined;
  do {
    const url = new URL("/xrpc/com.atproto.repo.listRecords", pds);
    url.searchParams.set("repo", did);
    url.searchParams.set("collection", collection);
    url.searchParams.set("limit", String(LIST_PAGE));
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`listRecords ${collection} failed: ${res.status}`);
    }
    const body = (await res.json()) as {
      cursor?: string;
      records?: Array<ListedRecord>;
    };
    records.push(...(body.records ?? []));
    cursor =
      (body.records?.length ?? 0) === LIST_PAGE ? body.cursor : undefined;
  } while (cursor);
  return records;
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
 * Compare a repo's `site.standard.*` records against its PDS and prune
 * read-model rows that no longer exist on-chain. Optionally upsert live
 * records (manual backfill). The PDS is the source of truth for deletes tap
 * missed (dead-letter cap, stream gaps, out-of-order backfill).
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

  const pubs = await listPdsRecords(identity.pds, did, Collections.publication);
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

  const docs = await listPdsRecords(identity.pds, did, Collections.document);
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
      .set({ updatedAt: new Date() })
      .where(eq(trackedRepos.did, did));
  }

  return {
    did,
    pdsDocuments: docs.length,
    pdsPublications: pubs.length,
    prunedDocuments: pruned.documents,
    prunedPublications: pruned.publications,
    upsertedDocuments,
  };
}

/** Round-robin publisher repos (least recently reconciled first). */
export async function reconcilePublisherReposBatch(
  limit = RECONCILE_BATCH_DEFAULT,
): Promise<{
  attempted: number;
  prunedDocuments: number;
  prunedPublications: number;
  results: Array<RepoReconcileResult>;
}> {
  const repos = await db
    .select({ did: trackedRepos.did })
    .from(trackedRepos)
    .where(
      or(
        eq(trackedRepos.reason, "publication"),
        eq(trackedRepos.reason, "document"),
      ),
    )
    .orderBy(asc(trackedRepos.updatedAt))
    .limit(limit);

  const results: Array<RepoReconcileResult> = [];
  let prunedDocuments = 0;
  let prunedPublications = 0;

  for (const repo of repos) {
    try {
      const result = await reconcileRepoFromPds(repo.did);
      results.push(result);
      prunedDocuments += result.prunedDocuments;
      prunedPublications += result.prunedPublications;
      if (result.prunedDocuments > 0 || result.prunedPublications > 0) {
        logEvent("ingest.repoReconcile", {
          did: repo.did,
          ok: true,
          pdsDocuments: result.pdsDocuments,
          prunedDocuments: result.prunedDocuments,
          prunedPublications: result.prunedPublications,
        });
      }
    } catch (error: unknown) {
      logEvent("ingest.repoReconcile", {
        did: repo.did,
        error: error instanceof Error ? error.message : String(error),
        ok: false,
      });
    }
  }

  return {
    attempted: repos.length,
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

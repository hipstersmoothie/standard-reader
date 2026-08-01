import { and, eq, inArray, sql } from "drizzle-orm";

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import { COLLECTION } from "#/lib/atproto/nsids";
import { subjectRkey } from "#/server/atproto/repo-records";
import { buildAtUri, didFromAtUri } from "#/server/atproto/uri";
import { logEvent } from "#/server/observability/log";

/**
 * Eagerly mirror a reader's own personal-state writes — reads, bookmarks, and
 * likes — into the Neon read-model, instead of waiting for the tap ingester to
 * replay them.
 *
 * The repo on the PDS is still the source of truth and the tap is still the
 * general read path (`CLAUDE.md` — "never hit the PDS for reads"). But the tap
 * is a shared, back-pressured queue: when it is backlogged, a reader's *own*
 * state — the toggles they watch change in the moment — lagged by however deep
 * the queue was, which readers experienced as an article staying unread for
 * hours after they read it. We already know exactly what the PDS committed at
 * write time, so we write the same row the tap would have written and let the
 * tap's later replay land on top of it.
 *
 * That replay is idempotent: rows are keyed by the record AT-URI, and both this
 * module and {@link file://./../ingest/handlers.ts} derive that URI from the
 * same deterministic `(repo, collection, subject-hash rkey)`, so ingest's
 * `upsertX` overwrites our row with identical values rather than duplicating
 * it. Ordering is likewise safe by construction: firehose events for one repo
 * are replayed in commit order, so a stale queued `create` can briefly resurrect
 * a row we removed here, and the `delete` immediately behind it in the same
 * backlog removes it again. The mirror converges on the repo, never diverges
 * from it.
 *
 * Removals delete **by record AT-URI**, not by `(owner, document)`. The write
 * path only ever deletes the record at its own deterministic rkey, so another
 * client's record for the same document survives on the PDS — and its mirrored
 * row has to survive with it. Clearing the edge instead would show the reader an
 * un-liked heart that the next reconcile sweep flips back.
 *
 * Mirroring is best-effort: it runs *after* the PDS write has committed, so a
 * failure here degrades to the pre-existing behavior (wait for the tap) rather
 * than failing a write the reader already made.
 *
 * Follows and subscriptions already do this by calling ingest's `upsertX`
 * helpers straight from the write handler. These three get their own module
 * because reads are written in bulk — "mark all read" can be thousands of
 * records — so the mirror has to batch, and because these run in a request,
 * where the pooled `context.db` handle belongs rather than ingest's singleton.
 */

/** The AT-URI a `collection` record about `documentUri` takes in `ownerDid`'s repo. */
function edgeRecordUri(
  ownerDid: string,
  collection: string,
  documentUri: string,
): string {
  return buildAtUri(ownerDid, collection, subjectRkey(documentUri));
}

/** The AT-URI of the read record for `documentUri` in `ownerDid`'s repo. */
export function readRecordUri(ownerDid: string, documentUri: string): string {
  return edgeRecordUri(ownerDid, COLLECTION.read, documentUri);
}

/** The AT-URI of the bookmark record for `documentUri` in `ownerDid`'s repo. */
export function bookmarkRecordUri(
  ownerDid: string,
  documentUri: string,
): string {
  return edgeRecordUri(ownerDid, COLLECTION.bookmark, documentUri);
}

/** The AT-URI of the recommend record for `documentUri` in `ownerDid`'s repo. */
export function recommendRecordUri(
  ownerDid: string,
  documentUri: string,
): string {
  return edgeRecordUri(ownerDid, COLLECTION.recommend, documentUri);
}

/** One record the PDS accepted, as far as the mirror needs to know it. */
export interface MirroredEdge {
  documentUri: string;
  /** Record CID, when the PDS returned one (`applyWrites` may omit results). */
  cid?: string | null;
}

/**
 * Rows per INSERT. Marking a large backlog read is already chunked to the
 * PDS `applyWrites` cap (200); this keeps a single mirror statement bounded
 * for callers that hand us a whole batch at once.
 */
const MIRROR_INSERT_CHUNK = 200;

/** Columns shared by the `reads`, `bookmarks`, and `recommends` mirrors. */
function edgeValues(
  ownerDid: string,
  collection: string,
  edge: MirroredEdge,
  createdAt: Date,
) {
  return {
    cid: edge.cid ?? null,
    createdAt,
    deleted: false,
    documentDid: didFromAtUri(edge.documentUri),
    documentUri: edge.documentUri,
    rkey: subjectRkey(edge.documentUri),
    uri: edgeRecordUri(ownerDid, collection, edge.documentUri),
  };
}

/**
 * What an upsert overwrites when the row is already there — either because the
 * tap got here first, or because the reader re-wrote the record (re-opening an
 * article rewrites its read with a fresh `createdAt`).
 */
const CONFLICT_SET = {
  cid: sql`excluded.cid`,
  createdAt: sql`excluded.created_at`,
  deleted: false,
  documentDid: sql`excluded.document_did`,
  updatedAt: sql`now()`,
};

/** Run a mirror write, logging rather than throwing — see the module JSDoc. */
async function bestEffort(
  event: string,
  attrs: { did: string; count: number },
  write: () => Promise<void>,
): Promise<void> {
  try {
    await write();
  } catch (error) {
    // The PDS write is already durable; the tap will still replay it.
    logEvent(event, {
      ...attrs,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function chunked<T>(items: Array<T>, size: number): Array<Array<T>> {
  const chunks: Array<Array<T>> = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// ── Reads (app.standard-reader.read) ────────────────────────────────────────

/**
 * Upsert `reads` rows for records just written to `ownerDid`'s repo.
 *
 * Mirrors ingest's `upsertRead` exactly — same URI, same columns — so whichever
 * lands second is a no-op in content.
 */
export async function mirrorReadsMarked(
  db: Db,
  schema: Schema,
  options: {
    ownerDid: string;
    reads: Array<MirroredEdge>;
    /** `createdAt` written into the records (ISO 8601). */
    createdAt: string;
  },
): Promise<void> {
  const { createdAt, ownerDid, reads } = options;
  if (reads.length === 0) return;

  const readAt = new Date(createdAt);
  const rows = reads.map((read) => ({
    ...edgeValues(ownerDid, COLLECTION.read, read, readAt),
    ownerDid,
  }));

  await bestEffort(
    "reader.mirrorReadsFailed",
    { count: rows.length, did: ownerDid },
    async () => {
      for (const chunk of chunked(rows, MIRROR_INSERT_CHUNK)) {
        await db
          .insert(schema.reads)
          .values(chunk)
          .onConflictDoUpdate({ set: CONFLICT_SET, target: schema.reads.uri });
      }
    },
  );
}

/** Remove the mirrored `reads` row for a record just deleted from the repo. */
export async function mirrorReadRemoved(
  db: Db,
  schema: Schema,
  options: { ownerDid: string; documentUri: string },
): Promise<void> {
  await mirrorReadsRemoved(db, schema, {
    documentUris: [options.documentUri],
    ownerDid: options.ownerDid,
  });
}

/** Remove mirrored `reads` rows for records just deleted from the repo. */
export async function mirrorReadsRemoved(
  db: Db,
  schema: Schema,
  options: { ownerDid: string; documentUris: Array<string> },
): Promise<void> {
  const { documentUris, ownerDid } = options;
  if (documentUris.length === 0) return;

  const uris = documentUris.map((documentUri) =>
    readRecordUri(ownerDid, documentUri),
  );

  await bestEffort(
    "reader.mirrorUnreadFailed",
    { count: uris.length, did: ownerDid },
    async () => {
      await db
        .delete(schema.reads)
        .where(
          and(
            eq(schema.reads.ownerDid, ownerDid),
            inArray(schema.reads.uri, uris),
          ),
        );
    },
  );
}

// ── Bookmarks (app.standard-reader.bookmark) ────────────────────────────────

/** Upsert the `bookmarks` row for a record just written to `ownerDid`'s repo. */
export async function mirrorBookmarkSaved(
  db: Db,
  schema: Schema,
  options: {
    ownerDid: string;
    documentUri: string;
    cid?: string | null;
    /** `createdAt` written into the record (ISO 8601). */
    createdAt: string;
  },
): Promise<void> {
  const { cid, createdAt, documentUri, ownerDid } = options;
  const row = {
    ...edgeValues(
      ownerDid,
      COLLECTION.bookmark,
      { cid, documentUri },
      new Date(createdAt),
    ),
    ownerDid,
  };

  await bestEffort(
    "reader.mirrorBookmarkFailed",
    { count: 1, did: ownerDid },
    async () => {
      await db.insert(schema.bookmarks).values(row).onConflictDoUpdate({
        set: CONFLICT_SET,
        target: schema.bookmarks.uri,
      });
    },
  );
}

/** Remove the mirrored `bookmarks` row for a record just deleted from the repo. */
export async function mirrorBookmarkRemoved(
  db: Db,
  schema: Schema,
  options: { ownerDid: string; documentUri: string },
): Promise<void> {
  const { documentUri, ownerDid } = options;

  await bestEffort(
    "reader.mirrorUnbookmarkFailed",
    { count: 1, did: ownerDid },
    async () => {
      await db
        .delete(schema.bookmarks)
        .where(
          and(
            eq(schema.bookmarks.ownerDid, ownerDid),
            eq(schema.bookmarks.uri, bookmarkRecordUri(ownerDid, documentUri)),
          ),
        );
    },
  );
}

// ── Likes (site.standard.graph.recommend) ───────────────────────────────────

/**
 * Upsert the `recommends` row for a record just written to `recommenderDid`'s
 * repo. Article like counts are a live count over this table
 * (`documentRecommendCountSql`), so the count moves with the heart.
 */
export async function mirrorRecommendAdded(
  db: Db,
  schema: Schema,
  options: {
    recommenderDid: string;
    documentUri: string;
    cid?: string | null;
    /** `createdAt` written into the record (ISO 8601). */
    createdAt: string;
  },
): Promise<void> {
  const { cid, createdAt, documentUri, recommenderDid } = options;
  const row = {
    ...edgeValues(
      recommenderDid,
      COLLECTION.recommend,
      { cid, documentUri },
      new Date(createdAt),
    ),
    recommenderDid,
  };

  await bestEffort(
    "reader.mirrorRecommendFailed",
    { count: 1, did: recommenderDid },
    async () => {
      await db.insert(schema.recommends).values(row).onConflictDoUpdate({
        set: CONFLICT_SET,
        target: schema.recommends.uri,
      });
    },
  );
}

/** Remove the mirrored `recommends` row for a record just deleted from the repo. */
export async function mirrorRecommendRemoved(
  db: Db,
  schema: Schema,
  options: { recommenderDid: string; documentUri: string },
): Promise<void> {
  const { documentUri, recommenderDid } = options;

  await bestEffort(
    "reader.mirrorUnrecommendFailed",
    { count: 1, did: recommenderDid },
    async () => {
      await db
        .delete(schema.recommends)
        .where(
          and(
            eq(schema.recommends.recommenderDid, recommenderDid),
            eq(
              schema.recommends.uri,
              recommendRecordUri(recommenderDid, documentUri),
            ),
          ),
        );
    },
  );
}

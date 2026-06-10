import type {
  ComAtprotoRepoDeleteRecord,
  ComAtprotoRepoGetRecord,
  ComAtprotoRepoListRecords,
  ComAtprotoRepoPutRecord,
} from "@atcute/atproto";
import type { Client } from "@atcute/client";
import type { InferInput } from "@atcute/lexicons/validations";

import { ok } from "@atcute/client";
import { now as tidNow } from "@atcute/tid";
import { COLLECTION } from "#/lib/atproto/nsids";
import { createHash } from "node:crypto";

/**
 * Server-only helpers for writing the reader's personal state back to their own
 * AT Proto repo (the source of truth — see `APP_VISION.md` §5). The Neon
 * read-model is a cache fed by tap, so these only touch the PDS; the cache
 * catches up asynchronously and the UI updates optimistically.
 *
 * Mirrors `~/Documents/at-store/src/lib/atproto/repo-records.ts`, but uses
 * `putRecord` for idempotent upserts (no get→create waterfall) and derives a
 * deterministic rkey from the subject so create / delete / status all address
 * the same record without a lookup.
 */

type RepoGetRecordParams = InferInput<
  typeof ComAtprotoRepoGetRecord.mainSchema.params
>;
type RepoPutRecordInput = InferInput<
  (typeof ComAtprotoRepoPutRecord.mainSchema.input)["schema"]
>;
type RepoDeleteRecordInput = InferInput<
  (typeof ComAtprotoRepoDeleteRecord.mainSchema.input)["schema"]
>;
type RepoListRecordsParams = InferInput<
  typeof ComAtprotoRepoListRecords.mainSchema.params
>;

/** Runtime values are validated by the PDS; narrow plain strings to lexicon-branded types. */
function lexGetRecordParams(args: {
  repo: string;
  collection: string;
  rkey: string;
}): RepoGetRecordParams {
  return args as RepoGetRecordParams;
}

function lexPutRecordInput(args: {
  repo: string;
  collection: string;
  rkey: string;
  record: Record<string, unknown>;
}): RepoPutRecordInput {
  return args as RepoPutRecordInput;
}

function lexDeleteRecordInput(args: {
  repo: string;
  collection: string;
  rkey: string;
}): RepoDeleteRecordInput {
  return args as RepoDeleteRecordInput;
}

function lexListRecordsParams(args: {
  repo: string;
  collection: string;
  limit?: number;
  cursor?: string;
}): RepoListRecordsParams {
  return args as RepoListRecordsParams;
}

/**
 * Deterministic record key for a subject AT-URI. The same subject always maps to
 * the same rkey within a repo, so a toggle (create ⇄ delete) and a status check
 * all address one record — no listing/scan required. Hex of SHA-256 is well
 * within the rkey charset (`a-f0-9`) and length limits.
 */
export function subjectRkey(subject: string): string {
  return createHash("sha256").update(subject).digest("hex").slice(0, 32);
}

/** Create or replace a record at a fixed `(collection, rkey)` (idempotent upsert). */
async function repoPutRecord(
  client: Client,
  input: {
    repo: string;
    collection: string;
    rkey: string;
    record: Record<string, unknown>;
  },
): Promise<{ uri: string; cid: string }> {
  const res = await ok(
    client.post("com.atproto.repo.putRecord", {
      input: lexPutRecordInput(input),
    }),
  );
  return { uri: res.uri, cid: res.cid };
}

/** Delete a record by `(collection, rkey)`. Succeeds even if it's already gone. */
async function repoDeleteRecord(
  client: Client,
  input: { repo: string; collection: string; rkey: string },
): Promise<void> {
  await ok(
    client.post("com.atproto.repo.deleteRecord", {
      input: lexDeleteRecordInput(input),
    }),
  );
}

/** Whether a record exists at `(collection, rkey)` in the repo. */
async function repoHasRecord(
  client: Client,
  input: { repo: string; collection: string; rkey: string },
): Promise<boolean> {
  const existing = await client.get("com.atproto.repo.getRecord", {
    params: lexGetRecordParams(input),
  });
  return existing.ok && existing.data?.cid != null;
}

// ── Domain helpers ──────────────────────────────────────────────────────────

/** Write a `site.standard.graph.subscription` (a follow) for `publicationUri`. */
export async function putSubscriptionRecord(
  client: Client,
  repo: string,
  publicationUri: string,
  createdAt: string,
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.subscription,
    rkey: subjectRkey(publicationUri),
    record: {
      $type: COLLECTION.subscription,
      publication: publicationUri,
      createdAt,
    },
  });
}

/**
 * Delete every subscription record for `publicationUri`. Other writers (e.g.
 * Leaflet auto-subscribing an owner to their own publication) create records at
 * TID rkeys rather than our deterministic `subjectRkey`, and a repo can hold
 * several records for the same pair — so the caller passes the rkeys it knows
 * about (from the read-model) and we delete those plus the deterministic one.
 */
export async function deleteSubscriptionRecords(
  client: Client,
  repo: string,
  publicationUri: string,
  knownRkeys: Array<string> = [],
): Promise<void> {
  const rkeys = new Set([subjectRkey(publicationUri), ...knownRkeys]);
  await Promise.all(
    [...rkeys].map((rkey) =>
      repoDeleteRecord(client, {
        repo,
        collection: COLLECTION.subscription,
        rkey,
      }),
    ),
  );
}

/** Write a `site.standard.graph.recommend` (like) for `documentUri`. */
export async function putRecommendRecord(
  client: Client,
  repo: string,
  documentUri: string,
  createdAt: string,
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.recommend,
    rkey: subjectRkey(documentUri),
    record: {
      $type: COLLECTION.recommend,
      document: documentUri,
      createdAt,
    },
  });
}

export async function deleteRecommendRecord(
  client: Client,
  repo: string,
  documentUri: string,
): Promise<void> {
  return repoDeleteRecord(client, {
    repo,
    collection: COLLECTION.recommend,
    rkey: subjectRkey(documentUri),
  });
}

/** Write an `app.standard-reader.read` marking `documentUri` read. */
export async function putReadRecord(
  client: Client,
  repo: string,
  documentUri: string,
  createdAt: string,
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.read,
    rkey: subjectRkey(documentUri),
    record: {
      $type: COLLECTION.read,
      subject: documentUri,
      createdAt,
    },
  });
}

export async function deleteReadRecord(
  client: Client,
  repo: string,
  documentUri: string,
): Promise<void> {
  return repoDeleteRecord(client, {
    repo,
    collection: COLLECTION.read,
    rkey: subjectRkey(documentUri),
  });
}

/** Write an `app.standard-reader.bookmark` saving `documentUri` for later. */
export async function putBookmarkRecord(
  client: Client,
  repo: string,
  documentUri: string,
  createdAt: string,
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.bookmark,
    rkey: subjectRkey(documentUri),
    record: {
      $type: COLLECTION.bookmark,
      subject: documentUri,
      createdAt,
    },
  });
}

export async function deleteBookmarkRecord(
  client: Client,
  repo: string,
  documentUri: string,
): Promise<void> {
  return repoDeleteRecord(client, {
    repo,
    collection: COLLECTION.bookmark,
    rkey: subjectRkey(documentUri),
  });
}

// ── Publication lists (app.standard-reader.list / .listSave) ────────────────

/** A raw record as listed from the repo (value validated by the caller). */
export interface ListedRecord {
  uri: string;
  rkey: string;
  value: unknown;
}

const LIST_RECORDS_PAGE = 100;

/**
 * Enumerate every record in one of the reader's own collections. Lists and
 * list-saves aren't mirrored into the Neon read-model (they're app-personal
 * state with no cross-network query), so the user's own repo is read directly
 * — which also means an edit is visible on the next read, no ingest lag.
 */
export async function listCollectionRecords(
  client: Client,
  repo: string,
  collection: string,
): Promise<Array<ListedRecord>> {
  const records: Array<ListedRecord> = [];
  let cursor: string | undefined;
  do {
    const res = await ok(
      client.get("com.atproto.repo.listRecords", {
        params: lexListRecordsParams({
          repo,
          collection,
          limit: LIST_RECORDS_PAGE,
          cursor,
        }),
      }),
    );
    for (const record of res.records) {
      const rkey = record.uri.slice(record.uri.lastIndexOf("/") + 1);
      records.push({ uri: record.uri, rkey, value: record.value });
    }
    cursor = res.records.length === LIST_RECORDS_PAGE ? res.cursor : undefined;
  } while (cursor);
  return records;
}

/** New TID rkey for a list (creation-time sortable). */
export function newListRkey(): string {
  return tidNow();
}

/** Create or replace an `app.standard-reader.list` at `rkey`. */
export async function putListRecord(
  client: Client,
  repo: string,
  rkey: string,
  list: {
    name: string;
    description?: string;
    publications: Array<string>;
    createdAt: string;
  },
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.list,
    rkey,
    record: {
      $type: COLLECTION.list,
      name: list.name,
      ...(list.description ? { description: list.description } : {}),
      publications: list.publications,
      createdAt: list.createdAt,
    },
  });
}

export async function deleteListRecord(
  client: Client,
  repo: string,
  rkey: string,
): Promise<void> {
  return repoDeleteRecord(client, {
    repo,
    collection: COLLECTION.list,
    rkey,
  });
}

/**
 * Write an `app.standard-reader.listSave` for `listUri` (adding someone
 * else's list). Deterministic rkey, so save ⇄ unsave ⇄ status all address one
 * record.
 */
export async function putListSaveRecord(
  client: Client,
  repo: string,
  listUri: string,
  createdAt: string,
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.listSave,
    rkey: subjectRkey(listUri),
    record: {
      $type: COLLECTION.listSave,
      list: listUri,
      createdAt,
    },
  });
}

export async function deleteListSaveRecord(
  client: Client,
  repo: string,
  listUri: string,
): Promise<void> {
  return repoDeleteRecord(client, {
    repo,
    collection: COLLECTION.listSave,
    rkey: subjectRkey(listUri),
  });
}

/** Whether the reader has saved `listUri` (an `app.standard-reader.listSave`). */
export async function hasListSaveRecord(
  client: Client,
  repo: string,
  listUri: string,
): Promise<boolean> {
  return repoHasRecord(client, {
    repo,
    collection: COLLECTION.listSave,
    rkey: subjectRkey(listUri),
  });
}

export { repoHasRecord };

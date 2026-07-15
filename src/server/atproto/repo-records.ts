import { createHash } from "node:crypto";

import type {
  ComAtprotoRepoDeleteRecord,
  ComAtprotoRepoGetRecord,
  ComAtprotoRepoListRecords,
  ComAtprotoRepoPutRecord,
} from "@atcute/atproto";
import type { Client } from "@atcute/client";
import { ok } from "@atcute/client";
import type { InferInput } from "@atcute/lexicons/validations";
import { now as tidNow } from "@atcute/tid";

import {
  collectionDocumentLink,
  collectionDocumentUri,
  collectionSidecarUri,
  collectionsPublicationUri,
} from "#/lib/atproto/collection-uris.ts";
import { COLLECTION, COSMIK_NSID, MARGIN_NSID } from "#/lib/atproto/nsids";
import type { CollectionManifest } from "#/lib/collections/manifest";
import { serializeCollectionManifestForRepo } from "#/lib/markpub/collection-fields.ts";
import { listRepoRecords } from "#/server/atproto/fetch-record";
import { buildAtUri } from "#/server/atproto/uri";

export {
  collectionDocumentUri,
  collectionSidecarUri,
  collectionsPublicationUri,
};

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

/**
 * Full sha256 hex digest of a string — used for `at.margin.note`
 * `target.sourceHash`. Unlike {@link subjectRkey} (truncated to 32 chars for
 * the rkey charset) this returns the complete 64-char digest Margin expects.
 */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
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

export type ApplyWriteOp =
  | {
      $type: "com.atproto.repo.applyWrites#create";
      collection: string;
      rkey: string;
      value: Record<string, unknown>;
    }
  | {
      $type: "com.atproto.repo.applyWrites#update";
      collection: string;
      rkey: string;
      value: Record<string, unknown>;
    }
  | {
      $type: "com.atproto.repo.applyWrites#delete";
      collection: string;
      rkey: string;
    };

interface ApplyWriteResult {
  uri: string;
  cid: string;
}

/** Atomically apply one or more repo writes (create / update / delete). */
export async function repoApplyWrites(
  client: Client,
  input: { repo: string; writes: Array<ApplyWriteOp> },
): Promise<Array<ApplyWriteResult | null>> {
  const res = await ok(
    client.post("com.atproto.repo.applyWrites", {
      input: {
        repo: input.repo,
        writes: input.writes,
        // Omit `validate` for optimistic validation (same default as putRecord):
        // validate known lexicons, fail-open for third-party NSIDs the PDS has
        // not loaded (e.g. site.standard.*). Explicit validate:true rejects
        // those writes even when the schemas are published on the network.
      } as never,
    }),
  );

  const results: Array<ApplyWriteResult | null> = [];
  for (const row of res.results ?? []) {
    if (
      typeof row === "object" &&
      row !== null &&
      "uri" in row &&
      "cid" in row &&
      typeof row.uri === "string" &&
      typeof row.cid === "string"
    ) {
      results.push({ uri: row.uri, cid: row.cid });
      continue;
    }
    results.push(null);
  }
  return results;
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

/** Write an `app.standard-reader.graph.follow` (a user follow) for `subjectDid`.
 *  `excludedPublications` are the followed user's publications the reader opted
 *  out of (following a user subscribes to all their publications except these). */
export async function putUserFollowRecord(
  client: Client,
  repo: string,
  subjectDid: string,
  createdAt: string,
  excludedPublications: Array<string> = [],
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.graphFollow,
    rkey: subjectRkey(subjectDid),
    record: {
      $type: COLLECTION.graphFollow,
      subject: subjectDid,
      ...(excludedPublications.length > 0 ? { excludedPublications } : {}),
      createdAt,
    },
  });
}

/**
 * Delete every follow record for `subjectDid` — the deterministic
 * `subjectRkey` plus any TID-rkey records other clients may have written for the
 * same pair (mirrors {@link deleteSubscriptionRecords}).
 */
export async function deleteUserFollowRecords(
  client: Client,
  repo: string,
  subjectDid: string,
  knownRkeys: Array<string> = [],
): Promise<void> {
  const rkeys = new Set([subjectRkey(subjectDid), ...knownRkeys]);
  await Promise.all(
    [...rkeys].map((rkey) =>
      repoDeleteRecord(client, {
        repo,
        collection: COLLECTION.graphFollow,
        rkey,
      }),
    ),
  );
}

/** Write an `app.standard-reader.labeler.subscription` (V2) for `labelerDid`.
 *  V2 is the nested-NSID successor to the flat `labelerSubscription`; new writes
 *  go here. Reads accept both until per-reader migration completes. */
export async function putLabelerSubscriptionRecord(
  client: Client,
  repo: string,
  labelerDid: string,
  createdAt: string,
  labels?: Array<{ val: string; visibility: "ignore" | "warn" | "hide" }>,
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.labelerSubscriptionV2,
    rkey: subjectRkey(labelerDid),
    record: {
      $type: COLLECTION.labelerSubscriptionV2,
      labeler: labelerDid,
      ...(labels && labels.length > 0 ? { labels } : {}),
      createdAt,
    },
  });
}

/** Delete the `app.standard-reader.labeler.subscription` (V2) for `labelerDid`. */
export async function deleteLabelerSubscriptionRecord(
  client: Client,
  repo: string,
  labelerDid: string,
): Promise<void> {
  await repoDeleteRecord(client, {
    repo,
    collection: COLLECTION.labelerSubscriptionV2,
    rkey: subjectRkey(labelerDid),
  });
}

/**
 * Delete a legacy `app.standard-reader.labelerSubscription` (flat NSID) record
 * for `labelerDid`. Used by the per-reader migration to clean up old records
 * after they've been rewritten to V2.
 */
export async function deleteLegacyLabelerSubscriptionRecord(
  client: Client,
  repo: string,
  labelerDid: string,
): Promise<void> {
  await repoDeleteRecord(client, {
    repo,
    collection: COLLECTION.labelerSubscription,
    rkey: subjectRkey(labelerDid),
  });
}

/** Write an `app.standard-reader.labeler.service` record (labeler registration). */
export async function putLabelerServiceRecord(
  client: Client,
  repo: string,
  rkey: string,
  record: Record<string, unknown>,
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.labelerService,
    rkey,
    record: { $type: COLLECTION.labelerService, ...record },
  });
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
 * list-saves are mirrored into the Neon read-model by the tap ingester, so
 * this is only used for backfill or collections not yet synced.
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
    users?: Array<string>;
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
      ...(list.users && list.users.length > 0 ? { users: list.users } : {}),
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

/** Singleton rkey for the reader's `app.standard-reader.sidebarPref` record. */
export const SIDEBAR_PREF_RKEY = "self";

/** Create or replace the reader's sidebar preferences (list order + collapsed
 * groups). One record per reader, keyed `self`. */
export async function putSidebarPrefRecord(
  client: Client,
  repo: string,
  pref: {
    listOrder: Array<string>;
    collapsed: Array<string>;
    updatedAt: string;
  },
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.sidebarPref,
    rkey: SIDEBAR_PREF_RKEY,
    record: {
      $type: COLLECTION.sidebarPref,
      listOrder: pref.listOrder,
      collapsed: pref.collapsed,
      updatedAt: pref.updatedAt,
    },
  });
}

// ── Collections (reuse site.standard.publication / .document) ───────────────

/** New TID rkey for a collection's publication or document (creation-sortable). */
export function newCollectionRkey(): string {
  return tidNow();
}

/** Upload image bytes to the repo's PDS; returns the `blob` ref to embed. */
export async function uploadBlob(
  client: Client,
  bytes: Uint8Array,
  mimeType: string,
): Promise<Record<string, unknown>> {
  const res = await ok(
    client.post("com.atproto.repo.uploadBlob", {
      input: new Blob([bytes as BlobPart], { type: mimeType }),
    }),
  );
  return res.blob as unknown as Record<string, unknown>;
}

/**
 * Create or replace the user's `site.standard.publication` that holds their
 * collections. Colors ride in `basicTheme`; fonts live in
 * `app.standard-reader.publicationTheme` at the same rkey.
 */
export async function putPublicationRecord(
  client: Client,
  repo: string,
  rkey: string,
  pub: {
    name: string;
    url: string;
    description?: string;
    icon?: Record<string, unknown>;
    basicTheme?: Record<string, unknown>;
  },
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.publication,
    rkey,
    record: {
      $type: COLLECTION.publication,
      name: pub.name,
      url: pub.url,
      ...(pub.description ? { description: pub.description } : {}),
      ...(pub.icon ? { icon: pub.icon } : {}),
      ...(pub.basicTheme ? { basicTheme: pub.basicTheme } : {}),
    },
  });
}

/** Mark a publication as a Standard Reader collections series. */
export async function putCollectionsPublicationRecord(
  client: Client,
  repo: string,
  publicationRkey: string,
  publicationUri: string,
  createdAt: string,
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.collectionsPublication,
    rkey: publicationRkey,
    record: {
      $type: COLLECTION.collectionsPublication,
      publication: publicationUri,
      createdAt,
    },
  });
}

export async function deleteCollectionsPublicationRecord(
  client: Client,
  repo: string,
  publicationRkey: string,
): Promise<void> {
  return repoDeleteRecord(client, {
    repo,
    collection: COLLECTION.collectionsPublication,
    rkey: publicationRkey,
  });
}

/** Write typography for a collections publication (same rkey as the publication). */
export async function putPublicationThemeRecord(
  client: Client,
  repo: string,
  publicationRkey: string,
  theme: {
    publicationUri: string;
    fonts?: { title?: string; body?: string };
    createdAt: string;
    updatedAt?: string;
  },
): Promise<{ uri: string; cid: string }> {
  const fontObj: Record<string, string> = {};
  if (theme.fonts?.title) fontObj.title = theme.fonts.title;
  if (theme.fonts?.body) fontObj.body = theme.fonts.body;
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.publicationTheme,
    rkey: publicationRkey,
    record: {
      $type: COLLECTION.publicationTheme,
      publication: theme.publicationUri,
      ...(Object.keys(fontObj).length > 0 ? { fonts: fontObj } : {}),
      createdAt: theme.createdAt,
      ...(theme.updatedAt ? { updatedAt: theme.updatedAt } : {}),
    },
  });
}

export async function deletePublicationThemeRecord(
  client: Client,
  repo: string,
  publicationRkey: string,
): Promise<void> {
  return repoDeleteRecord(client, {
    repo,
    collection: COLLECTION.publicationTheme,
    rkey: publicationRkey,
  });
}

/**
 * Create or replace a collection document shell as `site.standard.document`:
 * portable `content` (markpub newsletter). The curated manifest lives in
 * `app.standard-reader.collection` at the same rkey.
 */
export async function putDocumentRecord(
  client: Client,
  repo: string,
  rkey: string,
  doc: {
    site: string;
    title: string;
    content: Record<string, unknown>;
    description?: string;
    coverImage?: Record<string, unknown>;
    publishedAt: string;
    updatedAt?: string;
    links?: Array<Record<string, unknown>>;
  },
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.document,
    rkey,
    record: {
      $type: COLLECTION.document,
      site: doc.site,
      title: doc.title,
      publishedAt: doc.publishedAt,
      ...(doc.updatedAt ? { updatedAt: doc.updatedAt } : {}),
      ...(doc.description ? { description: doc.description } : {}),
      content: doc.content,
      ...(doc.coverImage ? { coverImage: doc.coverImage } : {}),
      ...(doc.links && doc.links.length > 0 ? { links: doc.links } : {}),
    },
  });
}

/** Write the curated manifest sidecar for a collection document. */
export async function putCollectionRecord(
  client: Client,
  repo: string,
  rkey: string,
  collection: {
    documentUri: string;
    manifest: CollectionManifest;
    createdAt: string;
    updatedAt?: string;
  },
): Promise<{ uri: string; cid: string }> {
  const { manifest } = collection;
  const serialized = serializeCollectionManifestForRepo(manifest);
  return repoPutRecord(client, {
    repo,
    collection: COLLECTION.collection,
    rkey,
    record: {
      $type: COLLECTION.collection,
      document: collection.documentUri,
      ...(serialized.editorial ? { editorial: serialized.editorial } : {}),
      ...(serialized.colophon ? { colophon: serialized.colophon } : {}),
      items: serialized.items,
      createdAt: collection.createdAt,
      ...(collection.updatedAt ? { updatedAt: collection.updatedAt } : {}),
    },
  });
}

function buildCollectionDocumentRecord(
  doc: {
    site: string;
    title: string;
    content: Record<string, unknown>;
    description?: string;
    coverImage?: Record<string, unknown>;
    publishedAt: string;
    updatedAt?: string;
  },
  sidecarUri: string,
): Record<string, unknown> {
  return {
    $type: COLLECTION.document,
    site: doc.site,
    title: doc.title,
    publishedAt: doc.publishedAt,
    ...(doc.updatedAt ? { updatedAt: doc.updatedAt } : {}),
    ...(doc.description ? { description: doc.description } : {}),
    content: doc.content,
    ...(doc.coverImage ? { coverImage: doc.coverImage } : {}),
    links: [collectionDocumentLink(sidecarUri)],
  };
}

function buildCollectionSidecarRecord(collection: {
  documentUri: string;
  manifest: CollectionManifest;
  createdAt: string;
  updatedAt?: string;
}): Record<string, unknown> {
  const { manifest } = collection;
  const serialized = serializeCollectionManifestForRepo(manifest);
  return {
    $type: COLLECTION.collection,
    document: collection.documentUri,
    ...(serialized.editorial ? { editorial: serialized.editorial } : {}),
    ...(serialized.colophon ? { colophon: serialized.colophon } : {}),
    items: serialized.items,
    createdAt: collection.createdAt,
    ...(collection.updatedAt ? { updatedAt: collection.updatedAt } : {}),
  };
}

/**
 * Create or replace a collection document + sidecar pair atomically. The client
 * mints one TID rkey up front so the document can link back to the sidecar URI
 * before either record exists; both land in one `applyWrites` batch.
 */
export async function putCollectionDocumentPair(
  client: Client,
  repo: string,
  rkey: string,
  input: {
    isUpdate: boolean;
    doc: {
      site: string;
      title: string;
      content: Record<string, unknown>;
      description?: string;
      coverImage?: Record<string, unknown>;
      publishedAt: string;
      updatedAt?: string;
    };
    collection: {
      manifest: CollectionManifest;
      createdAt: string;
      updatedAt?: string;
    };
  },
): Promise<{ documentUri: string; sidecarUri: string }> {
  const documentUri = collectionDocumentUri(repo, rkey);
  const sidecarUri = collectionSidecarUri(repo, rkey);
  const writeType = input.isUpdate
    ? ("com.atproto.repo.applyWrites#update" as const)
    : ("com.atproto.repo.applyWrites#create" as const);
  const documentRecord = buildCollectionDocumentRecord(input.doc, sidecarUri);
  const sidecarRecord = buildCollectionSidecarRecord({
    documentUri,
    manifest: input.collection.manifest,
    createdAt: input.collection.createdAt,
    updatedAt: input.collection.updatedAt,
  });

  try {
    await repoApplyWrites(client, {
      repo,
      writes: [
        {
          $type: writeType,
          collection: COLLECTION.document,
          rkey,
          value: documentRecord,
        },
        {
          $type: writeType,
          collection: COLLECTION.collection,
          rkey,
          value: sidecarRecord,
        },
      ],
    });
  } catch {
    // Best-effort fallback when applyWrites is unavailable or rejects the batch.
    await putDocumentRecord(client, repo, rkey, {
      ...input.doc,
      links: [collectionDocumentLink(sidecarUri)],
    });
    await putCollectionRecord(client, repo, rkey, {
      documentUri,
      manifest: input.collection.manifest,
      createdAt: input.collection.createdAt,
      updatedAt: input.collection.updatedAt,
    });
  }

  return { documentUri, sidecarUri };
}

/** Delete a collection document + sidecar pair atomically. */
export async function deleteCollectionDocumentPair(
  client: Client,
  repo: string,
  rkey: string,
): Promise<void> {
  try {
    await repoApplyWrites(client, {
      repo,
      writes: [
        {
          $type: "com.atproto.repo.applyWrites#delete",
          collection: COLLECTION.document,
          rkey,
        },
        {
          $type: "com.atproto.repo.applyWrites#delete",
          collection: COLLECTION.collection,
          rkey,
        },
      ],
    });
  } catch {
    await deleteDocumentRecord(client, repo, rkey);
    await deleteCollectionRecord(client, repo, rkey);
  }
}

export async function deleteCollectionRecord(
  client: Client,
  repo: string,
  rkey: string,
): Promise<void> {
  return repoDeleteRecord(client, {
    repo,
    collection: COLLECTION.collection,
    rkey,
  });
}

export async function deleteDocumentRecord(
  client: Client,
  repo: string,
  rkey: string,
): Promise<void> {
  return repoDeleteRecord(client, {
    repo,
    collection: COLLECTION.document,
    rkey,
  });
}

/**
 * Create an `app.userinput.discussion` record (a userinput.app feedback post)
 * in the author's repo. Discussions use `key: tid`, so each new post gets a
 * fresh TID rkey (no idempotent upsert). The `space` strongRef pins the post
 * to Standard Reader's feedback space.
 *
 * The body is omitted when empty so the lexicon's optional field stays unset.
 * PDS validation is optimistic: app.userinput.* is a third-party namespace the
 * PDS may not have loaded, and `repoPutRecord` skips `validate:true` to allow
 * that (matching the rest of this module).
 */
export async function createUserinputDiscussionRecord(
  client: Client,
  repo: string,
  input: {
    spaceUri: string;
    spaceCid: string;
    title: string;
    body?: string | null;
    tags: Array<string>;
    createdAt: string;
  },
): Promise<{ uri: string; cid: string }> {
  const record: Record<string, unknown> = {
    $type: "app.userinput.discussion",
    space: {
      $type: "com.atproto.repo.strongRef",
      uri: input.spaceUri,
      cid: input.spaceCid,
    },
    title: input.title,
    tags: input.tags,
    createdAt: input.createdAt,
  };
  const trimmedBody = input.body?.trim();
  if (trimmedBody) {
    record.body = trimmedBody;
  }
  return repoPutRecord(client, {
    repo,
    collection: "app.userinput.discussion",
    rkey: tidNow().toString(),
    record,
  });
}

/**
 * Create an `app.userinput.upvote` record (an upvote on a discussion or reply)
 * in the voter's repo. The upvote lexicon uses `key: "any"` and is "written at
 * the SAME record key as its subject, so a user holds at most one per subject" —
 * so the rkey is the *subject's* rkey (parsed from the subject AT-URI), not a
 * fresh TID. This makes upvoting idempotent: re-upvoting the same discussion
 * just replaces the existing upvote record instead of creating a duplicate.
 *
 * The `subject` is a strongRef (uri + cid) to the discussion being voted on.
 * PDS validation is optimistic (see {@link createUserinputDiscussionRecord}).
 */
export async function createUserinputUpvoteRecord(
  client: Client,
  repo: string,
  input: {
    subjectUri: string;
    subjectCid: string;
    subjectRkey: string;
    createdAt: string;
  },
): Promise<{ uri: string; cid: string }> {
  const record: Record<string, unknown> = {
    $type: "app.userinput.upvote",
    subject: {
      $type: "com.atproto.repo.strongRef",
      uri: input.subjectUri,
      cid: input.subjectCid,
    },
    createdAt: input.createdAt,
  };
  return repoPutRecord(client, {
    repo,
    collection: "app.userinput.upvote",
    rkey: input.subjectRkey,
    record,
  });
}

/**
 * Delete the viewer's `app.userinput.upvote` record for a discussion. The
 * upvote lexicon writes at the SAME rkey as its subject (the discussion's
 * rkey), so the delete targets `app.userinput.upvote/<subjectRkey>`. No-op if
 * the viewer hasn't upvoted (delete on a missing rkey is idempotent).
 */
export async function deleteUserinputUpvoteRecord(
  client: Client,
  repo: string,
  rkey: string,
): Promise<void> {
  return repoDeleteRecord(client, {
    repo,
    collection: "app.userinput.upvote",
    rkey,
  });
}

// ── Margin (at.margin.*) / Semble (network.cosmik.*) saves ──────────────────

/** A Margin or Semble collection as listed from the reader's own repo. */
export interface ThirdPartyCollectionSummary {
  uri: string;
  cid?: string;
  name: string;
}

/**
 * List the reader's own `at.margin.collection` records. Uses
 * {@link listRepoRecords} (Slingshot-first, cid-bearing) rather than the
 * authenticated {@link listCollectionRecords} — the latter drops the cid,
 * which Margin doesn't need but keeps the two read paths consistent with
 * Semble's.
 */
export async function listMarginCollectionRecords(
  did: string,
  pds: string | null,
): Promise<Array<ThirdPartyCollectionSummary>> {
  const { records } = await listRepoRecords(did, MARGIN_NSID.collection, pds);
  return records
    .map((r) => {
      const value = r.value as { name?: string } | undefined;
      if (!value?.name) return null;
      return { uri: r.uri, ...(r.cid ? { cid: r.cid } : {}), name: value.name };
    })
    .filter((r): r is ThirdPartyCollectionSummary => r !== null);
}

/** List the reader's own `network.cosmik.collection` records. */
export async function listSembleCollectionRecords(
  did: string,
  pds: string | null,
): Promise<Array<ThirdPartyCollectionSummary>> {
  const { records } = await listRepoRecords(did, COSMIK_NSID.collection, pds);
  return records
    .map((r) => {
      const value = r.value as { name?: string } | undefined;
      if (!value?.name) return null;
      return { uri: r.uri, ...(r.cid ? { cid: r.cid } : {}), name: value.name };
    })
    .filter((r): r is ThirdPartyCollectionSummary => r !== null);
}

/** Create an `at.margin.collection` (a new Margin collection). */
export async function createMarginCollection(
  client: Client,
  repo: string,
  input: { name: string; createdAt: string },
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: MARGIN_NSID.collection,
    rkey: tidNow().toString(),
    record: {
      $type: MARGIN_NSID.collection,
      name: input.name,
      createdAt: input.createdAt,
    },
  });
}

/**
 * Create a `network.cosmik.collection` (a new Semble collection). Per the
 * published lexicon, `accessType` is a closed enum of `"OPEN" | "CLOSED"` —
 * there is no `"PRIVATE"` value. `"OPEN"` matches every collection observed
 * in the wild on Semble's own appview.
 */
export async function createSembleCollection(
  client: Client,
  repo: string,
  input: { name: string; createdAt: string },
): Promise<{ uri: string; cid: string }> {
  return repoPutRecord(client, {
    repo,
    collection: COSMIK_NSID.collection,
    rkey: tidNow().toString(),
    record: {
      $type: COSMIK_NSID.collection,
      name: input.name,
      accessType: "OPEN",
      collaborators: [],
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
}

/**
 * Save an article to a Margin collection: create an `at.margin.note`
 * (bookmark, or a highlight when `passage` is set) plus an
 * `at.margin.collectionItem` linking it into `collectionUri`. Both are bare
 * AT-URIs (no strongRef), so the note's rkey can be pre-minted and both
 * records written in one `applyWrites` batch — mirrors
 * {@link putCollectionDocumentPair}'s pre-mint-then-batch shape, with a
 * sequential fallback if the batch is rejected.
 */
export async function saveToMarginCollection(
  client: Client,
  repo: string,
  input: {
    collectionUri: string;
    url: string;
    title: string;
    passage?: string;
    /** Optional free-text note attached to the bookmark/highlight, written as
     * `body.value` — per the lexicon: "For bookmarks, use body.value for the
     * description." */
    note?: string;
    createdAt: string;
  },
): Promise<{ noteUri: string; collectionItemUri: string }> {
  const noteRkey = tidNow().toString();
  const noteUri = buildAtUri(repo, MARGIN_NSID.note, noteRkey);
  const itemRkey = tidNow().toString();

  const target: Record<string, unknown> = {
    title: input.title,
    source: input.url,
    sourceHash: sha256Hex(input.url),
  };
  if (input.passage) {
    target.selector = { type: "TextQuoteSelector", exact: input.passage };
  }
  const noteRecord: Record<string, unknown> = {
    $type: MARGIN_NSID.note,
    target,
    motivation: input.passage ? "highlighting" : "bookmarking",
    ...(input.note
      ? { body: { value: input.note, format: "text/plain" } }
      : {}),
    createdAt: input.createdAt,
  };
  const itemRecord: Record<string, unknown> = {
    $type: MARGIN_NSID.collectionItem,
    collection: input.collectionUri,
    annotation: noteUri,
    createdAt: input.createdAt,
  };

  try {
    await repoApplyWrites(client, {
      repo,
      writes: [
        {
          $type: "com.atproto.repo.applyWrites#create",
          collection: MARGIN_NSID.note,
          rkey: noteRkey,
          value: noteRecord,
        },
        {
          $type: "com.atproto.repo.applyWrites#create",
          collection: MARGIN_NSID.collectionItem,
          rkey: itemRkey,
          value: itemRecord,
        },
      ],
    });
  } catch {
    await repoPutRecord(client, {
      repo,
      collection: MARGIN_NSID.note,
      rkey: noteRkey,
      record: noteRecord,
    });
    await repoPutRecord(client, {
      repo,
      collection: MARGIN_NSID.collectionItem,
      rkey: itemRkey,
      record: itemRecord,
    });
  }

  return {
    noteUri,
    collectionItemUri: buildAtUri(repo, MARGIN_NSID.collectionItem, itemRkey),
  };
}

/**
 * Save an article to a Semble collection: create a `network.cosmik.card`,
 * then a `network.cosmik.collectionLink` strongRef pointing at it. Unlike
 * Margin, the link's `card` field is a strongRef requiring the card's
 * content-addressed cid — unknowable before the card is written — so these
 * two writes are necessarily sequential, not a single `applyWrites` batch.
 */
export async function saveToSembleCollection(
  client: Client,
  repo: string,
  input: {
    collectionUri: string;
    collectionCid: string;
    url: string;
    title: string;
    description?: string;
    author?: string;
    siteName?: string;
    imageUrl?: string;
    createdAt: string;
  },
): Promise<{ cardUri: string; cardCid: string; collectionLinkUri: string }> {
  const metadata: Record<string, unknown> = {
    $type: "network.cosmik.card#urlMetadata",
    type: "article",
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    ...(input.author ? { author: input.author } : {}),
    ...(input.siteName ? { siteName: input.siteName } : {}),
    ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
  };

  const { uri: cardUri, cid: cardCid } = await repoPutRecord(client, {
    repo,
    collection: COSMIK_NSID.card,
    rkey: tidNow().toString(),
    record: {
      $type: COSMIK_NSID.card,
      type: "URL",
      content: {
        $type: "network.cosmik.card#urlContent",
        url: input.url,
        metadata,
      },
      createdAt: input.createdAt,
    },
  });

  const { uri: collectionLinkUri } = await repoPutRecord(client, {
    repo,
    collection: COSMIK_NSID.collectionLink,
    rkey: tidNow().toString(),
    record: {
      $type: COSMIK_NSID.collectionLink,
      card: { uri: cardUri, cid: cardCid },
      collection: { uri: input.collectionUri, cid: input.collectionCid },
      addedAt: input.createdAt,
      addedBy: repo,
      createdAt: input.createdAt,
    },
  });

  return { cardUri, cardCid, collectionLinkUri };
}

export {
  getCollectionRecord,
  getDocumentRecord,
  getPublicationThemeRecord,
} from "./repo-get-records.ts";

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

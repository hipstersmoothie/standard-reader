/**
 * Saved publication lists as virtual subscriptions.
 *
 * Saving another reader's `app.standard-reader.list` (via an
 * `app.standard-reader.listSave` record) acts like following every
 * publication in it — those publications join the reader's *effective* follow
 * set used by the sidebar, feeds, and unread counts, without writing
 * individual `site.standard.graph.subscription` records.
 *
 * Both `list` and `listSave` records are mirrored into the Neon read-model by
 * the tap ingester (`lists` + `list_saves` tables). The per-reader resolution
 * is cached in-memory for a short TTL and explicitly invalidated when the
 * reader saves/unsaves a list.
 */

import { and, eq } from "drizzle-orm";
import { cache as reactCache } from "react";

import { listSaves, lists } from "#/db/schema";
import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import { APP_NSID } from "#/lib/atproto/nsids";
import { fetchRepoRecordWithFallback } from "#/server/atproto/fetch-record";
import { resolveIdentity } from "#/server/atproto/identity";
import {
  selectFollowUris,
  selectFollowedUserDids,
} from "#/server/reader/queries";

const RECORD_FETCH_TIMEOUT_MS = 8000;
/** How long a reader's resolved saved lists are reused across feed queries. */
const SAVED_LISTS_TTL_MS = 60_000;

/** `at://did/app.standard-reader.list/rkey` → did + rkey capture groups. */
const LIST_URI_RE = new RegExp(
  `^at://([^/]+)/${APP_NSID.list.replaceAll(".", String.raw`\.`)}/([^/]+)$`,
);

export interface SubscriptionList {
  uri: string;
  rkey: string;
  name: string;
  description: string | null;
  /** Ordered at-uris of the `site.standard.publication` records in the list. */
  publications: Array<string>;
  /** Ordered DIDs of the users (authors) in the list. */
  users: Array<string>;
  createdAt: string | null;
}

export function listUriFromParams(did: string, rkey: string): string {
  return `at://${did}/${APP_NSID.list}/${rkey}`;
}

/** Route-style params parsed from a list AT-URI, or null when malformed. */
export function listRefFromUri(
  uri: string,
): { did: string; rkey: string } | null {
  const match = LIST_URI_RE.exec(uri);
  return match ? { did: match[1] as string, rkey: match[2] as string } : null;
}

/** Permissive mapping — repos may hold minimal or malformed records. */
export function toSubscriptionList(
  uri: string,
  rkey: string,
  value: unknown,
): SubscriptionList | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string" || !Array.isArray(record.publications)) {
    return null;
  }
  return {
    uri,
    rkey,
    name: record.name,
    description:
      typeof record.description === "string" ? record.description : null,
    publications: record.publications.filter(
      (item): item is string => typeof item === "string",
    ),
    users: Array.isArray(record.users)
      ? record.users.filter((item): item is string => typeof item === "string")
      : [],
    createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
  };
}

/** Fetch one `app.standard-reader.list` from its owner's PDS, unauthenticated. */
export async function fetchPublicList(
  did: string,
  rkey: string,
): Promise<SubscriptionList | null> {
  const identity = await resolveIdentity(did);
  const result = await fetchRepoRecordWithFallback(
    listUriFromParams(did, rkey),
    identity.pds,
    RECORD_FETCH_TIMEOUT_MS,
  );
  if (!result) return null;
  return toSubscriptionList(listUriFromParams(did, rkey), rkey, result.value);
}

/**
 * Read one `app.standard-reader.list` from the DB mirror. Falls back to a PDS
 * `getRecord` when the row isn't present yet (first view of a list owned by a
 * repo we haven't backfilled), then backfills for next time.
 */
export async function readList(
  db: Db,
  did: string,
  rkey: string,
): Promise<SubscriptionList | null> {
  const uri = listUriFromParams(did, rkey);

  const [row] = await db
    .select()
    .from(lists)
    .where(eq(lists.uri, uri))
    .limit(1);

  if (row && !row.deleted) {
    return {
      uri: row.uri,
      rkey: row.rkey,
      name: row.name,
      description: row.description,
      publications: (row.publications as Array<string>) ?? [],
      users: (row.users as Array<string>) ?? [],
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    };
  }

  // Not in the DB — fetch from PDS and backfill.
  const fetched = await fetchPublicList(did, rkey);
  if (!fetched) return null;

  // Backfill the owner's lists (catches both this list and any siblings).
  const { backfillListsFromRepo } = await import("#/server/ingest/handlers");
  void backfillListsFromRepo(did);

  return fetched;
}

/**
 * Whether `saverDid` has a `listSave` record for `listUri`, read from the DB
 * mirror. No PDS I/O.
 */
export async function hasSavedListDb(
  db: Db,
  saverDid: string,
  listUri: string,
): Promise<boolean> {
  const [row] = await db
    .select({ uri: listSaves.uri })
    .from(listSaves)
    .where(
      and(
        eq(listSaves.saverDid, saverDid),
        eq(listSaves.listUri, listUri),
        eq(listSaves.deleted, false),
      ),
    )
    .limit(1);

  return row != null;
}

interface CacheEntry {
  lists: Array<SubscriptionList>;
  expires: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Array<SubscriptionList>>>();
/**
 * Readers we've already kicked a lazy PDS backfill for this process. The
 * backfill (see {@link scheduleListBackfill}) is a one-shot migration for
 * saves made before the read-model mirror existed; without this guard a reader
 * with genuinely no saved lists — the common case — would re-fetch their whole
 * repo from the PDS on the first feed/sidebar load of every cache window.
 */
const backfillAttempted = new Set<string>();

/**
 * Fire the pre-mirror lazy backfill for `did` in the background, at most once
 * per process. Never awaited on the read path: saves now arrive via the tap
 * ingester in real time, so the mirror is authoritative for the request and
 * this only catches historical saves. If it does find saves, drop the cached
 * empty state so the next read reflects them instead of waiting out the TTL.
 */
function scheduleListBackfill(did: string): void {
  if (backfillAttempted.has(did)) return;
  backfillAttempted.add(did);
  void (async () => {
    try {
      const { backfillListsFromRepo } =
        await import("#/server/ingest/handlers");
      const { listSaves: saved } = await backfillListsFromRepo(did);
      if (saved > 0) cache.delete(did);
    } catch (error) {
      // Allow a later read to retry rather than pinning the failure forever.
      backfillAttempted.delete(did);
      console.warn(
        `[saved-lists] background backfill failed for ${did}`,
        error,
      );
    }
  })();
}

/** Map joined listSaves × lists rows to SubscriptionList, skipping own-list saves. */
function mapJoinedRows(
  rows: Array<{
    listUri: string;
    uri: string | null;
    rkey: string | null;
    name: string | null;
    description: string | null;
    publications: unknown;
    users: unknown;
    createdAt: Date | null;
  }>,
  readerDid: string,
): Array<SubscriptionList> {
  const result = rows
    .filter(
      (
        row,
      ): row is Omit<(typeof rows)[number], "uri" | "rkey" | "name"> & {
        uri: string;
        rkey: string;
        name: string;
      } => row.uri !== null && row.rkey !== null && row.name !== null,
    )
    .filter((row) => {
      // A save of your own list would just duplicate the sidebar group.
      const ownerDid = row.listUri.slice("at://".length).split("/")[0];
      return ownerDid !== readerDid;
    })
    .map(
      (row): SubscriptionList => ({
        uri: row.uri,
        rkey: row.rkey,
        name: row.name,
        description: row.description,
        publications: (row.publications as Array<string>) ?? [],
        users: (row.users as Array<string>) ?? [],
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      }),
    );

  cache.set(readerDid, {
    lists: result,
    expires: Date.now() + SAVED_LISTS_TTL_MS,
  });
  return result;
}

/**
 * The reader's saved lists (excluding saves that point at their own lists),
 * resolved from the DB mirror and cached for {@link SAVED_LISTS_TTL_MS}.
 * When the mirror has no rows, kicks a one-shot background PDS backfill (see
 * {@link scheduleListBackfill}) but returns the current state without waiting.
 */
export async function savedListsForReader(
  db: Db,
  did: string,
): Promise<Array<SubscriptionList>> {
  const cached = cache.get(did);
  if (cached && cached.expires > Date.now()) {
    return cached.lists;
  }
  const pending = inflight.get(did);
  if (pending) {
    return pending;
  }
  const promise = (async () => {
    // Single JOIN: saved list URIs + their list rows in one round trip.
    const joined = await db
      .select({
        listUri: listSaves.listUri,
        uri: lists.uri,
        rkey: lists.rkey,
        name: lists.name,
        description: lists.description,
        publications: lists.publications,
        users: lists.users,
        createdAt: lists.createdAt,
      })
      .from(listSaves)
      .leftJoin(lists, eq(lists.uri, listSaves.listUri))
      .where(
        and(
          eq(listSaves.saverDid, did),
          eq(listSaves.deleted, false),
          eq(lists.deleted, false),
        ),
      );

    // No mirrored saves. Kick a one-shot PDS backfill in the background (to
    // catch pre-mirror saves) but never block the feed/sidebar critical path
    // on it — return the current (empty) mirror state immediately.
    if (joined.length === 0) {
      scheduleListBackfill(did);
    }

    return mapJoinedRows(joined, did);
  })();
  inflight.set(did, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(did);
  }
}

/** Bust the cache after the reader saves/unsaves a list. */
export function invalidateSavedLists(did: string): void {
  cache.delete(did);
}

/** Distinct publication uris contributed by the reader's saved lists. */
export async function savedListPublicationUris(
  db: Db,
  did: string,
): Promise<Array<string>> {
  const resolvedLists = await savedListsForReader(db, did);
  return [...new Set(resolvedLists.flatMap((list) => list.publications))];
}

/** Distinct user DIDs contributed by the reader's saved lists — saving a list
 * that contains users acts like following those users. */
export async function savedListUserDids(
  db: Db,
  did: string,
): Promise<Array<string>> {
  const resolvedLists = await savedListsForReader(db, did);
  return [...new Set(resolvedLists.flatMap((list) => list.users))];
}

async function effectiveFollowUrisImpl(
  dbArg: Db,
  schema: Schema,
  did: string,
): Promise<Array<string>> {
  const [followUris, listUris] = await Promise.all([
    selectFollowUris(dbArg, schema, did),
    savedListPublicationUris(dbArg, did),
  ]);
  return [...new Set([...followUris, ...listUris])];
}

/**
 * The reader's *effective* follow set: real subscriptions plus every
 * publication in their saved lists. This is what the sidebar, feeds, and
 * unread counts operate on — saving a list acts like following its members.
 */
export const effectiveFollowUris = reactCache(effectiveFollowUrisImpl);

export interface EffectiveFollowSets {
  /** Publication AT-URIs (subscriptions + saved-list publications). */
  publicationUris: Array<string>;
  /** DIDs of followed users (app.standard-reader.graph.follow). */
  userDids: Array<string>;
}

async function effectiveFollowSetsImpl(
  dbArg: Db,
  schema: Schema,
  did: string,
): Promise<EffectiveFollowSets> {
  const [publicationUris, followedUserDids, savedListUsers] = await Promise.all(
    [
      effectiveFollowUris(dbArg, schema, did),
      selectFollowedUserDids(dbArg, schema, did),
      savedListUserDids(dbArg, did),
    ],
  );
  const userDids = [...new Set([...followedUserDids, ...savedListUsers])];
  return { publicationUris, userDids };
}

/**
 * The reader's effective follow set for the home/latest feed: publication URIs
 * (subscriptions + saved lists) plus the DIDs of users they follow. One call so
 * feed paths resolve both dimensions together.
 */
export const effectiveFollowSets = reactCache(effectiveFollowSetsImpl);

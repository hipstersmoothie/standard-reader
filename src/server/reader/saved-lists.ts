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

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";

import { APP_NSID } from "#/lib/atproto/nsids";
import { resolveIdentity } from "#/server/atproto/identity";
import { selectFollowUris } from "#/server/reader/queries";
import { cache as reactCache } from "react";

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
    createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
  };
}

/** Fetch one `app.standard-reader.list` from its owner's PDS, unauthenticated. */
export async function fetchPublicList(
  did: string,
  rkey: string,
): Promise<SubscriptionList | null> {
  const identity = await resolveIdentity(did);
  if (!identity.pds) {
    return null;
  }
  try {
    const url = new URL("/xrpc/com.atproto.repo.getRecord", identity.pds);
    url.searchParams.set("repo", did);
    url.searchParams.set("collection", APP_NSID.list);
    url.searchParams.set("rkey", rkey);
    const res = await fetch(url, {
      signal: AbortSignal.timeout(RECORD_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { value?: unknown };
    return toSubscriptionList(listUriFromParams(did, rkey), rkey, body.value);
  } catch {
    return null;
  }
}

/**
 * Read one `app.standard-reader.list` from the DB mirror. Falls back to a PDS
 * `getRecord` when the row isn't present yet (first view of a list owned by a
 * repo we haven't backfilled), then backfills for next time.
 */
export async function readList(
  did: string,
  rkey: string,
): Promise<SubscriptionList | null> {
  const { db } = await import("#/db/index.server");
  const { lists } = await import("#/db/schema");
  const { eq: eqList } = await import("drizzle-orm");
  const uri = listUriFromParams(did, rkey);

  const [row] = await db
    .select()
    .from(lists)
    .where(eqList(lists.uri, uri))
    .limit(1);

  if (row && !row.deleted) {
    return {
      uri: row.uri,
      rkey: row.rkey,
      name: row.name,
      description: row.description,
      publications: (row.publications as Array<string>) ?? [],
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
  saverDid: string,
  listUri: string,
): Promise<boolean> {
  const { db } = await import("#/db/index.server");
  const { listSaves } = await import("#/db/schema");
  const { and: andSave, eq: eqSave } = await import("drizzle-orm");

  const [row] = await db
    .select({ uri: listSaves.uri })
    .from(listSaves)
    .where(
      andSave(
        eqSave(listSaves.saverDid, saverDid),
        eqSave(listSaves.listUri, listUri),
        eqSave(listSaves.deleted, false),
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
 * The reader's saved lists (excluding saves that point at their own lists),
 * resolved from the DB mirror and cached for {@link SAVED_LISTS_TTL_MS}.
 * Falls back to a PDS fetch + backfill when no list_saves rows exist yet.
 */
export async function savedListsForReader(
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
    const { db } = await import("#/db/index.server");
    const { listSaves, lists } = await import("#/db/schema");
    const { and, eq, inArray } = await import("drizzle-orm");

    const saveRows = await db
      .select({ listUri: listSaves.listUri })
      .from(listSaves)
      .where(and(eq(listSaves.saverDid, did), eq(listSaves.deleted, false)));

    // No rows yet — backfill from the PDS and retry.
    if (saveRows.length === 0) {
      const { backfillListsFromRepo } = await import(
        "#/server/ingest/handlers"
      );
      await backfillListsFromRepo(did);
    }

    const refetched = await db
      .select({ listUri: listSaves.listUri })
      .from(listSaves)
      .where(and(eq(listSaves.saverDid, did), eq(listSaves.deleted, false)));

    const savedUris = refetched.map((row) => row.listUri);
    const refs = savedUris
      .map((uri) => listRefFromUri(uri))
      .filter((ref): ref is { did: string; rkey: string } => ref !== null)
      // A save of your own list would just duplicate the sidebar group.
      .filter((ref) => ref.did !== did);

    if (refs.length === 0) {
      cache.set(did, { lists: [], expires: Date.now() + SAVED_LISTS_TTL_MS });
      return [];
    }

    // Batch-fetch all referenced lists from the DB mirror.
    const listUris = refs.map((ref) => listUriFromParams(ref.did, ref.rkey));
    const listRows = await db
      .select()
      .from(lists)
      .where(
        and(inArray(lists.uri, listUris), eq(lists.deleted, false)),
      );

    const listByUri = new Map(listRows.map((row) => [row.uri, row]));

    // Any list not yet in the DB (owned by a different repo we haven't
    // backfilled) falls back to a single PDS fetch.
    const missing = refs.filter(
      (ref) => !listByUri.has(listUriFromParams(ref.did, ref.rkey)),
    );
    if (missing.length > 0) {
      const fetched = await Promise.all(
        missing.map((ref) => fetchPublicList(ref.did, ref.rkey)),
      );
      for (const list of fetched) {
        if (list) {
          listByUri.set(list.uri, {
            uri: list.uri,
            name: list.name,
            description: list.description,
            publications: list.publications,
            rkey: list.rkey,
            ownerDid: list.uri.slice("at://".length).split("/")[0] as string,
            cid: null,
            createdAt: list.createdAt ? new Date(list.createdAt) : null,
            deleted: false,
            indexedAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
    }

    const result = refs
      .map((ref) => listByUri.get(listUriFromParams(ref.did, ref.rkey)))
      .filter((row): row is NonNullable<typeof row> => row != null)
      .map(
        (row): SubscriptionList => ({
          uri: row.uri,
          rkey: row.rkey,
          name: row.name,
          description: row.description,
          publications: (row.publications as Array<string>) ?? [],
          createdAt: row.createdAt ? row.createdAt.toISOString() : null,
        }),
      );

    cache.set(did, { lists: result, expires: Date.now() + SAVED_LISTS_TTL_MS });
    return result;
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
  did: string,
): Promise<Array<string>> {
  const lists = await savedListsForReader(did);
  return [...new Set(lists.flatMap((list) => list.publications))];
}

async function effectiveFollowUrisImpl(
  db: Db,
  schema: Schema,
  did: string,
): Promise<Array<string>> {
  const [followUris, listUris] = await Promise.all([
    selectFollowUris(db, schema, did),
    savedListPublicationUris(did),
  ]);
  return [...new Set([...followUris, ...listUris])];
}

/**
 * The reader's *effective* follow set: real subscriptions plus every
 * publication in their saved lists. This is what the sidebar, feeds, and
 * unread counts operate on — saving a list acts like following its members.
 */
export const effectiveFollowUris = reactCache(effectiveFollowUrisImpl);

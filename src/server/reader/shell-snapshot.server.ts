import type { Client } from "@atcute/client";
import type { SidebarData } from "#/integrations/tanstack-query/api-feed.functions";
import type {
  ListOwner,
  SavedList,
} from "#/integrations/tanstack-query/api-lists.functions";
import type {
  Db,
  PublicationCard,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import type { SubscriptionList } from "#/server/reader/saved-lists";

import { resolveIdentity } from "#/server/atproto/identity";
import {
  countFollowedDocuments,
  countUnreadByPublication,
  followedPublications,
} from "#/server/reader/queries";
import {
  effectiveFollowUris,
  savedListsForReader,
} from "#/server/reader/saved-lists";
import { and, eq, inArray, sql } from "drizzle-orm";

export interface ShellSnapshot {
  sidebar: SidebarData;
  lists: Array<SubscriptionList>;
  savedLists: Array<SavedList>;
}

/** Sidebar follows, unread badges, and saved-for-later count. */
export async function loadSidebarData(
  db: Db,
  schema: Schema,
  did: string | null,
  trackReading: boolean,
): Promise<SidebarData> {
  if (!did) {
    return {
      signedIn: false,
      hasFollows: false,
      following: [],
      unreadCount: null,
      savedCount: null,
    };
  }

  const followUris = await effectiveFollowUris(db, schema, did);
  const hasFollows = followUris.length > 0;
  const b = schema.bookmarks;
  const [following, counts, unreadByPublication, savedCountRow] =
    await Promise.all([
      followedPublications(db, schema, followUris),
      trackReading && followUris.length > 0
        ? countFollowedDocuments(db, schema, followUris, did)
        : Promise.resolve(null),
      trackReading && followUris.length > 0
        ? countUnreadByPublication(db, schema, followUris, did)
        : Promise.resolve(new Map<string, number>()),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(b)
        .where(and(eq(b.ownerDid, did), eq(b.deleted, false))),
    ]);

  return {
    signedIn: true,
    hasFollows,
    following: following.map((pub) => ({
      ...pub,
      unreadCount: trackReading ? (unreadByPublication.get(pub.uri) ?? 0) : 0,
    })),
    unreadCount: trackReading ? (counts?.unread ?? null) : 0,
    savedCount: savedCountRow[0]?.count ?? 0,
  };
}

/** Own publication lists from the reader's repo (sidebar folders). */
export async function loadOwnSubscriptionLists(
  _client: Client,
  did: string,
): Promise<Array<SubscriptionList>> {
  // Read from the DB mirror (synced by the tap ingester). Falls back to a PDS
  // fetch + backfill when no rows exist yet (first visit or pre-sync gap).
  const { db } = await import("#/db/index.server");
  const { lists } = await import("#/db/schema");
  const { eq: eqList } = await import("drizzle-orm");

  const rows = await db
    .select()
    .from(lists)
    .where(and(eqList(lists.ownerDid, did), eqList(lists.deleted, false)))
    .orderBy(lists.rkey);

  if (rows.length > 0) {
    return rows.map(
      (row): SubscriptionList => ({
        uri: row.uri,
        rkey: row.rkey,
        name: row.name,
        description: row.description,
        publications: (row.publications as Array<string>) ?? [],
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      }),
    );
  }

  // No rows yet — backfill from the PDS and retry the DB read.
  const { backfillListsFromRepo } = await import("#/server/ingest/handlers");
  await backfillListsFromRepo(did);

  const refreshed = await db
    .select()
    .from(lists)
    .where(and(eqList(lists.ownerDid, did), eqList(lists.deleted, false)))
    .orderBy(lists.rkey);

  return refreshed.map(
    (row): SubscriptionList => ({
      uri: row.uri,
      rkey: row.rkey,
      name: row.name,
      description: row.description,
      publications: (row.publications as Array<string>) ?? [],
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    }),
  );
}

async function lookupOwners(
  db: Db,
  schema: Schema,
  dids: Array<string>,
): Promise<Map<string, ListOwner>> {
  const unique = [...new Set(dids)];
  const owners = new Map<string, ListOwner>();
  if (unique.length === 0) {
    return owners;
  }
  const pr = schema.profiles;
  const rows = await db
    .select({
      did: pr.did,
      handle: pr.handle,
      displayName: pr.displayName,
      avatarUrl: pr.avatarUrl,
    })
    .from(pr)
    .where(inArray(pr.did, unique));
  for (const row of rows) {
    owners.set(row.did, row);
  }
  await Promise.all(
    unique
      .filter((did) => !owners.get(did)?.handle)
      .map(async (did) => {
        const identity = await resolveIdentity(did);
        owners.set(did, {
          did,
          handle: identity.handle,
          displayName: owners.get(did)?.displayName ?? null,
          avatarUrl: owners.get(did)?.avatarUrl ?? null,
        });
      }),
  );
  return owners;
}

/** Saved lists hydrated with publication cards and owner identity. */
export async function loadSavedListsHydrated(
  db: Db,
  schema: Schema,
  did: string,
): Promise<Array<SavedList>> {
  const lists = await savedListsForReader(did);
  const allUris = [...new Set(lists.flatMap((list) => list.publications))];
  const [cards, owners] = await Promise.all([
    followedPublications(db, schema, allUris),
    lookupOwners(
      db,
      schema,
      lists.map(
        (list) => list.uri.slice("at://".length).split("/")[0] as string,
      ),
    ),
  ]);
  const cardByUri = new Map(cards.map((card) => [card.uri, card]));

  return lists.map((list) => {
    const ownerDid = list.uri.slice("at://".length).split("/")[0] as string;
    return {
      list,
      owner: owners.get(ownerDid) ?? {
        did: ownerDid,
        handle: null,
        displayName: null,
        avatarUrl: null,
      },
      publications: list.publications
        .map((uri) => cardByUri.get(uri))
        .filter((card): card is PublicationCard => card != null),
    };
  });
}

/** One DB round trip for signed-in shell SSR and client cache misses. */
export async function loadShellSnapshot(
  db: Db,
  schema: Schema,
  {
    did,
    client,
    trackReading,
  }: {
    did: string;
    client: Client;
    trackReading: boolean;
  },
): Promise<ShellSnapshot> {
  const [sidebar, lists, savedLists] = await Promise.all([
    loadSidebarData(db, schema, did, trackReading),
    loadOwnSubscriptionLists(client, did),
    loadSavedListsHydrated(db, schema, did),
  ]);
  return { sidebar, lists, savedLists };
}

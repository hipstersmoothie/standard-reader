import type { Client } from "@atcute/client";
import { and, eq, inArray, sql } from "drizzle-orm";

import type {
  FollowingUser,
  SidebarData,
} from "#/integrations/tanstack-query/api-feed.functions";
import type {
  ListOwner,
  SavedList,
} from "#/integrations/tanstack-query/api-lists.functions";
import type {
  Db,
  PublicationCard,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import type { SidebarPref } from "#/integrations/tanstack-query/api-sidebar-prefs.functions";
import { scheduleFollowedPublicationReconcile } from "#/server/reader/followed-publications-sync.server";
import {
  countFollowedDocuments,
  countUnreadByFollowedUser,
  countUnreadByPublication,
  followedPublications,
} from "#/server/reader/queries";
import type { SubscriptionList } from "#/server/reader/saved-lists";
import {
  effectiveFollowSets,
  savedListsForReader,
} from "#/server/reader/saved-lists";

export interface ShellSnapshot {
  sidebar: SidebarData;
  lists: Array<SubscriptionList>;
  savedLists: Array<SavedList>;
  sidebarPref: SidebarPref;
}

/** Reader sidebar preferences (list order + collapsed groups) from the DB
 * mirror, with a one-time PDS backfill when no row exists yet. */
export async function loadSidebarPref(did: string): Promise<SidebarPref> {
  const { db } = await import("#/db/index.server");
  const { sidebarPrefs } = await import("#/db/schema");
  const { eq: eqPref } = await import("drizzle-orm");

  const readRow = async () => {
    const rows = await db
      .select()
      .from(sidebarPrefs)
      .where(
        and(
          eqPref(sidebarPrefs.ownerDid, did),
          eqPref(sidebarPrefs.deleted, false),
        ),
      )
      .limit(1);
    return rows[0];
  };

  let row = await readRow();
  if (!row) {
    // No row yet — backfill the singleton from the PDS and retry once.
    const { backfillSidebarPrefFromRepo } =
      await import("#/server/ingest/handlers");
    await backfillSidebarPrefFromRepo(did);
    row = await readRow();
  }

  return {
    listOrder: (row?.listOrder as Array<string>) ?? [],
    collapsed: (row?.collapsed as Array<string>) ?? [],
  };
}

/** Sidebar follows, unread badges, and saved-for-later count. */
export async function loadSidebarData(
  db: Db,
  schema: Schema,
  did: string | null,
  trackReading: boolean,
  countOldPostsAsUnread = true,
): Promise<SidebarData> {
  if (!did) {
    return {
      signedIn: false,
      hasFollows: false,
      following: [],
      followingUsers: [],
      unreadCount: null,
      savedCount: null,
    };
  }

  const b = schema.bookmarks;
  // Start the bookmark count immediately — it doesn't depend on followUris.
  const savedCountPromise = db
    .select({ count: sql<number>`count(*)::int` })
    .from(b)
    .where(and(eq(b.ownerDid, did), eq(b.deleted, false)));

  const followingUsersPromise = loadFollowingUsers(db, schema, did);

  const { publicationUris: followUris, userDids: followedUserDids } =
    await effectiveFollowSets(db, schema, did);
  const hasFollows = followUris.length > 0 || followedUserDids.length > 0;

  // Following a user auto-subscribes to their publications; reconcile picks up
  // any they've published since this reader's last active session. Background,
  // throttled once per process per reader.
  if (followedUserDids.length > 0) {
    scheduleFollowedPublicationReconcile(did);
  }
  const [
    following,
    counts,
    unreadByPublication,
    unreadByUser,
    savedCountRow,
    followingUsers,
  ] = await Promise.all([
    followedPublications(db, schema, followUris),
    trackReading && hasFollows
      ? countFollowedDocuments(db, schema, followUris, did, followedUserDids, {
          countOldPostsAsUnread,
        })
      : Promise.resolve(null),
    trackReading && followUris.length > 0
      ? countUnreadByPublication(db, schema, followUris, did, {
          countOldPostsAsUnread,
        })
      : Promise.resolve(new Map<string, number>()),
    trackReading && followedUserDids.length > 0
      ? countUnreadByFollowedUser(db, schema, followedUserDids, did, {
          countOldPostsAsUnread,
        })
      : Promise.resolve(new Map<string, number>()),
    savedCountPromise,
    followingUsersPromise,
  ]);

  return {
    signedIn: true,
    hasFollows,
    following: following.map((pub) => ({
      ...pub,
      unreadCount: trackReading ? (unreadByPublication.get(pub.uri) ?? 0) : 0,
    })),
    followingUsers: followingUsers.map((person) => ({
      ...person,
      unreadCount: trackReading ? (unreadByUser.get(person.did) ?? 0) : 0,
    })),
    unreadCount: trackReading ? (counts?.unread ?? null) : 0,
    savedCount: savedCountRow[0]?.count ?? 0,
  };
}

/** Followed users for the sidebar "People" section, most recently followed
 * first, joined to profiles for the byline (handle / name / avatar). */
async function loadFollowingUsers(
  db: Db,
  schema: Schema,
  did: string,
): Promise<Array<FollowingUser>> {
  const uf = schema.userFollows;
  const pr = schema.profiles;
  const rows = await db
    .select({
      did: uf.subjectDid,
      handle: pr.handle,
      displayName: pr.displayName,
      avatarUrl: pr.avatarUrl,
    })
    .from(uf)
    .leftJoin(pr, eq(pr.did, uf.subjectDid))
    .where(and(eq(uf.followerDid, did), eq(uf.deleted, false)))
    .orderBy(sql`${uf.createdAt} desc nulls last`);
  return rows;
}

/** Own publication lists from the reader's repo (sidebar folders). */
export async function loadOwnSubscriptionLists(
  _client: unknown,
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
        users: (row.users as Array<string>) ?? [],
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
      users: (row.users as Array<string>) ?? [],
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
  return owners;
}

/** Saved lists hydrated with publication cards and owner identity. */
export async function loadSavedListsHydrated(
  db: Db,
  schema: Schema,
  did: string,
): Promise<Array<SavedList>> {
  const lists = await savedListsForReader(db, did);
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
    trackReading,
    countOldPostsAsUnread = true,
  }: {
    did: string;
    client?: Client;
    trackReading: boolean;
    countOldPostsAsUnread?: boolean;
  },
): Promise<ShellSnapshot> {
  const [sidebar, lists, savedLists, sidebarPref] = await Promise.all([
    loadSidebarData(db, schema, did, trackReading, countOldPostsAsUnread),
    loadOwnSubscriptionLists(null, did),
    loadSavedListsHydrated(db, schema, did),
    loadSidebarPref(did),
  ]);
  return { sidebar, lists, savedLists, sidebarPref };
}

/**
 * The reader-specific reads behind the personal shelves.
 *
 * The catalog and the download routes address a reader by DID, not by session
 * — a KOReader device has no cookie, and a shelf URL is meant to be pasted into
 * one. So the two preferences that shape an unread queue are resolved straight
 * off the `user` row here, rather than through the session-cookie helpers the
 * in-app server functions use.
 */

import { eq } from "drizzle-orm";

import type {
  ArticleCard,
  Db,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import { DEFAULT_COUNT_OLD_POSTS_AS_UNREAD } from "#/lib/count-old-posts-as-unread";
import {
  selectArticleCardsByUris,
  selectUnreadDocumentPage,
} from "#/server/reader/queries";
import { effectiveFollowSets } from "#/server/reader/saved-lists";

export interface ShelfReaderPreferences {
  /** Reading history is off — there is no meaningful unread queue. */
  trackReadingHistory: boolean;
  countOldPostsAsUnread: boolean;
  displayName: string | null;
  handle: string | null;
}

/** Preferences and byline for a reader addressed by DID. */
export async function shelfReader(
  db: Db,
  schema: Schema,
  did: string,
): Promise<ShelfReaderPreferences> {
  const [row] = await db
    .select({
      countOldPostsAsUnread: schema.user.countOldPostsAsUnread,
      trackReadingHistory: schema.user.trackReadingHistory,
    })
    .from(schema.user)
    .where(eq(schema.user.did, did))
    .limit(1);

  const [profile] = await db
    .select({
      displayName: schema.profiles.displayName,
      handle: schema.profiles.handle,
    })
    .from(schema.profiles)
    .where(eq(schema.profiles.did, did))
    .limit(1);

  return {
    countOldPostsAsUnread:
      row?.countOldPostsAsUnread ?? DEFAULT_COUNT_OLD_POSTS_AS_UNREAD,
    displayName: profile?.displayName ?? null,
    handle: profile?.handle ?? null,
    // Null means the reader never touched the setting, and the app's default is
    // on — the same reading `resolveTrackReadingHistoryEnabled` takes.
    trackReadingHistory: row?.trackReadingHistory ?? true,
  };
}

/** Display name for a reader's own shelves. */
export function shelfReaderName(
  reader: ShelfReaderPreferences,
  did: string,
): string {
  return reader.displayName ?? reader.handle ?? did;
}

/**
 * The reader's unread queue as cards, newest first.
 *
 * Empty when reading history is off: with nothing marked read, every article
 * in the follow feed is "unread", and syncing the reader's entire subscription
 * archive to their e-reader is not what they asked for.
 */
export async function unreadShelfCards(
  db: Db,
  schema: Schema,
  did: string,
  { limit }: { limit: number },
): Promise<Array<ArticleCard>> {
  const reader = await shelfReader(db, schema, did);
  if (!reader.trackReadingHistory) return [];

  const { publicationUris, userDids } = await effectiveFollowSets(
    db,
    schema,
    did,
  );
  const rows = await selectUnreadDocumentPage(db, schema, {
    countOldPostsAsUnread: reader.countOldPostsAsUnread,
    followedUserDids: userDids,
    limit,
    publicationUris,
    readerDid: did,
  });
  if (rows.length === 0) return [];

  // `selectUnreadDocumentPage` returns the keyset order; the card query does
  // not preserve it, so the unread order is re-imposed.
  const order = new Map(rows.map((row, index) => [row.uri, index]));
  const cards = await selectArticleCardsByUris(
    db,
    schema,
    rows.map((row) => row.uri),
  );
  return cards.toSorted(
    (a, b) => (order.get(a.uri) ?? 0) - (order.get(b.uri) ?? 0),
  );
}

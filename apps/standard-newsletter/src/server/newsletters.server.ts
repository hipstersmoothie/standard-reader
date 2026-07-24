/**
 * Server-only: connecting a standard.site publication to Standard Newsletter,
 * and listing the ones an author could still connect.
 *
 * Owning a publication never implies mailing it. An author opts in per
 * publication, and the `newsletter_publications` row is that opt-in — see the
 * table's doc comment for what keys off it.
 */

import {
  newsletterPublications,
  publicationStats,
  publications,
} from "@standard-reader/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "../db/index.server";
import { publicationIconUrl } from "../lib/blob";

/** A publication the author owns but has not connected yet. */
export interface ConnectablePublication {
  uri: string;
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  iconUrl: string | null;
  /** standard.site follower count — context for which one to connect first. */
  followers: number;
  /** Published posts, i.e. how much would be mailable. */
  posts: number;
}

/**
 * The author's own publications that are not yet newsletters.
 *
 * The anti-join against `newsletter_publications` is what makes this list
 * shrink as they connect things; when it empties, they've connected everything
 * they own.
 */
export async function loadConnectablePublications(
  ownerDid: string,
): Promise<Array<ConnectablePublication>> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      uri: publications.uri,
      rkey: publications.rkey,
      did: publications.did,
      name: publications.name,
      url: publications.url,
      description: publications.description,
      iconCid: publications.iconCid,
      subscriberCount: publicationStats.subscriberCount,
      documentCount: publicationStats.documentCount,
    })
    .from(publications)
    .leftJoin(
      newsletterPublications,
      eq(newsletterPublications.publicationUri, publications.uri),
    )
    .leftJoin(
      publicationStats,
      eq(publicationStats.publicationUri, publications.uri),
    )
    .where(
      and(
        eq(publications.did, ownerDid),
        eq(publications.deleted, false),
        isNull(newsletterPublications.publicationUri),
      ),
    )
    .orderBy(desc(publicationStats.subscriberCount))
    .limit(50);

  return rows.map((p) => ({
    uri: p.uri,
    id: p.rkey,
    name: p.name,
    description: p.description ?? "",
    url: p.url.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    icon: (p.name.trim()[0] ?? "•").toUpperCase(),
    iconUrl: publicationIconUrl(p.did, p.iconCid),
    followers: p.subscriberCount ?? 0,
    posts: p.documentCount ?? 0,
  }));
}

export type ConnectOutcome = "connected" | "already-connected" | "not-owner";

/**
 * Connect a publication, after confirming `ownerDid` currently owns it.
 *
 * The ownership check reads `publications.did` rather than trusting the URI
 * from the client, so a request naming someone else's publication can't opt it
 * in to being mailed.
 */
export async function connectPublication(
  ownerDid: string,
  publicationUri: string,
): Promise<ConnectOutcome> {
  const db = getDb();
  if (!db) return "not-owner";

  const [owned] = await db
    .select({ uri: publications.uri })
    .from(publications)
    .where(
      and(
        eq(publications.uri, publicationUri),
        eq(publications.did, ownerDid),
        eq(publications.deleted, false),
      ),
    )
    .limit(1);
  if (!owned) return "not-owner";

  const inserted = await db
    .insert(newsletterPublications)
    .values({ publicationUri, ownerDid })
    .onConflictDoNothing({ target: newsletterPublications.publicationUri })
    .returning({ uri: newsletterPublications.publicationUri });

  return inserted.length > 0 ? "connected" : "already-connected";
}

/**
 * Disconnect a publication: no more posts are mailed for it and it drops out of
 * the app.
 *
 * Subscribers and past sends are deliberately left in place — disconnecting is
 * "stop mailing this", not "delete my list", and reconnecting should not cost
 * the author their subscribers. Scoped by `ownerDid` so the delete can only
 * touch the caller's own row.
 */
export async function disconnectPublication(
  ownerDid: string,
  publicationUri: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  const deleted = await db
    .delete(newsletterPublications)
    .where(
      and(
        eq(newsletterPublications.publicationUri, publicationUri),
        eq(newsletterPublications.ownerDid, ownerDid),
      ),
    )
    .returning({ uri: newsletterPublications.publicationUri });

  return deleted.length > 0;
}

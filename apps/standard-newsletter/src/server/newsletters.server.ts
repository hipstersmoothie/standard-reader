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
  newsletterSendEvents,
  newsletterSends,
  newsletterSubscribers,
  publicationStats,
  publications,
} from "@standard-reader/db/schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

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

export type UpdateSenderOutcome = "updated" | "not-owner" | "invalid-address";

/**
 * Set (or clear) a newsletter's From identity. Owner-scoped, and the address is
 * validated to a plausible `local@domain.tld` shape — it still has to be on a
 * verified Resend domain to actually deliver, but a malformed address is
 * rejected here rather than failing silently at send time.
 *
 * An empty string for either field clears it back to the instance default.
 */
export async function updateSender(
  ownerDid: string,
  publicationUri: string,
  fromName: string | null,
  fromAddress: string | null,
): Promise<UpdateSenderOutcome> {
  const db = getDb();
  if (!db) return "not-owner";

  const name = fromName?.trim() || null;
  const address = fromAddress?.trim() || null;
  if (address !== null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    return "invalid-address";
  }

  const updated = await db
    .update(newsletterPublications)
    .set({ fromName: name, fromAddress: address })
    .where(
      and(
        eq(newsletterPublications.publicationUri, publicationUri),
        eq(newsletterPublications.ownerDid, ownerDid),
      ),
    )
    .returning({ uri: newsletterPublications.publicationUri });

  return updated.length > 0 ? "updated" : "not-owner";
}

export type SubscriberStatus = "confirmed" | "pending" | "unsubscribed";

export interface SubscriberRow {
  /** The subscriber's email — the primary identity we always have. */
  email: string;
  /** DID when the subscriber joined via Bluesky (source = "space"), else null. */
  did: string | null;
  status: SubscriberStatus;
  /** "email" (signup / author import) or "space" (Bluesky record). */
  source: string;
  /** Join time as epoch ms and a preformatted label. */
  joinedMs: number;
  joined: string;
  /**
   * Share of this subscriber's delivered sends that they opened, 0–100, or null
   * when nothing has been delivered to them yet (so the UI shows "—" instead of
   * a misleading 0%).
   */
  openRate: number | null;
}

export interface PublicationSubscribers {
  name: string;
  /** Confirmed subscriber count — matches the publication page's headline. */
  confirmed: number;
  subscribers: Array<SubscriberRow>;
}

function formatJoined(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The subscriber list behind a publication's Subscribers count — the real email
 * list from `newsletter_subscribers`, with each subscriber's open rate computed
 * from their own delivered/opened send events.
 *
 * This is PII, so it's owner-scoped: it resolves the publication by rkey and
 * returns null unless `ownerDid` currently owns it and has connected it. A
 * request naming someone else's publication gets nothing.
 */
export async function loadPublicationSubscribers(
  ownerDid: string,
  pubRkey: string,
): Promise<PublicationSubscribers | null> {
  const db = getDb();
  if (!db) return null;

  const [pub] = await db
    .select({ uri: publications.uri, name: publications.name })
    .from(publications)
    .innerJoin(
      newsletterPublications,
      eq(newsletterPublications.publicationUri, publications.uri),
    )
    .where(
      and(
        eq(publications.rkey, pubRkey),
        eq(publications.did, ownerDid),
        eq(publications.deleted, false),
      ),
    )
    .limit(1);
  if (!pub) return null;

  const rows = await db
    .select({
      email: newsletterSubscribers.email,
      did: newsletterSubscribers.subscriberDid,
      status: newsletterSubscribers.status,
      source: newsletterSubscribers.source,
      createdAt: newsletterSubscribers.createdAt,
      confirmedAt: newsletterSubscribers.confirmedAt,
    })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.publicationUri, pub.uri))
    .orderBy(desc(newsletterSubscribers.createdAt));

  // Per-subscriber open rate: over this publication's sends, how many each
  // recipient was delivered vs opened. Recipients are keyed by email in the
  // events table, matching the subscriber rows.
  const sendIdRows = await db
    .select({ id: newsletterSends.id })
    .from(newsletterSends)
    .where(eq(newsletterSends.publicationUri, pub.uri));
  const openByEmail = new Map<string, { delivered: number; opened: number }>();
  if (sendIdRows.length > 0) {
    const engagement = await db
      .select({
        recipient: newsletterSendEvents.recipient,
        delivered: sql<number>`(count(distinct ${newsletterSendEvents.sendId}) filter (where ${newsletterSendEvents.type} = 'delivered'))::int`,
        opened: sql<number>`(count(distinct ${newsletterSendEvents.sendId}) filter (where ${newsletterSendEvents.type} = 'opened'))::int`,
      })
      .from(newsletterSendEvents)
      .where(
        inArray(
          newsletterSendEvents.sendId,
          sendIdRows.map((s) => s.id),
        ),
      )
      .groupBy(newsletterSendEvents.recipient);
    for (const e of engagement) {
      openByEmail.set(e.recipient, {
        delivered: e.delivered,
        opened: e.opened,
      });
    }
  }

  const subscribers: Array<SubscriberRow> = rows.map((r) => {
    const joinedAt = r.confirmedAt ?? r.createdAt;
    const eng = openByEmail.get(r.email);
    const openRate =
      eng && eng.delivered > 0
        ? Math.round((eng.opened / eng.delivered) * 1000) / 10
        : null;
    const status: SubscriberStatus =
      r.status === "confirmed" || r.status === "unsubscribed"
        ? r.status
        : "pending";
    return {
      email: r.email,
      did: r.did,
      status,
      source: r.source,
      joinedMs: joinedAt.getTime(),
      joined: formatJoined(joinedAt),
      openRate,
    };
  });

  return {
    name: pub.name,
    confirmed: subscribers.filter((s) => s.status === "confirmed").length,
    subscribers,
  };
}

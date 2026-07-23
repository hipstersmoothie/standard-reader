/**
 * The signed-in subscriber's own Bluesky subscriptions: list them, and let them
 * natively unsubscribe by deleting their space record (which flips the mirror).
 * Reads come from the `newsletter_subscribers` mirror (source=`space`); the
 * delete goes through the subscriber's own session. Config-gated on HappyView.
 */

import type { Did } from "@atcute/lexicons";
import {
  newsletterSubscribers,
  publications,
} from "@standard-reader/db/schema";
import { and, eq } from "drizzle-orm";

import { getDb } from "../db/index.server";
import { atprotoOAuth } from "../integrations/auth/atproto.server";
import { parseSpaceUri, isSpaceRecordRef } from "./happyview/space-uri";

export interface MySubscription {
  publicationUri: string;
  publicationName: string;
  spaceRecordUri: string;
  rkey: string;
}

/** List the viewer's confirmed Bluesky (space) subscriptions. */
export async function loadMySubscriptions(
  viewerDid: string,
): Promise<Array<MySubscription>> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      publicationUri: newsletterSubscribers.publicationUri,
      spaceRecordUri: newsletterSubscribers.spaceRecordUri,
      name: publications.name,
    })
    .from(newsletterSubscribers)
    .leftJoin(
      publications,
      eq(publications.uri, newsletterSubscribers.publicationUri),
    )
    .where(
      and(
        eq(newsletterSubscribers.subscriberDid, viewerDid),
        eq(newsletterSubscribers.source, "space"),
        eq(newsletterSubscribers.status, "confirmed"),
      ),
    );

  const out: Array<MySubscription> = [];
  for (const row of rows) {
    if (!row.spaceRecordUri) continue;
    const parsed = parseSpaceUri(row.spaceRecordUri);
    if (!parsed || !isSpaceRecordRef(parsed)) continue;
    out.push({
      publicationUri: row.publicationUri,
      publicationName: row.name ?? "This publication",
      spaceRecordUri: row.spaceRecordUri,
      rkey: parsed.rkey,
    });
  }
  return out;
}

/**
 * Natively unsubscribe the viewer from a publication: delete their subscription
 * record from their own repo (which the mirror update reflects). Returns false
 * when the viewer has no such subscription or no restorable session.
 */
export async function unsubscribeMine(
  viewerDid: string,
  publicationUri: string,
): Promise<boolean> {
  const subs = await loadMySubscriptions(viewerDid);
  const target = subs.find((s) => s.publicationUri === publicationUri);
  if (!target) return false;

  let session: {
    did: string;
    handle: (pathname: string, init?: RequestInit) => Promise<Response>;
  } | null = null;
  try {
    session = await atprotoOAuth.restore(viewerDid as Did);
  } catch {
    session = null;
  }
  if (!session) return false;

  const { deleteBlueskySubscription } =
    await import("./happyview/subscription-writer.server");
  const result = await deleteBlueskySubscription({
    session,
    publicationUri,
    rkey: target.rkey,
  });
  return result.ok;
}

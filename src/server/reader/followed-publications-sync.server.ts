import type { Client } from "@atcute/client";
import type { Did } from "@atcute/lexicons";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import {
  deleteSubscriptionRecords,
  putSubscriptionRecord,
  subjectRkey,
} from "#/server/atproto/repo-records";
import { Collections, buildAtUri } from "#/server/atproto/uri";
import { deleteRecord, upsertSubscription } from "#/server/ingest/handlers";

/**
 * "Follow a user" materializes as real `site.standard.graph.subscription`
 * records to each of that user's publications — so the author keeps their
 * subscribers (portable, not locked to this app) and the reader can drop an
 * individual publication (recorded on the follow's `excludedPublications`).
 *
 * The subscribed set for a follow is derivable: (the subject's current
 * publications) − (the follow's excluded publications). Reconciling that set is
 * how new publications get picked up over time; there's no separate provenance,
 * so unfollowing the person tears down exactly the same derived set.
 */

/** The subject's live publication URIs (the owner-authored publications). */
async function subjectPublicationUris(
  subjectDid: string,
): Promise<Array<string>> {
  const p = schema.publications;
  const rows = await db
    .select({ uri: p.uri })
    .from(p)
    .where(and(eq(p.did, subjectDid), eq(p.deleted, false)));
  return rows.map((row) => row.uri);
}

/** Publications the reader opted out of for this followed user. */
async function excludedForFollow(
  followerDid: string,
  subjectDid: string,
): Promise<Set<string>> {
  const uf = schema.userFollows;
  const [row] = await db
    .select({ excluded: uf.excludedPublications })
    .from(uf)
    .where(
      and(
        eq(uf.followerDid, followerDid),
        eq(uf.subjectDid, subjectDid),
        eq(uf.deleted, false),
      ),
    )
    .limit(1);
  return new Set((row?.excluded as Array<string> | undefined) ?? []);
}

/** Publications in `pubUris` the reader already has an active subscription to. */
async function alreadySubscribed(
  followerDid: string,
  pubUris: Array<string>,
): Promise<Set<string>> {
  if (pubUris.length === 0) return new Set();
  const sub = schema.subscriptions;
  const rows = await db
    .select({ uri: sub.publicationUri })
    .from(sub)
    .where(
      and(
        eq(sub.subscriberDid, followerDid),
        inArray(sub.publicationUri, pubUris),
        eq(sub.deleted, false),
      ),
    );
  return new Set(rows.map((row) => row.uri));
}

/**
 * Subscribe the reader to every publication of `subjectDid` they don't already
 * follow and haven't excluded. Writes are sequential (no `putRecord` burst
 * against a PDS) and best-effort per publication. Returns the count created.
 */
export async function syncFollowedPublications(
  client: Client,
  followerDid: string,
  subjectDid: string,
): Promise<number> {
  const [pubUris, excluded] = await Promise.all([
    subjectPublicationUris(subjectDid),
    excludedForFollow(followerDid, subjectDid),
  ]);
  const target = pubUris.filter((uri) => !excluded.has(uri));
  if (target.length === 0) return 0;

  const existing = await alreadySubscribed(followerDid, target);
  const missing = target.filter((uri) => !existing.has(uri));

  let created = 0;
  for (const publicationUri of missing) {
    try {
      const createdAt = new Date().toISOString();
      const { uri, cid } = await putSubscriptionRecord(
        client,
        followerDid,
        publicationUri,
        createdAt,
      );
      await upsertSubscription(
        uri,
        followerDid,
        subjectRkey(publicationUri),
        cid,
        {
          publication: publicationUri,
          createdAt,
        },
      );
      created += 1;
    } catch (error) {
      console.warn(
        `[follow-sync] failed to subscribe ${followerDid} → ${publicationUri}`,
        error,
      );
    }
  }
  return created;
}

/**
 * Tear down the subscriptions a follow created — every subscription the reader
 * holds to one of the subject's publications. Called when unfollowing the
 * person (the derived set has no separate provenance, so this mirrors
 * {@link syncFollowedPublications}).
 */
export async function unsubscribeFollowedPublications(
  client: Client,
  followerDid: string,
  subjectDid: string,
): Promise<number> {
  const pubUris = await subjectPublicationUris(subjectDid);
  if (pubUris.length === 0) return 0;

  const sub = schema.subscriptions;
  const rows = await db
    .select({ rkey: sub.rkey, publicationUri: sub.publicationUri })
    .from(sub)
    .where(
      and(
        eq(sub.subscriberDid, followerDid),
        inArray(sub.publicationUri, pubUris),
        eq(sub.deleted, false),
      ),
    );

  const byPub = new Map<string, Array<string>>();
  for (const row of rows) {
    byPub.set(row.publicationUri, [
      ...(byPub.get(row.publicationUri) ?? []),
      row.rkey,
    ]);
  }

  let removed = 0;
  for (const [publicationUri, rkeys] of byPub) {
    try {
      await deleteSubscriptionRecords(
        client,
        followerDid,
        publicationUri,
        rkeys,
      );
      const allRkeys = new Set([subjectRkey(publicationUri), ...rkeys]);
      await Promise.all(
        [...allRkeys].map((rkey) =>
          deleteRecord(
            buildAtUri(followerDid, Collections.subscription, rkey),
            Collections.subscription,
          ),
        ),
      );
      removed += 1;
    } catch (error) {
      console.warn(
        `[follow-sync] failed to unsubscribe ${followerDid} → ${publicationUri}`,
        error,
      );
    }
  }
  return removed;
}

/**
 * Readers we've reconciled this process. Reconcile catches publications a
 * followed user created since the reader last had an active session; a fresh
 * follow already syncs immediately, so once per process is enough to keep the
 * derived subscriptions current without writing on every page load.
 */
const reconciled = new Set<string>();

/**
 * Background pass: reconcile every followed user's publications for `readerDid`.
 * Restores the reader's session server-side (works offline, self-refreshing) so
 * it can run outside a request. Fire-and-forget, at most once per process per
 * reader; never throws into the caller.
 */
export function scheduleFollowedPublicationReconcile(readerDid: string): void {
  if (reconciled.has(readerDid)) return;
  reconciled.add(readerDid);
  void (async () => {
    try {
      const { restoreAuthenticatedClient } =
        await import("#/integrations/auth/restore-client.server");
      const client = await restoreAuthenticatedClient(readerDid as Did);
      if (!client) {
        reconciled.delete(readerDid); // no session now — retry on a later load
        return;
      }
      const uf = schema.userFollows;
      const subjects = await db
        .selectDistinct({ did: uf.subjectDid })
        .from(uf)
        .where(and(eq(uf.followerDid, readerDid), eq(uf.deleted, false)));
      for (const { did: subjectDid } of subjects) {
        await syncFollowedPublications(client, readerDid, subjectDid);
      }
    } catch (error) {
      reconciled.delete(readerDid);
      console.warn(`[follow-sync] reconcile failed for ${readerDid}`, error);
    }
  })();
}

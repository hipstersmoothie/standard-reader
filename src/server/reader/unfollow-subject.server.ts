import { and, eq } from "drizzle-orm";

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import {
  deleteSubscriptionRecords,
  deleteUserFollowRecords,
  putUserFollowRecord,
  subjectRkey,
} from "#/server/atproto/repo-records";
import { Collections, buildAtUri, didFromAtUri } from "#/server/atproto/uri";
import { deleteRecord, upsertUserFollow } from "#/server/ingest/handlers";
import { unsubscribeFollowedPublications } from "#/server/reader/followed-publications-sync.server";

/**
 * Tearing down one follow edge — the shared body behind both the single-row
 * unsubscribe/unfollow server fns and the bulk one on `/subscriptions`.
 *
 * This lives in a `.server` module rather than beside the server fns that call
 * it because module-scope code in a `*.functions.ts` file is **not** stripped
 * from the client bundle — only `createServerFn().handler()` bodies are. A
 * plain exported helper there would drag `repo-records` and the ingest handlers
 * into the browser and trip the import-protection plugin at build time.
 */

/** The signed-in reader's restored AT Proto session (PDS client + DID). */
export interface ReaderRepoSession {
  did: string;
  client: Parameters<typeof putUserFollowRecord>[0];
}

/**
 * When a reader unsubscribes from a publication owned by someone they follow,
 * record the opt-out on the follow's `excludedPublications` so the periodic
 * reconcile (see followed-publications-sync) doesn't re-subscribe them. Reads +
 * rewrites the `graph.follow` record for the pair; best-effort (never blocks the
 * unsubscribe). No-op when the publication's owner isn't a followed user.
 */
async function excludePublicationFromFollow(
  client: ReaderRepoSession["client"],
  readerDid: string,
  publicationUri: string,
): Promise<void> {
  const ownerDid = didFromAtUri(publicationUri);
  if (!ownerDid) return;

  const { db } = await import("#/db/index.server");
  const { userFollows } = await import("#/db/schema");
  const [row] = await db
    .select({
      excluded: userFollows.excludedPublications,
      createdAt: userFollows.createdAt,
    })
    .from(userFollows)
    .where(
      and(
        eq(userFollows.followerDid, readerDid),
        eq(userFollows.subjectDid, ownerDid),
        eq(userFollows.deleted, false),
      ),
    )
    .limit(1);
  if (!row) return; // owner isn't followed — a plain unsubscribe

  const excluded = new Set((row.excluded as Array<string>) ?? []);
  if (excluded.has(publicationUri)) return;
  excluded.add(publicationUri);
  const list = [...excluded];
  const createdAt = row.createdAt?.toISOString() ?? new Date().toISOString();

  const { uri, cid } = await putUserFollowRecord(
    client,
    readerDid,
    ownerDid,
    createdAt,
    list,
  );
  await upsertUserFollow(uri, readerDid, subjectRkey(ownerDid), cid, {
    subject: ownerDid,
    excludedPublications: list,
    createdAt,
  });
}

/**
 * Drop every subscription record linking this reader to `publicationUri` — from
 * the repo (source of truth) and the DB mirror — and remember the opt-out when
 * the publication's owner is someone they follow. Returns the number of records
 * the read-model knew about.
 */
export async function unfollowPublicationForSession(
  session: ReaderRepoSession,
  db: Db,
  schema: Schema,
  publicationUri: string,
): Promise<number> {
  // Externally-created follows (e.g. Leaflet's auto self-subscribe) live at TID
  // rkeys, not our deterministic one — collect every record the read-model knows
  // about for this pair so they all get deleted.
  const sub = schema.subscriptions;
  const rows = await db
    .select({ rkey: sub.rkey })
    .from(sub)
    .where(
      and(
        eq(sub.subscriberDid, session.did),
        eq(sub.publicationUri, publicationUri),
        eq(sub.deleted, false),
      ),
    );

  await deleteSubscriptionRecords(
    session.client,
    session.did,
    publicationUri,
    rows.map((row) => row.rkey),
  );

  const rkeys = new Set([
    subjectRkey(publicationUri),
    ...rows.map((row) => row.rkey),
  ]);
  await Promise.all(
    [...rkeys].map((rkey) =>
      deleteRecord(
        buildAtUri(session.did, Collections.subscription, rkey),
        Collections.subscription,
      ),
    ),
  );
  // If this publication belongs to a followed user, remember the opt-out so
  // reconcile won't re-subscribe. Best-effort.
  try {
    await excludePublicationFromFollow(
      session.client,
      session.did,
      publicationUri,
    );
  } catch (error) {
    console.warn("[reader] exclude-from-follow failed", error);
  }
  return rows.length;
}

/**
 * Drop every `graph.follow` record for this reader → `subjectDid` pair (repo +
 * mirror) and tear down the subscriptions that follow created. Returns the
 * number of records the read-model knew about.
 */
export async function unfollowUserForSession(
  session: ReaderRepoSession,
  db: Db,
  schema: Schema,
  subjectDid: string,
): Promise<number> {
  // Follows written by other clients may live at TID rkeys — collect every
  // record the read-model knows about for this pair so they all get deleted.
  const uf = schema.userFollows;
  const rows = await db
    .select({ rkey: uf.rkey })
    .from(uf)
    .where(
      and(
        eq(uf.followerDid, session.did),
        eq(uf.subjectDid, subjectDid),
        eq(uf.deleted, false),
      ),
    );

  await deleteUserFollowRecords(
    session.client,
    session.did,
    subjectDid,
    rows.map((row) => row.rkey),
  );

  const rkeys = new Set([subjectRkey(subjectDid), ...rows.map((r) => r.rkey)]);
  await Promise.all(
    [...rkeys].map((rkey) =>
      deleteRecord(
        buildAtUri(session.did, Collections.userFollow, rkey),
        Collections.userFollow,
      ),
    ),
  );
  // Tear down the subscriptions this follow created (symmetric with the sync on
  // follow). Fire-and-forget.
  void unsubscribeFollowedPublications(
    session.client,
    session.did,
    subjectDid,
  ).catch((error) => {
    console.warn("[reader] follow publication teardown failed", error);
  });
  return rows.length;
}

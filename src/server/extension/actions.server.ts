import type { db } from "#/db/index.server";
import type * as schemaModule from "#/db/schema";
import type { AtprotoSessionContext } from "#/middleware/auth-session.server";

import {
  deleteBookmarkRecord,
  deleteSubscriptionRecords,
  putBookmarkRecord,
  putSubscriptionRecord,
  subjectRkey,
} from "#/server/atproto/repo-records";
import { Collections, buildAtUri } from "#/server/atproto/uri";
import { deleteRecord, upsertSubscription } from "#/server/ingest/handlers";
import { ensureTracked } from "#/server/ingest/tap-client";
import { and, eq } from "drizzle-orm";

async function trackReaderRepo(did: string): Promise<void> {
  try {
    await ensureTracked(did, "reader");
  } catch (error) {
    console.warn("[extension] failed to track reader repo", did, error);
  }
}

export async function extensionBookmarkDocument(
  session: AtprotoSessionContext,
  documentUri: string,
  save: boolean,
): Promise<void> {
  if (save) {
    await putBookmarkRecord(
      session.client,
      session.did,
      documentUri,
      new Date().toISOString(),
    );
    await trackReaderRepo(session.did);
    return;
  }
  await deleteBookmarkRecord(session.client, session.did, documentUri);
}

export async function extensionFollowPublication(
  session: AtprotoSessionContext,
  dbClient: typeof db,
  schema: typeof schemaModule,
  publicationUri: string,
  follow: boolean,
): Promise<void> {
  if (follow) {
    const createdAt = new Date().toISOString();
    const { uri, cid } = await putSubscriptionRecord(
      session.client,
      session.did,
      publicationUri,
      createdAt,
    );
    await upsertSubscription(
      uri,
      session.did,
      subjectRkey(publicationUri),
      cid,
      {
        publication: publicationUri,
        createdAt,
      },
    );
    await trackReaderRepo(session.did);
    return;
  }

  const sub = schema.subscriptions;
  const rows = await dbClient
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
}

import { APP_NSID } from "#/lib/atproto/nsids";
import {
  deleteBookmarkRecord,
  deleteListRecord,
  deleteListSaveRecord,
  deleteReadRecord,
  deleteRecommendRecord,
  deleteSubscriptionRecords,
  newListRkey,
  putBookmarkRecord,
  putListRecord,
  putListSaveRecord,
  putRecommendRecord,
  putSubscriptionRecord,
  subjectRkey,
} from "#/server/atproto/repo-records";
import { Collections, buildAtUri } from "#/server/atproto/uri";
import { deleteRecord, upsertSubscription } from "#/server/ingest/handlers";
import { markDocumentsRead } from "#/server/reader/mark-documents-read";
import { selectUnreadDocumentUris } from "#/server/reader/queries";
import {
  effectiveFollowUris,
  invalidateSavedLists,
} from "#/server/reader/saved-lists";
import { and, eq } from "drizzle-orm";

import type { XrpcRequestContext } from "../types";

import { requireScopes } from "../auth";
import {
  bodyStringArray,
  optionalBodyField,
  requireBodyField,
} from "../params";
import { XRPC_WRITE_SCOPES } from "../scopes";
import { requireAuthClient } from "./_helpers";

export async function handleFollowPublication(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.subscription]);
  const publicationUri = requireBodyField(ctx.body, "publication");
  const createdAt = new Date().toISOString();
  const { uri, cid } = await putSubscriptionRecord(
    auth.client,
    auth.did,
    publicationUri,
    createdAt,
  );
  await upsertSubscription(uri, auth.did, subjectRkey(publicationUri), cid, {
    publication: publicationUri,
    createdAt,
  });
  return {};
}

export async function handleUnfollowPublication(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.subscription]);
  const publicationUri = requireBodyField(ctx.body, "publication");
  const sub = ctx.schema.subscriptions;
  const rows = await ctx.db
    .select({ rkey: sub.rkey })
    .from(sub)
    .where(
      and(
        eq(sub.subscriberDid, auth.did),
        eq(sub.publicationUri, publicationUri),
        eq(sub.deleted, false),
      ),
    );

  await deleteSubscriptionRecords(
    auth.client,
    auth.did,
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
        buildAtUri(auth.did, Collections.subscription, rkey),
        Collections.subscription,
      ),
    ),
  );
  return {};
}

export async function handleRecommendDocument(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.recommend]);
  const documentUri = requireBodyField(ctx.body, "document");
  await putRecommendRecord(
    auth.client,
    auth.did,
    documentUri,
    new Date().toISOString(),
  );
  return {};
}

export async function handleUnrecommendDocument(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.recommend]);
  const documentUri = requireBodyField(ctx.body, "document");
  await deleteRecommendRecord(auth.client, auth.did, documentUri);
  return {};
}

export async function handleMarkRead(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.read]);
  const documentUri = requireBodyField(ctx.body, "document");
  if (!ctx.trackReadingEnabled) return {};
  await markDocumentsRead({
    client: auth.client,
    did: auth.did,
    documentUris: [documentUri],
    trackReading: true,
  });
  return {};
}

export async function handleMarkUnread(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.read]);
  const documentUri = requireBodyField(ctx.body, "document");
  if (!ctx.trackReadingEnabled) return {};
  await deleteReadRecord(auth.client, auth.did, documentUri);
  return {};
}

export async function handleMarkAllRead(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.read]);
  const followUris = await effectiveFollowUris(ctx.db, ctx.schema, auth.did);
  const documentUris = ctx.trackReadingEnabled
    ? await selectUnreadDocumentUris(ctx.db, ctx.schema, {
        readerDid: auth.did,
        publicationUris: followUris,
      })
    : [];
  return markDocumentsRead({
    client: auth.client,
    did: auth.did,
    documentUris,
    trackReading: ctx.trackReadingEnabled,
  });
}

export async function handleMarkPublicationAllRead(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.read]);
  const publicationUri = requireBodyField(ctx.body, "publication");
  const documentUris = ctx.trackReadingEnabled
    ? await selectUnreadDocumentUris(ctx.db, ctx.schema, {
        readerDid: auth.did,
        publicationUris: [publicationUri],
      })
    : [];
  return markDocumentsRead({
    client: auth.client,
    did: auth.did,
    documentUris,
    trackReading: ctx.trackReadingEnabled,
  });
}

export async function handleBookmarkDocument(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.bookmark]);
  const documentUri = requireBodyField(ctx.body, "document");
  await putBookmarkRecord(
    auth.client,
    auth.did,
    documentUri,
    new Date().toISOString(),
  );
  return {};
}

export async function handleUnbookmarkDocument(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.bookmark]);
  const documentUri = requireBodyField(ctx.body, "document");
  await deleteBookmarkRecord(auth.client, auth.did, documentUri);
  return {};
}

export async function handleCreateList(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.list]);
  const name = requireBodyField(ctx.body, "name");
  const publications = bodyStringArray(ctx.body, "publications");
  const description = optionalBodyField(ctx.body, "description");
  const rkey = newListRkey();
  await putListRecord(auth.client, auth.did, rkey, {
    name,
    description: description || undefined,
    publications,
    createdAt: new Date().toISOString(),
  });
  return {
    rkey,
    uri: buildAtUri(auth.did, APP_NSID.list, rkey),
  };
}

export async function handleUpdateList(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.list]);
  const rkey = requireBodyField(ctx.body, "rkey");
  const name = requireBodyField(ctx.body, "name");
  const publications = bodyStringArray(ctx.body, "publications");
  const description = optionalBodyField(ctx.body, "description");
  await putListRecord(auth.client, auth.did, rkey, {
    name,
    description: description || undefined,
    publications,
    createdAt: new Date().toISOString(),
  });
  return {};
}

export async function handleDeleteList(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.list]);
  const rkey = requireBodyField(ctx.body, "rkey");
  await deleteListRecord(auth.client, auth.did, rkey);
  return {};
}

export async function handleSaveList(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.listSave]);
  const listUri = requireBodyField(ctx.body, "list");
  await putListSaveRecord(
    auth.client,
    auth.did,
    listUri,
    new Date().toISOString(),
  );
  invalidateSavedLists(auth.did);
  return {};
}

export async function handleUnsaveList(ctx: XrpcRequestContext) {
  const auth = requireAuthClient(ctx);
  requireScopes(auth, [XRPC_WRITE_SCOPES.listSave]);
  const listUri = requireBodyField(ctx.body, "list");
  await deleteListSaveRecord(auth.client, auth.did, listUri);
  invalidateSavedLists(auth.did);
  return {};
}

import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getAtprotoSessionForRequest } from "#/middleware/auth";
import {
  deleteReadRecord,
  deleteRecommendRecord,
  deleteSubscriptionRecord,
  putReadRecord,
  putRecommendRecord,
  putSubscriptionRecord,
} from "#/server/atproto/repo-records";
import { ensureTracked } from "#/server/ingest/tap-client";
import { observe } from "#/server/observability/log";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { dbMiddleware } from "./db-middleware";

/**
 * Reader API — the personal write path (follow / like / read) plus the status
 * reads that back the UI toggles. Writes go to the signed-in reader's own AT
 * Proto repo (source of truth); status reads come from the Neon read-model (the
 * tap-fed cache), so the UI should treat toggles as optimistic. Mirrors the
 * `~/Documents/at-store` server-fn + query-options layout, with structured
 * observability around every call (`src/server/observability/log.ts`).
 */

const publicationInput = z.object({
  publicationUri: z.string().min(1),
});

const documentInput = z.object({
  documentUri: z.string().min(1),
});

const documentsInput = z.object({
  documentUris: z.array(z.string().min(1)).max(500),
});

const likesInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
});

export interface FollowStatus {
  isFollowing: boolean;
}

export interface RecommendStatus {
  isRecommended: boolean;
}

export interface ReadStatus {
  isRead: boolean;
}

export interface LikeListItem {
  uri: string;
  documentUri: string;
  createdAt: string | null;
  title: string | null;
  canonicalUrl: string | null;
  publicationUri: string | null;
  coverImageUrl: string | null;
}

/**
 * Register the reader's own repo with tap (best-effort) so their app-owned
 * records flow back into the read-model. Idempotent; never fails the request.
 */
async function trackReaderRepo(did: string): Promise<void> {
  try {
    await ensureTracked(did, "reader");
  } catch (error) {
    console.warn("[reader] failed to track reader repo", did, error);
  }
}

// ── Follow (site.standard.graph.subscription) ───────────────────────────────

const getFollowStatus = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(publicationInput)
  .handler(
    observe("reader.getFollowStatus", async ({ data, context }, span) => {
      span.set("publicationUri", data.publicationUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        return { isFollowing: false } satisfies FollowStatus;
      }
      span.set("did", session.did);

      const sub = context.schema.subscriptions;
      const [row] = await context.db
        .select({ uri: sub.uri })
        .from(sub)
        .where(
          and(
            eq(sub.subscriberDid, session.did),
            eq(sub.publicationUri, data.publicationUri),
            eq(sub.deleted, false),
          ),
        )
        .limit(1);

      return { isFollowing: Boolean(row) } satisfies FollowStatus;
    }),
  );

const followPublication = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(publicationInput)
  .handler(
    observe("reader.followPublication", async ({ data }, span) => {
      span.set("publicationUri", data.publicationUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to follow publications.");
      }
      span.set("did", session.did);

      await putSubscriptionRecord(
        session.client,
        session.did,
        data.publicationUri,
        new Date().toISOString(),
      );
      await trackReaderRepo(session.did);
      return { ok: true as const };
    }),
  );

const unfollowPublication = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(publicationInput)
  .handler(
    observe("reader.unfollowPublication", async ({ data }, span) => {
      span.set("publicationUri", data.publicationUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage follows.");
      }
      span.set("did", session.did);

      await deleteSubscriptionRecord(
        session.client,
        session.did,
        data.publicationUri,
      );
      return { ok: true as const };
    }),
  );

// ── Like (site.standard.graph.recommend) ────────────────────────────────────

const getRecommendStatus = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(documentInput)
  .handler(
    observe("reader.getRecommendStatus", async ({ data, context }, span) => {
      span.set("documentUri", data.documentUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        return { isRecommended: false } satisfies RecommendStatus;
      }
      span.set("did", session.did);

      const rec = context.schema.recommends;
      const [row] = await context.db
        .select({ uri: rec.uri })
        .from(rec)
        .where(
          and(
            eq(rec.recommenderDid, session.did),
            eq(rec.documentUri, data.documentUri),
            eq(rec.deleted, false),
          ),
        )
        .limit(1);

      return { isRecommended: Boolean(row) } satisfies RecommendStatus;
    }),
  );

const getLikes = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(likesInput)
  .handler(
    observe("reader.getLikes", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        return [] satisfies Array<LikeListItem>;
      }
      span.set("did", session.did);
      span.set("limit", data.limit);

      const rec = context.schema.recommends;
      const d = context.schema.documents;
      const rows = await context.db
        .select({
          uri: rec.uri,
          documentUri: rec.documentUri,
          createdAt: rec.createdAt,
          title: d.title,
          canonicalUrl: d.canonicalUrl,
          publicationUri: d.publicationUri,
          coverImageUrl: d.coverImageUrl,
        })
        .from(rec)
        .leftJoin(d, eq(d.uri, rec.documentUri))
        .where(and(eq(rec.recommenderDid, session.did), eq(rec.deleted, false)))
        .orderBy(desc(rec.createdAt))
        .limit(data.limit);

      span.set("count", rows.length);
      return rows.map((row) => ({
        uri: row.uri,
        documentUri: row.documentUri,
        createdAt: row.createdAt?.toISOString() ?? null,
        title: row.title,
        canonicalUrl: row.canonicalUrl,
        publicationUri: row.publicationUri,
        coverImageUrl: row.coverImageUrl,
      })) satisfies Array<LikeListItem>;
    }),
  );

const recommendDocument = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(documentInput)
  .handler(
    observe("reader.recommendDocument", async ({ data }, span) => {
      span.set("documentUri", data.documentUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to save articles.");
      }
      span.set("did", session.did);

      await putRecommendRecord(
        session.client,
        session.did,
        data.documentUri,
        new Date().toISOString(),
      );
      await trackReaderRepo(session.did);
      return { ok: true as const };
    }),
  );

const unrecommendDocument = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(documentInput)
  .handler(
    observe("reader.unrecommendDocument", async ({ data }, span) => {
      span.set("documentUri", data.documentUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage saved articles.");
      }
      span.set("did", session.did);

      await deleteRecommendRecord(
        session.client,
        session.did,
        data.documentUri,
      );
      return { ok: true as const };
    }),
  );

// ── Read state (app.standard-reader.read) ───────────────────────────────────

const getReadStatus = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(documentInput)
  .handler(
    observe("reader.getReadStatus", async ({ data, context }, span) => {
      span.set("documentUri", data.documentUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        return { isRead: false } satisfies ReadStatus;
      }
      span.set("did", session.did);

      const r = context.schema.reads;
      const [row] = await context.db
        .select({ uri: r.uri })
        .from(r)
        .where(
          and(
            eq(r.ownerDid, session.did),
            eq(r.documentUri, data.documentUri),
            eq(r.deleted, false),
          ),
        )
        .limit(1);

      return { isRead: Boolean(row) } satisfies ReadStatus;
    }),
  );

/** Batch read-status lookup for a feed page — returns the read document URIs. */
const getReadDocuments = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(documentsInput)
  .handler(
    observe("reader.getReadDocuments", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session || data.documentUris.length === 0) {
        return [] satisfies Array<string>;
      }
      span.set("did", session.did);
      span.set("requested", data.documentUris.length);

      const r = context.schema.reads;
      const rows = await context.db
        .select({ documentUri: r.documentUri })
        .from(r)
        .where(
          and(
            eq(r.ownerDid, session.did),
            inArray(r.documentUri, data.documentUris),
            eq(r.deleted, false),
          ),
        );

      span.set("read", rows.length);
      return rows.map((row) => row.documentUri) satisfies Array<string>;
    }),
  );

const markRead = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(documentInput)
  .handler(
    observe("reader.markRead", async ({ data }, span) => {
      span.set("documentUri", data.documentUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to track read articles.");
      }
      span.set("did", session.did);

      await putReadRecord(
        session.client,
        session.did,
        data.documentUri,
        new Date().toISOString(),
      );
      await trackReaderRepo(session.did);
      return { ok: true as const };
    }),
  );

const markUnread = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(documentInput)
  .handler(
    observe("reader.markUnread", async ({ data }, span) => {
      span.set("documentUri", data.documentUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to track read articles.");
      }
      span.set("did", session.did);

      await deleteReadRecord(session.client, session.did, data.documentUri);
      return { ok: true as const };
    }),
  );

// ── React Query options (for the UI) ────────────────────────────────────────

function getFollowStatusQueryOptions(publicationUri: string) {
  return queryOptions({
    queryKey: ["reader", "followStatus", publicationUri] as const,
    queryFn: async () => getFollowStatus({ data: { publicationUri } }),
  });
}

function getRecommendStatusQueryOptions(documentUri: string) {
  return queryOptions({
    queryKey: ["reader", "recommendStatus", documentUri] as const,
    queryFn: async () => getRecommendStatus({ data: { documentUri } }),
  });
}

function getReadStatusQueryOptions(documentUri: string) {
  return queryOptions({
    queryKey: ["reader", "readStatus", documentUri] as const,
    queryFn: async () => getReadStatus({ data: { documentUri } }),
  });
}

function getLikesQueryOptions({ limit = 50 }: { limit?: number } = {}) {
  return queryOptions({
    queryKey: ["reader", "likes", limit] as const,
    queryFn: async () => getLikes({ data: { limit } }),
  });
}

function getReadDocumentsQueryOptions(documentUris: Array<string>) {
  return queryOptions({
    queryKey: ["reader", "readDocuments", documentUris.toSorted()] as const,
    queryFn: async () => getReadDocuments({ data: { documentUris } }),
  });
}

// ── React Query mutation options (for the UI; pair with optimistic updates) ──

function followPublicationMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "followPublication"] as const,
    mutationFn: async (publicationUri: string) =>
      followPublication({ data: { publicationUri } }),
  });
}

function unfollowPublicationMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "unfollowPublication"] as const,
    mutationFn: async (publicationUri: string) =>
      unfollowPublication({ data: { publicationUri } }),
  });
}

function recommendDocumentMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "recommendDocument"] as const,
    mutationFn: async (documentUri: string) =>
      recommendDocument({ data: { documentUri } }),
  });
}

function unrecommendDocumentMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "unrecommendDocument"] as const,
    mutationFn: async (documentUri: string) =>
      unrecommendDocument({ data: { documentUri } }),
  });
}

function markReadMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "markRead"] as const,
    mutationFn: async (documentUri: string) =>
      markRead({ data: { documentUri } }),
    retry: false,
  });
}

function markUnreadMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "markUnread"] as const,
    mutationFn: async (documentUri: string) =>
      markUnread({ data: { documentUri } }),
  });
}

export const readerApi = {
  // follow
  getFollowStatus,
  getFollowStatusQueryOptions,
  followPublication,
  followPublicationMutationOptions,
  unfollowPublication,
  unfollowPublicationMutationOptions,
  // like (site.standard.graph.recommend)
  getRecommendStatus,
  getRecommendStatusQueryOptions,
  getLikes,
  getLikesQueryOptions,
  recommendDocument,
  recommendDocumentMutationOptions,
  unrecommendDocument,
  unrecommendDocumentMutationOptions,
  // read
  getReadStatus,
  getReadStatusQueryOptions,
  getReadDocuments,
  getReadDocumentsQueryOptions,
  markRead,
  markReadMutationOptions,
  markUnread,
  markUnreadMutationOptions,
};

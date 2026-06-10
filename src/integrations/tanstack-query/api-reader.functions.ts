import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getAtprotoSessionForRequest } from "#/middleware/auth";
import {
  deleteBookmarkRecord,
  deleteReadRecord,
  deleteRecommendRecord,
  deleteSubscriptionRecords,
  putBookmarkRecord,
  putReadRecord,
  putRecommendRecord,
  putSubscriptionRecord,
} from "#/server/atproto/repo-records";
import { ensureTracked } from "#/server/ingest/tap-client";
import { observe } from "#/server/observability/log";
import { selectUnreadDocumentUris } from "#/server/reader/queries";
import { effectiveFollowUris } from "#/server/reader/saved-lists";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { ArticleCard } from "./api-shapes";

import { articleCardColumns, toArticleCard } from "./api-shapes";
import { dbMiddleware } from "./db-middleware";

/**
 * Reader API — the personal write path (follow / like / save / read) plus the status
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

export interface BookmarkStatus {
  isBookmarked: boolean;
}

export interface MarkAllReadResult {
  markedCount: number;
  documentUris: Array<string>;
}

/** A liked article (`site.standard.graph.recommend`) with hydrated card data. */
export interface LikedArticleItem {
  recommendUri: string;
  likedAt: string | null;
  documentUri: string;
  /** Null when the document is no longer in the read-model. */
  article: ArticleCard | null;
}

/** A saved article (`app.standard-reader.bookmark`) with hydrated card data. */
export interface SavedArticleItem {
  bookmarkUri: string;
  savedAt: string | null;
  documentUri: string;
  /** Null when the document is no longer in the read-model. */
  article: ArticleCard | null;
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
    observe("reader.unfollowPublication", async ({ data, context }, span) => {
      span.set("publicationUri", data.publicationUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage follows.");
      }
      span.set("did", session.did);

      // Externally-created follows (e.g. Leaflet's auto self-subscribe) live at
      // TID rkeys, not our deterministic one — collect every record the
      // read-model knows about for this pair so they all get deleted.
      const sub = context.schema.subscriptions;
      const rows = await context.db
        .select({ rkey: sub.rkey })
        .from(sub)
        .where(
          and(
            eq(sub.subscriberDid, session.did),
            eq(sub.publicationUri, data.publicationUri),
            eq(sub.deleted, false),
          ),
        );
      span.set("records", rows.length);

      await deleteSubscriptionRecords(
        session.client,
        session.did,
        data.publicationUri,
        rows.map((row) => row.rkey),
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
        return [] satisfies Array<LikedArticleItem>;
      }
      span.set("did", session.did);
      span.set("limit", data.limit);

      const rec = context.schema.recommends;
      const d = context.schema.documents;
      const p = context.schema.publications;
      const pr = context.schema.profiles;
      const cols = articleCardColumns(context.schema);
      const rows = await context.db
        .select({
          recommendUri: rec.uri,
          likedAt: rec.createdAt,
          documentUri: rec.documentUri,
          ...cols,
        })
        .from(rec)
        .leftJoin(d, eq(d.uri, rec.documentUri))
        .leftJoin(p, eq(p.uri, d.publicationUri))
        .leftJoin(pr, eq(pr.did, p.did))
        .where(and(eq(rec.recommenderDid, session.did), eq(rec.deleted, false)))
        .orderBy(desc(rec.createdAt))
        .limit(data.limit);

      span.set("count", rows.length);
      return rows.map((row) => ({
        recommendUri: row.recommendUri,
        likedAt: row.likedAt?.toISOString() ?? null,
        documentUri: row.documentUri,
        article:
          row.uri != null &&
          row.did != null &&
          row.title != null &&
          row.publishedAt != null
            ? toArticleCard({
                uri: row.uri,
                did: row.did,
                title: row.title,
                description: row.description,
                path: row.path,
                canonicalUrl: row.canonicalUrl,
                coverImageUrl: row.coverImageUrl,
                publishedAt: row.publishedAt,
                featured: row.featured ?? false,
                publicationUri: row.publicationUri,
                publicationName: row.publicationName,
                publicationIconUrl: row.publicationIconUrl,
                publicationOwnerAvatarUrl: row.publicationOwnerAvatarUrl,
                publicationOwnerHandle: row.publicationOwnerHandle,
                publicationBannerUrl: row.publicationBannerUrl,
                publicationTopic: row.publicationTopic,
                tags: row.tags,
                textContent: row.textContent,
                hasRenderableBody: row.hasRenderableBody,
                recommendCount: row.recommendCount,
              })
            : null,
      })) satisfies Array<LikedArticleItem>;
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
        throw new Error("Sign in to like articles.");
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
        throw new Error("Sign in to manage liked articles.");
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

// ── Save for later (app.standard-reader.bookmark) ───────────────────────────

const getBookmarkStatus = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(documentInput)
  .handler(
    observe("reader.getBookmarkStatus", async ({ data, context }, span) => {
      span.set("documentUri", data.documentUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        return { isBookmarked: false } satisfies BookmarkStatus;
      }
      span.set("did", session.did);

      const b = context.schema.bookmarks;
      const [row] = await context.db
        .select({ uri: b.uri })
        .from(b)
        .where(
          and(
            eq(b.ownerDid, session.did),
            eq(b.documentUri, data.documentUri),
            eq(b.deleted, false),
          ),
        )
        .limit(1);

      return { isBookmarked: Boolean(row) } satisfies BookmarkStatus;
    }),
  );

const getSaved = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(likesInput)
  .handler(
    observe("reader.getSaved", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        return [] satisfies Array<SavedArticleItem>;
      }
      span.set("did", session.did);
      span.set("limit", data.limit);

      const b = context.schema.bookmarks;
      const d = context.schema.documents;
      const p = context.schema.publications;
      const pr = context.schema.profiles;
      const cols = articleCardColumns(context.schema);
      const rows = await context.db
        .select({
          bookmarkUri: b.uri,
          savedAt: b.createdAt,
          documentUri: b.documentUri,
          ...cols,
        })
        .from(b)
        .leftJoin(d, eq(d.uri, b.documentUri))
        .leftJoin(p, eq(p.uri, d.publicationUri))
        .leftJoin(pr, eq(pr.did, p.did))
        .where(and(eq(b.ownerDid, session.did), eq(b.deleted, false)))
        .orderBy(desc(b.createdAt))
        .limit(data.limit);

      span.set("count", rows.length);
      return rows.map((row) => ({
        bookmarkUri: row.bookmarkUri,
        savedAt: row.savedAt?.toISOString() ?? null,
        documentUri: row.documentUri,
        article:
          row.uri != null &&
          row.did != null &&
          row.title != null &&
          row.publishedAt != null
            ? toArticleCard({
                uri: row.uri,
                did: row.did,
                title: row.title,
                description: row.description,
                path: row.path,
                canonicalUrl: row.canonicalUrl,
                coverImageUrl: row.coverImageUrl,
                publishedAt: row.publishedAt,
                featured: row.featured ?? false,
                publicationUri: row.publicationUri,
                publicationName: row.publicationName,
                publicationIconUrl: row.publicationIconUrl,
                publicationOwnerAvatarUrl: row.publicationOwnerAvatarUrl,
                publicationOwnerHandle: row.publicationOwnerHandle,
                publicationBannerUrl: row.publicationBannerUrl,
                publicationTopic: row.publicationTopic,
                tags: row.tags,
                textContent: row.textContent,
                hasRenderableBody: row.hasRenderableBody,
                recommendCount: row.recommendCount,
              })
            : null,
      })) satisfies Array<SavedArticleItem>;
    }),
  );

const bookmarkDocument = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(documentInput)
  .handler(
    observe("reader.bookmarkDocument", async ({ data }, span) => {
      span.set("documentUri", data.documentUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to save articles for later.");
      }
      span.set("did", session.did);

      await putBookmarkRecord(
        session.client,
        session.did,
        data.documentUri,
        new Date().toISOString(),
      );
      await trackReaderRepo(session.did);
      return { ok: true as const };
    }),
  );

const unbookmarkDocument = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(documentInput)
  .handler(
    observe("reader.unbookmarkDocument", async ({ data }, span) => {
      span.set("documentUri", data.documentUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage saved articles.");
      }
      span.set("did", session.did);

      await deleteBookmarkRecord(session.client, session.did, data.documentUri);
      return { ok: true as const };
    }),
  );

async function markDocumentsRead(
  session: NonNullable<Awaited<ReturnType<typeof getAtprotoSessionForRequest>>>,
  documentUris: Array<string>,
): Promise<MarkAllReadResult> {
  if (documentUris.length === 0) {
    return { markedCount: 0, documentUris: [] };
  }

  const createdAt = new Date().toISOString();
  for (const documentUri of documentUris) {
    await putReadRecord(session.client, session.did, documentUri, createdAt);
  }
  await trackReaderRepo(session.did);
  return { markedCount: documentUris.length, documentUris };
}

const markPublicationAllRead = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(publicationInput)
  .handler(
    observe(
      "reader.markPublicationAllRead",
      async ({ data, context }, span) => {
        span.set("publicationUri", data.publicationUri);
        const session = await getAtprotoSessionForRequest(getRequest());
        if (!session) {
          throw new Error("Sign in to track read articles.");
        }
        span.set("did", session.did);

        const documentUris = await selectUnreadDocumentUris(
          context.db,
          context.schema,
          {
            readerDid: session.did,
            publicationUris: [data.publicationUri],
          },
        );
        span.set("count", documentUris.length);
        return markDocumentsRead(session, documentUris);
      },
    ),
  );

const markFollowsAllUnreadRead = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .handler(
    observe("reader.markFollowsAllUnreadRead", async ({ context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to track read articles.");
      }
      span.set("did", session.did);

      // Effective follows: subscriptions plus saved-list publications.
      const followUris = await effectiveFollowUris(
        context.db,
        context.schema,
        session.did,
      );
      const documentUris = await selectUnreadDocumentUris(
        context.db,
        context.schema,
        {
          readerDid: session.did,
          publicationUris: followUris,
        },
      );
      span.set("count", documentUris.length);
      return markDocumentsRead(session, documentUris);
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

function getBookmarkStatusQueryOptions(documentUri: string) {
  return queryOptions({
    queryKey: ["reader", "bookmarkStatus", documentUri] as const,
    queryFn: async () => getBookmarkStatus({ data: { documentUri } }),
  });
}

function getLikesQueryOptions({ limit = 50 }: { limit?: number } = {}) {
  return queryOptions({
    queryKey: ["reader", "likes", limit] as const,
    queryFn: async () => getLikes({ data: { limit } }),
  });
}

function getSavedQueryOptions({ limit = 50 }: { limit?: number } = {}) {
  return queryOptions({
    queryKey: ["reader", "saved", limit] as const,
    queryFn: async () => getSaved({ data: { limit } }),
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

function bookmarkDocumentMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "bookmarkDocument"] as const,
    mutationFn: async (documentUri: string) =>
      bookmarkDocument({ data: { documentUri } }),
  });
}

function unbookmarkDocumentMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "unbookmarkDocument"] as const,
    mutationFn: async (documentUri: string) =>
      unbookmarkDocument({ data: { documentUri } }),
  });
}

function markPublicationAllReadMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "markPublicationAllRead"] as const,
    mutationFn: async (publicationUri: string) =>
      markPublicationAllRead({ data: { publicationUri } }),
    retry: false,
  });
}

function markFollowsAllUnreadReadMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "markFollowsAllUnreadRead"] as const,
    mutationFn: async () => markFollowsAllUnreadRead(),
    retry: false,
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
  markPublicationAllRead,
  markPublicationAllReadMutationOptions,
  markFollowsAllUnreadRead,
  markFollowsAllUnreadReadMutationOptions,
  markUnread,
  markUnreadMutationOptions,
  // save for later (app.standard-reader.bookmark)
  getBookmarkStatus,
  getBookmarkStatusQueryOptions,
  getSaved,
  getSavedQueryOptions,
  bookmarkDocument,
  bookmarkDocumentMutationOptions,
  unbookmarkDocument,
  unbookmarkDocumentMutationOptions,
};

import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { APP_NSID } from "#/lib/atproto/nsids";
import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";
import {
  deleteBookmarkRecord,
  deleteReadRecord,
  deleteRecommendRecord,
  deleteSubscriptionRecords,
  listCollectionRecords,
  putBookmarkRecord,
  putReadRecord,
  putRecommendRecord,
  putSubscriptionRecord,
  subjectRkey,
} from "#/server/atproto/repo-records";
import { Collections, buildAtUri } from "#/server/atproto/uri";
import { deleteRecord, upsertSubscription } from "#/server/ingest/handlers";
import { ensureTracked } from "#/server/ingest/tap-client";
import { observe } from "#/server/observability/log";
import { markDocumentsRead } from "#/server/reader/mark-documents-read";
import { selectUnreadDocumentUris } from "#/server/reader/queries";
import { effectiveFollowUris } from "#/server/reader/saved-lists";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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

/** Default page size for likes / saved / history infinite scroll. */
export const READER_QUEUE_PAGE_SIZE = 20;

const readerListInput = z.object({
  limit: z.number().int().min(1).max(100).default(READER_QUEUE_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
});

/** One offset page of a personal reader queue (likes, saved, history). */
export interface ReaderListPage<T> {
  items: Array<T>;
  total: number;
  nextOffset: number | null;
}

type JoinedArticleRow = {
  uri: string | null;
  did: string | null;
  title: string | null;
  description: string | null;
  path: string | null;
  canonicalUrl: string | null;
  coverImageUrl: string | null;
  publishedAt: Date | null;
  featured: boolean | null;
  publicationUri: string | null;
  publicationName: string | null;
  publicationIconUrl: string | null;
  publicationOwnerAvatarUrl: string | null;
  publicationOwnerHandle: string | null;
  publicationBannerUrl: string | null;
  publicationTopic: string | null;
  tags: Array<string> | null;
  textContent: string | null;
  hasRenderableBody: boolean | null;
  recommendCount: number | null;
};

function hydrateArticleFromRow(
  row: JoinedArticleRow,
  extra?: Pick<Partial<ArticleCard>, "isRead">,
): ArticleCard | null {
  if (
    row.uri == null ||
    row.did == null ||
    row.title == null ||
    row.publishedAt == null
  ) {
    return null;
  }

  return toArticleCard({
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
    ...extra,
  });
}

function buildReaderListPage<T>(
  items: Array<T>,
  offset: number,
  total: number,
): ReaderListPage<T> {
  return {
    items,
    total,
    nextOffset:
      items.length > 0 && offset + items.length < total
        ? offset + items.length
        : null,
  };
}

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

/** A read article (`app.standard-reader.read`) with hydrated card data. */
export interface ReadHistoryItem {
  readUri: string;
  readAt: string | null;
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

      const createdAt = new Date().toISOString();
      const { uri, cid } = await putSubscriptionRecord(
        session.client,
        session.did,
        data.publicationUri,
        createdAt,
      );
      await upsertSubscription(
        uri,
        session.did,
        subjectRkey(data.publicationUri),
        cid,
        {
          publication: data.publicationUri,
          createdAt,
        },
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

      const rkeys = new Set([
        subjectRkey(data.publicationUri),
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
  .inputValidator(readerListInput)
  .handler(
    observe("reader.getLikes", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        return buildReaderListPage<LikedArticleItem>([], data.offset, 0);
      }
      span.set("did", session.did);
      span.set("limit", data.limit);
      span.set("offset", data.offset);

      const rec = context.schema.recommends;
      const d = context.schema.documents;
      const p = context.schema.publications;
      const pr = context.schema.profiles;
      const cols = articleCardColumns(context.schema);
      const where = and(
        eq(rec.recommenderDid, session.did),
        eq(rec.deleted, false),
      );

      const [countRow, rows] = await Promise.all([
        context.db
          .select({ count: sql<number>`count(*)::int` })
          .from(rec)
          .where(where),
        context.db
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
          .where(where)
          .orderBy(desc(rec.createdAt))
          .limit(data.limit)
          .offset(data.offset),
      ]);

      const total = countRow[0]?.count ?? 0;
      span.set("count", rows.length);
      span.set("total", total);

      const items = rows.map((row) => ({
        recommendUri: row.recommendUri,
        likedAt: row.likedAt?.toISOString() ?? null,
        documentUri: row.documentUri,
        article: hydrateArticleFromRow(row),
      })) satisfies Array<LikedArticleItem>;

      return buildReaderListPage(items, data.offset, total);
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

      const trackReading = context.trackReadingEnabled;
      if (!trackReading) {
        return { isRead: true } satisfies ReadStatus;
      }

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

      const trackReading = context.trackReadingEnabled;
      if (!trackReading) {
        return data.documentUris satisfies Array<string>;
      }

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
    observe("reader.markRead", async ({ data, context }, span) => {
      span.set("documentUri", data.documentUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to track read articles.");
      }
      span.set("did", session.did);

      const trackReading = context.trackReadingEnabled;
      if (!trackReading) {
        return { ok: true as const };
      }

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
    observe("reader.markUnread", async ({ data, context }, span) => {
      span.set("documentUri", data.documentUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to track read articles.");
      }
      span.set("did", session.did);

      const trackReading = context.trackReadingEnabled;
      if (!trackReading) {
        return { ok: true as const };
      }

      await deleteReadRecord(session.client, session.did, data.documentUri);
      return { ok: true as const };
    }),
  );

const getReadingHistory = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(readerListInput)
  .handler(
    observe("reader.getReadingHistory", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        return buildReaderListPage<ReadHistoryItem>([], data.offset, 0);
      }
      span.set("did", session.did);
      span.set("limit", data.limit);
      span.set("offset", data.offset);

      const r = context.schema.reads;
      const d = context.schema.documents;
      const p = context.schema.publications;
      const pr = context.schema.profiles;
      const cols = articleCardColumns(context.schema);
      const where = and(eq(r.ownerDid, session.did), eq(r.deleted, false));

      const [countRow, rows] = await Promise.all([
        context.db
          .select({ count: sql<number>`count(*)::int` })
          .from(r)
          .where(where),
        context.db
          .select({
            readUri: r.uri,
            readAt: r.createdAt,
            documentUri: r.documentUri,
            ...cols,
          })
          .from(r)
          .leftJoin(d, eq(d.uri, r.documentUri))
          .leftJoin(p, eq(p.uri, d.publicationUri))
          .leftJoin(pr, eq(pr.did, p.did))
          .where(where)
          .orderBy(desc(r.createdAt))
          .limit(data.limit)
          .offset(data.offset),
      ]);

      const total = countRow[0]?.count ?? 0;
      span.set("count", rows.length);
      span.set("total", total);

      const items = rows.map((row) => ({
        readUri: row.readUri,
        readAt: row.readAt?.toISOString() ?? null,
        documentUri: row.documentUri,
        article: hydrateArticleFromRow(row, { isRead: true }),
      })) satisfies Array<ReadHistoryItem>;

      return buildReaderListPage(items, data.offset, total);
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
  .inputValidator(readerListInput)
  .handler(
    observe("reader.getSaved", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        return buildReaderListPage<SavedArticleItem>([], data.offset, 0);
      }
      span.set("did", session.did);
      span.set("limit", data.limit);
      span.set("offset", data.offset);

      const b = context.schema.bookmarks;
      const d = context.schema.documents;
      const p = context.schema.publications;
      const pr = context.schema.profiles;
      const cols = articleCardColumns(context.schema);
      const where = and(eq(b.ownerDid, session.did), eq(b.deleted, false));

      const [countRow, rows] = await Promise.all([
        context.db
          .select({ count: sql<number>`count(*)::int` })
          .from(b)
          .where(where),
        context.db
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
          .where(where)
          .orderBy(desc(b.createdAt))
          .limit(data.limit)
          .offset(data.offset),
      ]);

      const total = countRow[0]?.count ?? 0;
      span.set("count", rows.length);
      span.set("total", total);

      const items = rows.map((row) => ({
        bookmarkUri: row.bookmarkUri,
        savedAt: row.savedAt?.toISOString() ?? null,
        documentUri: row.documentUri,
        article: hydrateArticleFromRow(row),
      })) satisfies Array<SavedArticleItem>;

      return buildReaderListPage(items, data.offset, total);
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

const deleteAllReadHistory = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .handler(
    observe("reader.deleteAllReadHistory", async ({ context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage your reading history.");
      }
      span.set("did", session.did);

      const records = await listCollectionRecords(
        session.client,
        session.did,
        APP_NSID.read,
      );
      await Promise.all(
        records.map(async (record) => {
          const value = record.value as { subject?: string };
          if (typeof value.subject === "string") {
            await deleteReadRecord(session.client, session.did, value.subject);
          }
        }),
      );

      await context.db
        .delete(context.schema.reads)
        .where(eq(context.schema.reads.ownerDid, session.did));

      await trackReaderRepo(session.did);
      span.set("deleted", records.length);
      return { ok: true as const, deleted: records.length };
    }),
  );

const deleteAllBookmarks = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .handler(
    observe("reader.deleteAllBookmarks", async ({ context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage your saved articles.");
      }
      span.set("did", session.did);

      const records = await listCollectionRecords(
        session.client,
        session.did,
        APP_NSID.bookmark,
      );
      await Promise.all(
        records.map(async (record) => {
          const value = record.value as { subject?: string };
          if (typeof value.subject === "string") {
            await deleteBookmarkRecord(
              session.client,
              session.did,
              value.subject,
            );
          }
        }),
      );

      await context.db
        .delete(context.schema.bookmarks)
        .where(eq(context.schema.bookmarks.ownerDid, session.did));

      await trackReaderRepo(session.did);
      span.set("deleted", records.length);
      return { ok: true as const, deleted: records.length };
    }),
  );

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

        const trackReading = context.trackReadingEnabled;
        const documentUris = trackReading
          ? await selectUnreadDocumentUris(context.db, context.schema, {
              readerDid: session.did,
              publicationUris: [data.publicationUri],
            })
          : [];
        span.set("count", documentUris.length);
        return markDocumentsRead({
          client: session.client,
          did: session.did,
          documentUris,
          trackReading,
        });
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

      const trackReading = context.trackReadingEnabled;

      // Effective follows: subscriptions plus saved-list publications.
      const followUris = await effectiveFollowUris(
        context.db,
        context.schema,
        session.did,
      );
      const documentUris = trackReading
        ? await selectUnreadDocumentUris(context.db, context.schema, {
            readerDid: session.did,
            publicationUris: followUris,
          })
        : [];
      span.set("count", documentUris.length);
      return markDocumentsRead({
        client: session.client,
        did: session.did,
        documentUris,
        trackReading,
      });
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

function getLikesInfiniteQueryOptions({
  limit = READER_QUEUE_PAGE_SIZE,
}: { limit?: number } = {}) {
  return infiniteQueryOptions({
    queryKey: ["reader", "likes", limit] as const,
    queryFn: async ({ pageParam }) =>
      getLikes({ data: { limit, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });
}

function getSavedInfiniteQueryOptions({
  limit = READER_QUEUE_PAGE_SIZE,
}: { limit?: number } = {}) {
  return infiniteQueryOptions({
    queryKey: ["reader", "saved", limit] as const,
    queryFn: async ({ pageParam }) =>
      getSaved({ data: { limit, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });
}

function getReadingHistoryInfiniteQueryOptions({
  limit = READER_QUEUE_PAGE_SIZE,
}: { limit?: number } = {}) {
  return infiniteQueryOptions({
    queryKey: ["reader", "history", limit] as const,
    queryFn: async ({ pageParam }) =>
      getReadingHistory({ data: { limit, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
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

function deleteAllReadHistoryMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "deleteAllReadHistory"] as const,
    mutationFn: async () => deleteAllReadHistory(),
    retry: false,
  });
}

function deleteAllBookmarksMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "deleteAllBookmarks"] as const,
    mutationFn: async () => deleteAllBookmarks(),
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
  getLikesInfiniteQueryOptions,
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
  getReadingHistory,
  getReadingHistoryInfiniteQueryOptions,
  // save for later (app.standard-reader.bookmark)
  getBookmarkStatus,
  getBookmarkStatusQueryOptions,
  getSaved,
  getSavedInfiniteQueryOptions,
  bookmarkDocument,
  bookmarkDocumentMutationOptions,
  unbookmarkDocument,
  unbookmarkDocumentMutationOptions,
  deleteAllReadHistory,
  deleteAllReadHistoryMutationOptions,
  deleteAllBookmarks,
  deleteAllBookmarksMutationOptions,
};

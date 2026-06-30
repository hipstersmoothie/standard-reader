import type { CollectionManifest } from "#/lib/collections/manifest";
import type { CollectionTheme } from "#/lib/collections/theme";
import type { CodeHighlightsByScheme } from "#/lib/theme";
import type { MarginConnectionItem } from "#/server/reader/article-constellation-extras";
import type { ArticleDetailSourceRow } from "#/server/reader/article-detail-build";
import type { CollectionMagazineData } from "#/server/reader/collection-magazine";

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { publicationLinkParams } from "#/components/reader/format";
import {
  getReaderContextForRequest,
  getReaderDidForRequest,
} from "#/middleware/auth-session.server";
import { cdnImageUrl } from "#/server/atproto/blob";
import { buildCanonicalUrl } from "#/server/ingest/mappers";
import { observe } from "#/server/observability/log";
import { attachReaderSpanContext } from "#/server/observability/span-context.ts";
import {
  fetchCitedInArticles,
  fetchMarginConnections,
} from "#/server/reader/article-constellation-extras";
import { buildArticleDetail } from "#/server/reader/article-detail-build";
import { loadCollectionMagazine } from "#/server/reader/collection-magazine";
import { attachCommentCountsToArticles } from "#/server/reader/document-comments";
import { selectPublicationHeader } from "#/server/reader/publication-header";
import {
  articleRecommendedPublications,
  publicationFollowedByCoReaders,
  relatedArticles,
  selectArticleCards,
  selectPublicationArticleCards,
} from "#/server/reader/queries";
import { themeModeForRequest } from "#/server/theme-preference";
import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import type {
  ArticleCard,
  JsonValue,
  ProfileSummary,
  PublicationCard,
} from "./api-shapes";

import { dbMiddleware } from "./db-middleware";

export type { CollectionMagazineData } from "#/server/reader/collection-magazine";

/**
 * Publication-profile and article reading queries (`APP_VISION.md` §5).
 *
 * The profile assembles the header (publication + owner identity + stats),
 * recent writing. The article query returns
 * full content plus its publication card, byline contributors, and recommend
 * count; below-the-fold rails load via `getArticleExtras` on the client.
 * Card `commentCount` uses stale-while-revalidate (cached value or 0, background
 * Constellation refresh). Opening an article marks it read via `readerApi.markRead`
 * from the UI — this GET stays side-effect-free.
 */

const headerInput = z.object({
  publicationUri: z.string().min(1),
});

const profileInput = z.object({
  publicationUri: z.string().min(1),
  recentLimit: z.number().int().min(1).max(30).default(10),
});

const documentsInput = z.object({
  publicationUri: z.string().min(1),
  limit: z.number().int().min(1).max(30).default(20),
  offset: z.number().int().min(0).default(0),
});

const articleInput = z.object({
  documentUri: z.string().min(1),
});

const articleExtrasInput = z.object({
  documentUri: z.string().min(1),
  alsoFollowLimit: z.number().int().min(1).max(20).default(3),
  relatedLimit: z.number().int().min(1).max(10).default(3),
});

const socialProofInput = z.object({
  publicationUri: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(100),
});

const embedInput = z.object({
  publicationUri: z.string().min(1),
});

/** Publication identity + stats for the profile hero (no document list). */
export interface PublicationHeader {
  publication: PublicationCard;
  owner: ProfileSummary;
}

export interface PublicationProfile {
  publication: PublicationCard;
  owner: ProfileSummary;
  recentDocuments: Array<ArticleCard>;
}

export interface PublicationSocialProof {
  readers: Array<
    Pick<ProfileSummary, "did" | "handle" | "displayName" | "avatarUrl">
  >;
  total: number;
}

/** Publication header + theme for subscribe embeds and the subscribe flow. */
export interface PublicationEmbedMeta {
  uri: string;
  did: string;
  rkey: string;
  name: string;
  description: string | null;
  topic: string | null;
  iconUrl: string | null;
  ownerAvatarUrl: string | null;
  ownerDisplayName: string | null;
  ownerHandle: string | null;
  themeBackground: string | null;
  themeForeground: string | null;
  themeAccent: string | null;
  themeAccentForeground: string | null;
}

/** One page of a publication's documents for the profile's infinite scroll. */
export interface PublicationDocumentsPage {
  items: Array<ArticleCard>;
  nextOffset: number | null;
}

export interface ArticleContributor {
  did: string;
  role: string | null;
  displayName: string | null;
  handle: string | null;
  avatarUrl: string | null;
}

export interface ArticleDetail {
  uri: string;
  did: string;
  title: string;
  description: string | null;
  path: string | null;
  canonicalUrl: string | null;
  coverImageUrl: string | null;
  publishedAt: string;
  updatedAt: string | null;
  featured: boolean;
  tags: Array<string> | null;
  contentJson: JsonValue;
  contentFormat: string | null;
  /** Shiki HTML keyed by `codeBlockKey`, per color scheme. */
  codeHighlights: CodeHighlightsByScheme;
  textContent: string | null;
  bskyPostUri: string | null;
  bskyPostCid: string | null;
  publicationUri: string | null;
  publication: PublicationCard | null;
  /** Standard Reader "Collection" manifest when this document is a collection
   * (editorial + ordered items); null for ordinary articles. */
  collection: CollectionManifest | null;
  /** The owning publication's theme + Google fonts, for collection rendering. */
  collectionTheme: CollectionTheme | null;
  /** Owning profile handle for the sticky byline (`@handle`). */
  publicationOwnerHandle: string | null;
  /** Owning profile display name — the byline author when no contributor. */
  publicationOwnerDisplayName: string | null;
  contributors: Array<ArticleContributor>;
  /** Readers who opened this article (`app.standard-reader.read`). */
  readCount: number;
  /** Network endorsements (`site.standard.graph.recommend`). */
  recommendCount: number;
  /** Bluesky link/quote posts + margin.at notes on this article (Constellation). */
  commentCount: number;
  /** Other recent posts from the same publication (excludes this article). */
  moreFrom: Array<ArticleCard>;
  /** Co-subscribed publications for readers of this one ("You might follow"). */
  readersAlsoFollow: Array<PublicationCard>;
}

/** Below-the-fold article data — loaded client-side after the reading view paints. */
export interface ArticleExtras {
  moreFrom: Array<ArticleCard>;
  /** Cross-publication articles by tag overlap and co-read. */
  relatedArticles: Array<ArticleCard>;
  readersAlsoFollow: Array<PublicationCard>;
  /** Other indexed articles whose body links to this document (Constellation). */
  citedIn: Array<ArticleCard>;
  /** Margin/Semble graph edges pointing at this article's URL. */
  marginConnections: Array<MarginConnectionItem>;
}

const getPublicationHeader = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(headerInput)
  .handler(
    observe(
      "publication.getHeader",
      async ({ data, context }, span): Promise<PublicationHeader | null> => {
        const { db, schema } = context;
        span.set("publicationUri", data.publicationUri);
        const header = await selectPublicationHeader(
          db,
          schema,
          data.publicationUri,
        );
        span.set("found", header != null);
        return header;
      },
    ),
  );

const getPublicationProfile = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(profileInput)
  .handler(
    observe(
      "publication.getProfile",
      async ({ data, context }, span): Promise<PublicationProfile | null> => {
        const { db, schema, trackReadingEnabled } = context;
        span.set("publicationUri", data.publicationUri);
        const did = await attachReaderSpanContext(span, getRequest());
        const trackReading = did == null ? false : trackReadingEnabled;
        const readForDid = trackReading && did ? did : undefined;

        const [header, recentDocuments] = await Promise.all([
          selectPublicationHeader(db, schema, data.publicationUri),
          selectPublicationArticleCards(db, schema, {
            publicationUri: data.publicationUri,
            limit: data.recentLimit,
            readForDid,
          }),
        ]);

        if (!header) {
          span.set("found", false);
          return null;
        }
        span.set("found", true);

        const recentWithComments = await attachCommentCountsToArticles(
          db,
          schema,
          recentDocuments,
        );

        return {
          ...header,
          recentDocuments: recentWithComments,
        };
      },
    ),
  );

const getPublicationDocuments = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(documentsInput)
  .handler(
    observe(
      "publication.getDocuments",
      async ({ data, context }, span): Promise<PublicationDocumentsPage> => {
        const { db, schema, trackReadingEnabled } = context;
        span.set("publicationUri", data.publicationUri);
        span.set("offset", data.offset);
        const did = await attachReaderSpanContext(span, getRequest());
        const trackReading = did == null ? false : trackReadingEnabled;
        const readForDid = trackReading && did ? did : undefined;

        const documents = await selectPublicationArticleCards(db, schema, {
          publicationUri: data.publicationUri,
          limit: data.limit,
          offset: data.offset,
          readForDid,
        });
        const items = await attachCommentCountsToArticles(
          db,
          schema,
          documents,
        );

        span.set("count", items.length);
        return {
          items,
          nextOffset:
            documents.length === data.limit ? data.offset + data.limit : null,
        };
      },
    ),
  );

const getArticle = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(articleInput)
  .handler(
    observe(
      "publication.getArticle",
      async ({ data, context }, span): Promise<ArticleDetail | null> => {
        const { db, schema } = context;
        const d = schema.documents;
        const p = schema.publications;
        const st = schema.publicationStats;
        const dc = schema.documentContributors;
        const pr = schema.profiles;
        const pa = alias(schema.profiles, "pa");
        const rec = schema.recommends;
        const reads = schema.reads;
        span.set("documentUri", data.documentUri);
        await attachReaderSpanContext(span, getRequest());

        const [docRows, contributorRows, recommendRows, readRows, reader] =
          await Promise.all([
            db
              .select({
                uri: d.uri,
                did: d.did,
                title: d.title,
                description: d.description,
                path: d.path,
                canonicalUrl: d.canonicalUrl,
                coverImageCid: d.coverImageCid,
                publishedAt: d.publishedAt,
                recordUpdatedAt: d.recordUpdatedAt,
                featured: d.featured,
                tags: d.tags,
                contentJson: d.contentJson,
                contentFormat: d.contentFormat,
                collectionJson: d.collectionJson,
                textContent: d.textContent,
                bskyPostUri: d.bskyPostUri,
                bskyPostCid: d.bskyPostCid,
                publicationUri: d.publicationUri,
                pubUri: p.uri,
                pubDid: p.did,
                pubName: p.name,
                pubUrl: p.url,
                pubDescription: p.description,
                pubIconCid: p.iconCid,
                pubThemeBackground: p.themeBackground,
                pubThemeForeground: p.themeForeground,
                pubThemeAccent: p.themeAccent,
                pubThemeAccentForeground: p.themeAccentForeground,
                pubThemeJson: p.themeJson,
                pubOwnerAvatarUrl: sql<
                  string | null
                >`coalesce(${pr.avatarUrl}, ${pa.avatarUrl})`,
                pubOwnerHandle: sql<
                  string | null
                >`coalesce(${pr.handle}, ${pa.handle})`,
                pubOwnerDisplayName: sql<
                  string | null
                >`coalesce(${pr.displayName}, ${pa.displayName})`,
                pubTopic: p.topic,
                pubVerified: p.verified,
                pubSubscriberCount: st.subscriberCount,
                pubDocumentCount: st.documentCount,
                pubLastDocumentAt: st.lastDocumentAt,
              })
              .from(d)
              .leftJoin(p, eq(p.uri, d.publicationUri))
              .leftJoin(st, eq(st.publicationUri, p.uri))
              .leftJoin(pr, eq(pr.did, p.did))
              .leftJoin(pa, eq(pa.did, d.did))
              .where(eq(d.uri, data.documentUri))
              .limit(1),
            db
              .select({
                did: dc.did,
                role: dc.role,
                displayName: dc.displayName,
                profileDisplayName: pr.displayName,
                handle: pr.handle,
                avatarUrl: pr.avatarUrl,
              })
              .from(dc)
              .leftJoin(pr, eq(pr.did, dc.did))
              .where(eq(dc.documentUri, data.documentUri)),
            db
              .select({ count: sql<number>`count(*)`.mapWith(Number) })
              .from(rec)
              .where(
                and(
                  eq(rec.documentUri, data.documentUri),
                  eq(rec.deleted, false),
                ),
              ),
            db
              .select({ count: sql<number>`count(*)`.mapWith(Number) })
              .from(reads)
              .where(
                and(
                  eq(reads.documentUri, data.documentUri),
                  eq(reads.deleted, false),
                ),
              ),
            // DB-only reader context (DID + user id) — avoids the PDS
            // `manager.resume()` network round trip on every article view.
            // The full PDS client is restored below only in the rare case
            // where the signed-in reader owns this collection document.
            getReaderContextForRequest(getRequest()),
          ]);

        const row = docRows[0];
        if (!row) {
          span.set("found", false);
          return null;
        }
        span.set("found", true);

        const sourceRow = row as ArticleDetailSourceRow;
        const contributors: Array<ArticleContributor> = contributorRows.map(
          (c) => ({
            did: c.did,
            role: c.role,
            displayName: c.displayName ?? c.profileDisplayName,
            handle: c.handle,
            avatarUrl: c.avatarUrl,
          }),
        );

        const themeMode = await themeModeForRequest(db, schema, reader?.userId);

        return buildArticleDetail(
          db,
          schema,
          sourceRow,
          contributors,
          themeMode,
          {
            readCount: readRows[0]?.count ?? 0,
            recommendCount: recommendRows[0]?.count ?? 0,
          },
        );
      },
    ),
  );

const getCollection = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(articleInput)
  .handler(
    observe(
      "publication.getCollection",
      async (
        { data, context },
        span,
      ): Promise<CollectionMagazineData | null> => {
        span.set("documentUri", data.documentUri);
        await attachReaderSpanContext(span, getRequest());

        const result = await loadCollectionMagazine(
          context.db,
          context.schema,
          data.documentUri,
          getRequest(),
        );
        span.set("found", result != null);
        span.set("featureCount", result?.features.length ?? 0);
        return result;
      },
    ),
  );

const getPublicationEmbedMeta = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(embedInput)
  .handler(
    observe(
      "publication.getEmbedMeta",
      async ({ data, context }, span): Promise<PublicationEmbedMeta | null> => {
        const { db, schema } = context;
        const p = schema.publications;
        const pr = schema.profiles;
        span.set("publicationUri", data.publicationUri);

        const link = publicationLinkParams(data.publicationUri);
        if (!link) return null;

        const [row] = await db
          .select({
            uri: p.uri,
            did: p.did,
            name: p.name,
            description: p.description,
            topic: p.topic,
            iconCid: p.iconCid,
            ownerAvatarUrl: pr.avatarUrl,
            ownerDisplayName: pr.displayName,
            ownerHandle: pr.handle,
            themeBackground: p.themeBackground,
            themeForeground: p.themeForeground,
            themeAccent: p.themeAccent,
            themeAccentForeground: p.themeAccentForeground,
          })
          .from(p)
          .leftJoin(pr, eq(pr.did, p.did))
          .where(and(eq(p.uri, data.publicationUri), eq(p.deleted, false)))
          .limit(1);

        if (!row?.name) return null;

        return {
          uri: row.uri,
          did: row.did,
          rkey: link.rkey,
          name: row.name,
          description: row.description,
          topic: row.topic,
          iconUrl: row.iconCid
            ? cdnImageUrl(row.did, row.iconCid, "png")
            : null,
          ownerAvatarUrl: row.ownerAvatarUrl,
          ownerDisplayName: row.ownerDisplayName,
          ownerHandle: row.ownerHandle,
          themeBackground: row.themeBackground,
          themeForeground: row.themeForeground,
          themeAccent: row.themeAccent,
          themeAccentForeground: row.themeAccentForeground,
        };
      },
    ),
  );

const getPublicationSocialProof = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(socialProofInput)
  .handler(
    observe(
      "publication.getSocialProof",
      async ({ data, context }, span): Promise<PublicationSocialProof> => {
        const { db, schema } = context;
        span.set("publicationUri", data.publicationUri);

        const did = await getReaderDidForRequest(getRequest());
        if (!did) {
          span.set("signedIn", false);
          span.set("count", 0);
          return { readers: [], total: 0 };
        }
        span.set("signedIn", true);
        span.set("did", did);

        const proof = await publicationFollowedByCoReaders(
          db,
          schema,
          did,
          data.publicationUri,
          data.limit,
        );
        span.set("count", proof.total);
        return proof;
      },
    ),
  );

const getArticleExtras = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(articleExtrasInput)
  .handler(
    observe(
      "publication.getArticleExtras",
      async ({ data, context }, span): Promise<ArticleExtras> => {
        const { db, schema } = context;
        const d = schema.documents;
        span.set("documentUri", data.documentUri);
        await attachReaderSpanContext(span, getRequest());

        const p = schema.publications;
        const [row] = await db
          .select({
            uri: d.uri,
            publicationUri: d.publicationUri,
            path: d.path,
            canonicalUrl: d.canonicalUrl,
            publicationUrl: p.url,
          })
          .from(d)
          .leftJoin(p, eq(d.publicationUri, p.uri))
          .where(eq(d.uri, data.documentUri))
          .limit(1);

        if (!row) {
          span.set("found", false);
          return {
            moreFrom: [],
            relatedArticles: [],
            readersAlsoFollow: [],
            citedIn: [],
            marginConnections: [],
          };
        }
        span.set("found", true);

        const canonicalUrl =
          row.canonicalUrl ?? buildCanonicalUrl(row.publicationUrl, row.path);
        const linkUrls = canonicalUrl ? [canonicalUrl] : [];

        const readerDid = await getReaderDidForRequest(getRequest());

        const [
          moreFromRaw,
          relatedRaw,
          recommendedRaw,
          citedInRaw,
          marginConnectionsRaw,
        ] = await Promise.all([
          row.publicationUri
            ? selectArticleCards(db, schema, {
                publicationUris: [row.publicationUri],
                limit: 4,
              })
            : Promise.resolve([]),
          relatedArticles(db, schema, {
            documentUri: row.uri,
            publicationUri: row.publicationUri,
            limit: data.relatedLimit,
          }),
          articleRecommendedPublications(db, schema, {
            publicationUri: row.publicationUri,
            readerDid,
            limit: data.alsoFollowLimit,
          }),
          linkUrls.length > 0
            ? fetchCitedInArticles(db, schema, {
                urls: linkUrls,
                excludeDocumentUri: row.uri,
                limit: 3,
              })
            : Promise.resolve([]),
          linkUrls.length > 0
            ? fetchMarginConnections(db, schema, {
                urls: linkUrls,
                limit: 3,
              })
            : Promise.resolve([]),
        ]);

        const moreFrom = moreFromRaw
          .filter((doc) => doc.uri !== row.uri)
          .slice(0, 3);
        const marginConnectionArticles = marginConnectionsRaw.map(
          (item) => item.article,
        );
        const [
          moreFromWithComments,
          relatedWithComments,
          citedInWithComments,
          marginConnectionArticlesWithComments,
        ] = await Promise.all([
          attachCommentCountsToArticles(db, schema, moreFrom),
          attachCommentCountsToArticles(db, schema, relatedRaw),
          attachCommentCountsToArticles(db, schema, citedInRaw),
          attachCommentCountsToArticles(db, schema, marginConnectionArticles),
        ]);

        const marginArticleByUri = new Map(
          marginConnectionArticlesWithComments.map((article) => [
            article.uri,
            article,
          ]),
        );
        const marginConnections = marginConnectionsRaw.map((item) => ({
          ...item,
          article: marginArticleByUri.get(item.article.uri) ?? item.article,
        }));

        return {
          moreFrom: moreFromWithComments,
          relatedArticles: relatedWithComments,
          readersAlsoFollow: recommendedRaw,
          citedIn: citedInWithComments,
          marginConnections,
        };
      },
    ),
  );

function getPublicationHeaderQueryOptions(publicationUri: string) {
  return queryOptions({
    queryKey: ["publication", "header", publicationUri] as const,
    queryFn: async () => getPublicationHeader({ data: { publicationUri } }),
  });
}

function getPublicationProfileQueryOptions(
  publicationUri: string,
  {
    recentLimit = 10,
    readerScope = "guest",
  }: { recentLimit?: number; readerScope?: string } = {},
) {
  return queryOptions({
    queryKey: [
      "publication",
      "profile",
      publicationUri,
      recentLimit,
      readerScope,
    ] as const,
    queryFn: async () =>
      getPublicationProfile({
        data: { publicationUri, recentLimit },
      }),
  });
}

function getPublicationDocumentsQueryOptions(
  publicationUri: string,
  {
    limit = 20,
    offset = 0,
    readerScope = "guest",
  }: { limit?: number; offset?: number; readerScope?: string } = {},
) {
  return queryOptions({
    queryKey: [
      "publication",
      "documents",
      publicationUri,
      limit,
      offset,
      readerScope,
    ] as const,
    queryFn: async () =>
      getPublicationDocuments({ data: { publicationUri, limit, offset } }),
  });
}

function getArticleQueryOptions(documentUri: string) {
  return queryOptions({
    queryKey: ["article", documentUri] as const,
    queryFn: async () => getArticle({ data: { documentUri } }),
  });
}

function getCollectionQueryOptions(documentUri: string) {
  return queryOptions({
    queryKey: ["collection", documentUri] as const,
    queryFn: async () => getCollection({ data: { documentUri } }),
    staleTime: 60_000,
  });
}

function getArticleExtrasQueryOptions(documentUri: string) {
  return queryOptions({
    queryKey: ["article", "extras", documentUri] as const,
    queryFn: async () => getArticleExtras({ data: { documentUri } }),
    staleTime: 60_000,
  });
}

function getPublicationSocialProofQueryOptions(
  publicationUri: string,
  { limit = 100 }: { limit?: number } = {},
) {
  return queryOptions({
    queryKey: ["publication", "socialProof", publicationUri, limit] as const,
    queryFn: async () =>
      getPublicationSocialProof({ data: { publicationUri, limit } }),
    staleTime: 60_000,
  });
}

function getPublicationEmbedMetaQueryOptions(publicationUri: string) {
  return queryOptions({
    queryKey: ["publication", "embedMeta", publicationUri] as const,
    queryFn: async () => getPublicationEmbedMeta({ data: { publicationUri } }),
    staleTime: 300_000,
  });
}

export const publicationApi = {
  getPublicationHeader,
  getPublicationHeaderQueryOptions,
  getPublicationProfile,
  getPublicationProfileQueryOptions,
  getPublicationDocuments,
  getPublicationDocumentsQueryOptions,
  getPublicationEmbedMeta,
  getPublicationEmbedMetaQueryOptions,
  getPublicationSocialProof,
  getPublicationSocialProofQueryOptions,
  getArticle,
  getArticleQueryOptions,
  getCollection,
  getCollectionQueryOptions,
  getArticleExtras,
  getArticleExtrasQueryOptions,
};

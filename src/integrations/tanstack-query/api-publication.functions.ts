import type { LeafletCodeBlock } from "#/lib/leaflet/types";
import type { CodeHighlightsByScheme, ThemeMode } from "#/lib/theme";
import type { MarginConnectionItem } from "#/server/reader/article-constellation-extras";

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { publicationLinkParams } from "#/components/reader/format";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { GREENGALE_CONTENT_REF } from "#/lib/greengale/types";
import { leafletBlocks } from "#/lib/leaflet/blocks";
import { LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { offprintBlocks } from "#/lib/offprint/blocks";
import { OFFPRINT_CONTENT } from "#/lib/offprint/types";
import { pcktBlocks, pcktCodeLanguage } from "#/lib/pckt/blocks";
import { PCKT_CONTENT } from "#/lib/pckt/types";
import { EMPTY_CODE_HIGHLIGHTS } from "#/lib/theme";
import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";
import { authorPds } from "#/server/atproto/identity";
import { resolveGreengaleContent } from "#/server/greengale/resolve";
import { buildCanonicalUrl } from "#/server/ingest/mappers";
import { resolveLeafletContent } from "#/server/leaflet/resolve";
import { observe } from "#/server/observability/log";
import { attachReaderSpanContext } from "#/server/observability/span-context.ts";
import { resolvePcktContent } from "#/server/pckt/resolve";
import {
  fetchCitedInArticles,
  fetchMarginConnections,
} from "#/server/reader/article-constellation-extras";
import {
  attachCommentCountsToArticles,
  countDocumentComments,
} from "#/server/reader/document-comments";
import {
  articleRecommendedPublications,
  publicationFollowedByCoReaders,
  relatedArticles,
  selectArticleCards,
  selectPublicationArticleCards,
} from "#/server/reader/queries";
import { resolveTrackReadingHistoryEnabled } from "#/server/reader/track-reading-history";
import { highlightLeafletCodeBlocks } from "#/server/shiki/highlighter";
import { themeModeForRequest } from "#/server/theme-preference";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type {
  ArticleCard,
  JsonValue,
  ProfileSummary,
  PublicationCard,
} from "./api-shapes";

import { publicationCardColumns, toPublicationCard } from "./api-shapes";
import { dbMiddleware } from "./db-middleware";

export type { MarginConnectionItem } from "#/server/reader/article-constellation-extras";

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

async function codeHighlightsForThemeMode(
  blocks: Array<Pick<LeafletCodeBlock, "language" | "plaintext">>,
  themeMode: ThemeMode,
): Promise<CodeHighlightsByScheme> {
  if (blocks.length === 0) return EMPTY_CODE_HIGHLIGHTS;

  if (themeMode === "system") {
    const [light, dark] = await Promise.all([
      highlightLeafletCodeBlocks(blocks, "light"),
      highlightLeafletCodeBlocks(blocks, "dark"),
    ]);
    return { light, dark };
  }

  const single = await highlightLeafletCodeBlocks(blocks, themeMode);
  return themeMode === "dark"
    ? { light: {}, dark: single }
    : { light: single, dark: {} };
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
  /** PDS for the authoring repo — resolves in-body leaflet image blobs. */
  authorPds: string | null;
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

const getPublicationProfile = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(profileInput)
  .handler(
    observe(
      "publication.getProfile",
      async ({ data, context }, span): Promise<PublicationProfile | null> => {
        const { db, schema } = context;
        const p = schema.publications;
        const st = schema.publicationStats;
        const pr = schema.profiles;
        span.set("publicationUri", data.publicationUri);
        const did = await attachReaderSpanContext(span, getRequest());
        const trackReading =
          did == null
            ? false
            : await resolveTrackReadingHistoryEnabled(db, schema);
        const readForDid = trackReading && did ? did : undefined;

        const [headerRow, recentDocuments] = await Promise.all([
          db
            .select({
              ...publicationCardColumns(schema),
              ownerHandle: pr.handle,
              ownerDisplayName: pr.displayName,
              ownerDescription: pr.description,
              ownerBannerUrl: pr.bannerUrl,
            })
            .from(p)
            .leftJoin(st, eq(st.publicationUri, p.uri))
            .leftJoin(pr, eq(pr.did, p.did))
            .where(eq(p.uri, data.publicationUri))
            .limit(1),
          selectPublicationArticleCards(db, schema, {
            publicationUri: data.publicationUri,
            limit: data.recentLimit,
            readForDid,
          }),
        ]);

        const row = headerRow[0];
        if (!row) {
          span.set("found", false);
          return null;
        }
        span.set("found", true);

        const owner: ProfileSummary = {
          did: row.did,
          handle: row.ownerHandle,
          displayName: row.ownerDisplayName,
          description: row.ownerDescription,
          avatarUrl: row.ownerAvatarUrl,
          bannerUrl: row.ownerBannerUrl,
        };

        const publication = toPublicationCard(row);

        const recentWithComments = await attachCommentCountsToArticles(
          db,
          schema,
          recentDocuments,
        );

        return {
          publication,
          owner,
          recentDocuments: recentWithComments,
        };
      },
    ),
  );

const getPublicationDocuments = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(documentsInput)
  .handler(
    observe(
      "publication.getDocuments",
      async ({ data, context }, span): Promise<PublicationDocumentsPage> => {
        const { db, schema } = context;
        span.set("publicationUri", data.publicationUri);
        span.set("offset", data.offset);
        const did = await attachReaderSpanContext(span, getRequest());
        const trackReading =
          did == null
            ? false
            : await resolveTrackReadingHistoryEnabled(db, schema);
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
  .inputValidator(articleInput)
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
        const rec = schema.recommends;
        const reads = schema.reads;
        span.set("documentUri", data.documentUri);
        await attachReaderSpanContext(span, getRequest());

        const [docRows, contributorRows, recommendRows, readRows] =
          await Promise.all([
            db
              .select({
                uri: d.uri,
                did: d.did,
                title: d.title,
                description: d.description,
                path: d.path,
                canonicalUrl: d.canonicalUrl,
                coverImageUrl: d.coverImageUrl,
                publishedAt: d.publishedAt,
                recordUpdatedAt: d.recordUpdatedAt,
                featured: d.featured,
                tags: d.tags,
                contentJson: d.contentJson,
                contentFormat: d.contentFormat,
                textContent: d.textContent,
                bskyPostUri: d.bskyPostUri,
                bskyPostCid: d.bskyPostCid,
                publicationUri: d.publicationUri,
                pubUri: p.uri,
                pubDid: p.did,
                pubName: p.name,
                pubUrl: p.url,
                pubDescription: p.description,
                pubIconUrl: p.iconUrl,
                pubOwnerAvatarUrl: pr.avatarUrl,
                pubOwnerHandle: pr.handle,
                pubOwnerDisplayName: pr.displayName,
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
          ]);

        const row = docRows[0];
        if (!row) {
          span.set("found", false);
          return null;
        }
        span.set("found", true);

        const commentCountPromise = countDocumentComments(
          db,
          schema,
          data.documentUri,
        );

        const [authorProfile] = await db
          .select({ pds: pr.pds })
          .from(pr)
          .where(eq(pr.did, row.did))
          .limit(1);

        const publication: PublicationCard | null = row.pubUri
          ? toPublicationCard({
              uri: row.pubUri,
              did: row.pubDid ?? row.did,
              name: row.pubName ?? "",
              url: row.pubUrl ?? "",
              description: row.pubDescription,
              iconUrl: row.pubIconUrl,
              ownerAvatarUrl: row.pubOwnerAvatarUrl,
              ownerHandle: row.pubOwnerHandle,
              topic: row.pubTopic,
              verified: row.pubVerified ?? false,
              subscriberCount: row.pubSubscriberCount,
              documentCount: row.pubDocumentCount,
              lastDocumentAt: row.pubLastDocumentAt,
            })
          : null;

        const contributors: Array<ArticleContributor> = contributorRows.map(
          (c) => ({
            did: c.did,
            role: c.role,
            displayName: c.displayName ?? c.profileDisplayName,
            handle: c.handle,
            avatarUrl: c.avatarUrl,
          }),
        );

        const session = await getAtprotoSessionForRequest(getRequest());

        const authorPdsEndpoint = await authorPds(
          row.did,
          authorProfile?.pds ?? null,
        );

        const rawContentJson = row.contentJson ?? null;
        let resolvedContentJson = rawContentJson as JsonValue | null;
        let resolvedContentFormat = row.contentFormat;
        if (rawContentJson) {
          if (row.contentFormat === LEAFLET_CONTENT) {
            resolvedContentJson = (await resolveLeafletContent(
              rawContentJson,
              row.did,
              authorPdsEndpoint,
            )) as JsonValue;
          } else if (row.contentFormat === PCKT_CONTENT) {
            resolvedContentJson = (await resolvePcktContent(
              rawContentJson,
              row.did,
              authorPdsEndpoint,
            )) as JsonValue;
          } else if (row.contentFormat === GREENGALE_CONTENT_REF) {
            resolvedContentJson = (await resolveGreengaleContent(
              rawContentJson,
              row.did,
              authorPdsEndpoint,
            )) as JsonValue;
            if (
              resolvedContentJson &&
              typeof resolvedContentJson === "object" &&
              !Array.isArray(resolvedContentJson) &&
              resolvedContentJson.$type === STANDARD_MARKDOWN_CONTENT
            ) {
              resolvedContentFormat = STANDARD_MARKDOWN_CONTENT;
            }
          }
        }

        const themeMode = await themeModeForRequest(
          db,
          schema,
          session?.session.user.id,
        );

        const codeBlocks: Array<
          Pick<LeafletCodeBlock, "language" | "plaintext">
        > =
          row.contentFormat === LEAFLET_CONTENT && resolvedContentJson
            ? leafletBlocks(resolvedContentJson)
                .filter((block) => block.kind === "code")
                .map((block) => block.block)
            : row.contentFormat === PCKT_CONTENT && resolvedContentJson
              ? pcktBlocks(resolvedContentJson)
                  .filter((block) => block.kind === "code")
                  .map((block) => ({
                    plaintext: block.block.plaintext,
                    language: pcktCodeLanguage(block.block),
                  }))
              : row.contentFormat === OFFPRINT_CONTENT && resolvedContentJson
                ? offprintBlocks(resolvedContentJson)
                    .filter((block) => block.kind === "code")
                    .map((block) => ({
                      plaintext: block.plaintext,
                      language: block.language,
                    }))
                : resolvedContentFormat === STANDARD_MARKDOWN_CONTENT &&
                    resolvedContentJson
                  ? []
                  : [];

        const [codeHighlights, commentCount] = await Promise.all([
          codeHighlightsForThemeMode(codeBlocks, themeMode),
          commentCountPromise,
        ]);

        return {
          uri: row.uri,
          did: row.did,
          authorPds: authorPdsEndpoint,
          title: row.title,
          description: row.description,
          path: row.path,
          canonicalUrl: row.canonicalUrl,
          coverImageUrl: row.coverImageUrl,
          publishedAt: row.publishedAt.toISOString(),
          updatedAt: row.recordUpdatedAt?.toISOString() ?? null,
          featured: row.featured,
          tags: row.tags,
          contentJson: resolvedContentJson,
          contentFormat: resolvedContentFormat,
          codeHighlights,
          textContent: row.textContent,
          bskyPostUri: row.bskyPostUri,
          bskyPostCid: row.bskyPostCid,
          publicationUri: row.publicationUri,
          publication,
          publicationOwnerHandle: row.pubOwnerHandle ?? null,
          publicationOwnerDisplayName: row.pubOwnerDisplayName ?? null,
          contributors,
          readCount: readRows[0]?.count ?? 0,
          recommendCount: recommendRows[0]?.count ?? 0,
          commentCount,
          moreFrom: [],
          readersAlsoFollow: [],
        };
      },
    ),
  );

const getPublicationEmbedMeta = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(embedInput)
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
            iconUrl: p.iconUrl,
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
          iconUrl: row.iconUrl,
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
  .inputValidator(socialProofInput)
  .handler(
    observe(
      "publication.getSocialProof",
      async ({ data, context }, span): Promise<PublicationSocialProof> => {
        const { db, schema } = context;
        span.set("publicationUri", data.publicationUri);

        const session = await getAtprotoSessionForRequest(getRequest());
        if (!session) {
          span.set("signedIn", false);
          span.set("count", 0);
          return { readers: [], total: 0 };
        }
        span.set("signedIn", true);
        span.set("did", session.did);

        const proof = await publicationFollowedByCoReaders(
          db,
          schema,
          session.did,
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
  .inputValidator(articleExtrasInput)
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

        const session = await getAtprotoSessionForRequest(getRequest());
        const readerDid = session?.did;

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
  getArticleExtras,
  getArticleExtrasQueryOptions,
};

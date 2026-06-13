import type { db } from "#/db/index.server";
import type * as schema from "#/db/schema";
import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";
import type { DocumentComment } from "#/server/reader/document-comments";

import { documentLinkParams } from "#/components/reader/format";
import { getPublicUrl } from "#/lib/public-url";
import { buildCanonicalUrl } from "#/server/ingest/mappers";
import {
  fetchCitedInArticles,
  fetchMarginConnections,
} from "#/server/reader/article-constellation-extras";
import {
  attachCommentCountsToArticles,
  fetchDocumentComments,
} from "#/server/reader/document-comments";
import { relatedArticles, selectArticleCards } from "#/server/reader/queries";
import { eq } from "drizzle-orm";

import type {
  ExtensionDiscussionArticle,
  ExtensionDiscussionResponse,
} from "./types";

function buildArticleReaderUrl(documentUri: string): string {
  const params = documentLinkParams(documentUri);
  const base = getPublicUrl();
  if (!params) return base;
  return `${base}/a/${encodeURIComponent(params.did)}/${encodeURIComponent(params.rkey)}`;
}

function toDiscussionArticle(
  article: ArticleCard,
  subtitle?: string,
): ExtensionDiscussionArticle {
  return {
    uri: article.uri,
    title: article.title,
    publicationName: article.publicationName,
    publicationUri: article.publicationUri,
    readerUrl: buildArticleReaderUrl(article.uri),
    commentCount: article.commentCount,
    subtitle,
  };
}

function mergeRelatedReading(
  marginConnections: Awaited<ReturnType<typeof fetchMarginConnections>>,
  related: Array<ArticleCard>,
): Array<ExtensionDiscussionArticle> {
  const seen = new Set<string>();
  const merged: Array<ExtensionDiscussionArticle> = [];

  for (const item of marginConnections) {
    if (seen.has(item.article.uri)) continue;
    seen.add(item.article.uri);
    merged.push(
      toDiscussionArticle(item.article, `${item.connectionLabel} via Semble`),
    );
  }

  for (const article of related) {
    if (seen.has(article.uri)) continue;
    seen.add(article.uri);
    merged.push(toDiscussionArticle(article));
  }

  return merged;
}

function toDiscussionComment(
  comment: DocumentComment,
): ExtensionDiscussionResponse["discussions"][number] {
  return {
    source: comment.source,
    kind: comment.kind,
    postUri: comment.postUri,
    postUrl: comment.postUrl,
    author: comment.author,
    commentary: comment.commentary,
    quote: comment.quote,
    replyCount: comment.replyCount,
    indexedAt: comment.indexedAt,
  };
}

export async function resolveDiscussion(
  dbClient: typeof db,
  schemaModule: typeof schema,
  documentUri: string,
): Promise<ExtensionDiscussionResponse> {
  const d = schemaModule.documents;
  const p = schemaModule.publications;

  const [row] = await dbClient
    .select({
      uri: d.uri,
      publicationUri: d.publicationUri,
      path: d.path,
      canonicalUrl: d.canonicalUrl,
      publicationUrl: p.url,
    })
    .from(d)
    .leftJoin(p, eq(d.publicationUri, p.uri))
    .where(eq(d.uri, documentUri))
    .limit(1);

  const commentsPromise = fetchDocumentComments(
    dbClient,
    schemaModule,
    documentUri,
  );

  if (!row) {
    const discussions = await commentsPromise;
    return {
      keepReading: [],
      discussions: discussions.map((comment) => toDiscussionComment(comment)),
      relatedReading: [],
      citedIn: [],
    };
  }

  const canonicalUrl =
    row.canonicalUrl ?? buildCanonicalUrl(row.publicationUrl, row.path);
  const linkUrls = canonicalUrl ? [canonicalUrl] : [];

  const [
    discussions,
    moreFromRaw,
    relatedRaw,
    citedInRaw,
    marginConnectionsRaw,
  ] = await Promise.all([
    commentsPromise,
    row.publicationUri
      ? selectArticleCards(dbClient, schemaModule, {
          publicationUris: [row.publicationUri],
          limit: 4,
        })
      : Promise.resolve([]),
    relatedArticles(dbClient, schemaModule, {
      documentUri: row.uri,
      publicationUri: row.publicationUri,
      limit: 8,
    }),
    linkUrls.length > 0
      ? fetchCitedInArticles(dbClient, schemaModule, {
          urls: linkUrls,
          excludeDocumentUri: row.uri,
          limit: 8,
        })
      : Promise.resolve([]),
    linkUrls.length > 0
      ? fetchMarginConnections(dbClient, schemaModule, {
          urls: linkUrls,
          limit: 8,
        })
      : Promise.resolve([]),
  ]);

  const moreFrom = moreFromRaw.filter((doc) => doc.uri !== row.uri).slice(0, 3);
  const marginConnectionArticles = marginConnectionsRaw.map(
    (item) => item.article,
  );

  const [
    moreFromWithComments,
    relatedWithComments,
    citedInWithComments,
    marginArticlesWithComments,
  ] = await Promise.all([
    attachCommentCountsToArticles(dbClient, schemaModule, moreFrom),
    attachCommentCountsToArticles(dbClient, schemaModule, relatedRaw),
    attachCommentCountsToArticles(dbClient, schemaModule, citedInRaw),
    attachCommentCountsToArticles(
      dbClient,
      schemaModule,
      marginConnectionArticles,
    ),
  ]);

  const marginArticleByUri = new Map(
    marginArticlesWithComments.map((article) => [article.uri, article]),
  );
  const marginConnections = marginConnectionsRaw.map((item) => ({
    ...item,
    article: marginArticleByUri.get(item.article.uri) ?? item.article,
  }));

  return {
    keepReading: moreFromWithComments.map((article) =>
      toDiscussionArticle(article),
    ),
    discussions: discussions.map((comment) => toDiscussionComment(comment)),
    relatedReading: mergeRelatedReading(marginConnections, relatedWithComments),
    citedIn: citedInWithComments.map((article) => toDiscussionArticle(article)),
  };
}

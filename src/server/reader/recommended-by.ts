import { and, desc, eq, inArray } from "drizzle-orm";

import type { db } from "#/db/index.server";
import type * as schema from "#/db/schema";
import type {
  ArticleCard,
  ArticleCardRecommender,
} from "#/integrations/tanstack-query/api-shapes";

/**
 * Attach "Recommended by" attribution to feed cards. For each article, collects
 * the followed users who recommended it (newest recommend first) into a single
 * `recommendedBy` list — so an article recommended by many followed people
 * collapses to ONE card with all of them, not one card per recommender.
 *
 * Self-recommends are excluded (a followed user liking their own post shouldn't
 * read as "Recommended by <themselves>" on their own article). Cards with no
 * followed-user recommends are returned unchanged (no `recommendedBy` field),
 * which is the common case for publication-/author-sourced rows.
 */
export async function attachRecommendedByToArticles<
  T extends Pick<ArticleCard, "uri" | "did">,
>(
  dbClient: typeof db,
  schemaModule: typeof schema,
  followedUserDids: Array<string>,
  articles: Array<T>,
): Promise<Array<T & { recommendedBy?: Array<ArticleCardRecommender> }>> {
  if (articles.length === 0 || followedUserDids.length === 0) {
    return articles;
  }

  const uris = [...new Set(articles.map((article) => article.uri))];
  const rec = schemaModule.recommends;
  const pr = schemaModule.profiles;

  const rows = await dbClient
    .select({
      documentUri: rec.documentUri,
      did: rec.recommenderDid,
      handle: pr.handle,
      displayName: pr.displayName,
      avatarUrl: pr.avatarUrl,
    })
    .from(rec)
    .leftJoin(pr, eq(pr.did, rec.recommenderDid))
    .where(
      and(
        inArray(rec.documentUri, uris),
        inArray(rec.recommenderDid, followedUserDids),
        eq(rec.deleted, false),
      ),
    )
    .orderBy(desc(rec.createdAt));

  const byDoc = new Map<string, Array<ArticleCardRecommender>>();
  for (const row of rows) {
    const list = byDoc.get(row.documentUri) ?? [];
    // A recommender can hold multiple records; keep one entry per DID.
    if (list.some((r) => r.did === row.did)) continue;
    list.push({
      did: row.did,
      handle: row.handle,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
    });
    byDoc.set(row.documentUri, list);
  }

  return articles.map((article) => {
    const recommenders = (byDoc.get(article.uri) ?? []).filter(
      (r) => r.did !== article.did,
    );
    return recommenders.length > 0
      ? { ...article, recommendedBy: recommenders }
      : article;
  });
}

/**
 * Flag the cards the requesting reader has recommended themselves, so document
 * items across the app can show the "Recommended by you" indicator. One batched,
 * index-served query (rides the `(recommender_did, document_uri)` composite
 * index) sets `viewerHasRecommended: true` on matching cards; the rest keep the
 * `false` default from {@link toArticleCard}.
 *
 * A no-op (no query) for signed-out readers (`viewerDid` null/empty) and empty
 * card lists — those keep `viewerHasRecommended: false`. Unlike
 * {@link attachRecommendedByToArticles}, this is the viewer's *own* recommend
 * state, so it is independent of who they follow and never excludes self.
 */
export async function attachViewerRecommendedToArticles<
  T extends Pick<ArticleCard, "uri" | "viewerHasRecommended">,
>(
  dbClient: typeof db,
  schemaModule: typeof schema,
  viewerDid: string | null | undefined,
  articles: Array<T>,
): Promise<Array<T>> {
  if (!viewerDid || articles.length === 0) {
    return articles;
  }

  const uris = [...new Set(articles.map((article) => article.uri))];
  const rec = schemaModule.recommends;

  const rows = await dbClient
    .select({ documentUri: rec.documentUri })
    .from(rec)
    .where(
      and(
        inArray(rec.documentUri, uris),
        eq(rec.recommenderDid, viewerDid),
        eq(rec.deleted, false),
      ),
    );

  if (rows.length === 0) {
    return articles;
  }

  const recommended = new Set(rows.map((row) => row.documentUri));
  return articles.map((article) =>
    recommended.has(article.uri)
      ? { ...article, viewerHasRecommended: true }
      : article,
  );
}

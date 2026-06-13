import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";

import {
  articleCardColumns,
  toArticleCard,
} from "#/integrations/tanstack-query/api-shapes";
import {
  followedByPeopleYouFollow,
  recommendedPublications,
  selectArticleCards,
  trendingPublicationUris,
} from "#/server/reader/queries";
import { effectiveFollowUris } from "#/server/reader/saved-lists";
import { and, desc, eq, sql } from "drizzle-orm";

import type { XrpcRequestContext } from "../types";

import { resolveSubjectDid } from "../auth";
import { nextCursor } from "../db";
import { AuthRequiredError } from "../errors";
import { intParam, optionalParam, requireParam } from "../params";
import { toDocumentView, toPublicationView } from "../views";
import {
  enrichDocuments,
  homeScopeFromParam,
  paginationFromCursor,
} from "./_helpers";

const HOME_ROW_LIMIT = 8;

export async function handleGetHomeFeed(ctx: XrpcRequestContext) {
  if (!ctx.auth) {
    throw new AuthRequiredError("Authentication required");
  }

  const scope = homeScopeFromParam(optionalParam(ctx.params, "scope"));
  const did = ctx.auth.did;
  const trackReading = ctx.trackReadingEnabled;
  const followUris = await effectiveFollowUris(ctx.db, ctx.schema, did);
  const hasFollows = followUris.length > 0;
  const personalized = hasFollows && scope === "follows";

  const rowQuery = personalized
    ? {
        publicationUris: followUris,
        ...(trackReading ? { readForDid: did, unreadForDid: did } : {}),
      }
    : { discoverOnly: true as const };

  const [featuredLead, rows] = await Promise.all([
    selectArticleCards(ctx.db, ctx.schema, {
      ...rowQuery,
      featuredOnly: true,
      limit: 1,
    }),
    selectArticleCards(ctx.db, ctx.schema, {
      ...rowQuery,
      limit: HOME_ROW_LIMIT + 1,
    }),
  ]);

  let featured: ArticleCard | null = featuredLead[0] ?? rows[0] ?? null;
  let latest = rows
    .filter((row) => row.uri !== featured?.uri)
    .slice(0, HOME_ROW_LIMIT);

  if (!trackReading || !personalized) {
    featured = featured ? { ...featured, isRead: true } : null;
    latest = latest.map((row) => ({ ...row, isRead: true }));
  }

  const enriched = await enrichDocuments(
    ctx,
    [...(featured ? [featured] : []), ...latest],
    trackReading ? did : undefined,
  );
  const byUri = new Map(enriched.map((article) => [article.uri, article]));

  return {
    scope: scope === "follows" ? "subscriptions" : "all",
    featured: featured
      ? toDocumentView(byUri.get(featured.uri) ?? featured)
      : undefined,
    latest: latest.map((article) =>
      toDocumentView(byUri.get(article.uri) ?? article),
    ),
  };
}

export async function handleGetRecommendedPublications(
  ctx: XrpcRequestContext,
) {
  if (!ctx.auth) {
    throw new AuthRequiredError("Authentication required");
  }

  const limit = intParam(ctx.params, "limit", 12, { min: 1, max: 100 });
  const did = ctx.auth.did;
  const followUris = await effectiveFollowUris(ctx.db, ctx.schema, did);
  const trendingExclude = await trendingPublicationUris(
    ctx.db,
    ctx.schema,
    limit,
  );
  const items = await recommendedPublications(ctx.db, ctx.schema, did, limit, {
    excludeUris: trendingExclude,
    followUris,
  });
  return { items: items.map((item) => toPublicationView(item)) };
}

export async function handleGetFollowedByPeopleYouFollow(
  ctx: XrpcRequestContext,
) {
  if (!ctx.auth) {
    throw new AuthRequiredError("Authentication required");
  }

  const limit = intParam(ctx.params, "limit", 12, { min: 1, max: 100 });
  const did = ctx.auth.did;
  const followUris = await effectiveFollowUris(ctx.db, ctx.schema, did);
  const trendingExclude = await trendingPublicationUris(
    ctx.db,
    ctx.schema,
    limit,
  );
  const items = await followedByPeopleYouFollow(
    ctx.db,
    ctx.schema,
    did,
    limit,
    {
      excludeUris: trendingExclude,
      followUris,
    },
  );
  return { items: items.map((item) => toPublicationView(item)) };
}

function subjectDid(ctx: XrpcRequestContext): string | null {
  try {
    return resolveSubjectDid({
      didParam: optionalParam(ctx.params, "did"),
      auth: ctx.auth,
      authRequired: false,
      allowDidParam: true,
    });
  } catch {
    return null;
  }
}

export async function handleGetFollowStatus(ctx: XrpcRequestContext) {
  const publicationUri = requireParam(ctx.params, "publication");
  const did = subjectDid(ctx);
  if (!did) return { active: false };

  const sub = ctx.schema.subscriptions;
  const [row] = await ctx.db
    .select({ uri: sub.uri })
    .from(sub)
    .where(
      and(
        eq(sub.subscriberDid, did),
        eq(sub.publicationUri, publicationUri),
        eq(sub.deleted, false),
      ),
    )
    .limit(1);

  return { active: Boolean(row) };
}

export async function handleGetReadStatus(ctx: XrpcRequestContext) {
  const documentUri = requireParam(ctx.params, "document");
  const did = subjectDid(ctx);
  if (!did || !ctx.trackReadingEnabled) {
    return { active: did != null && !ctx.trackReadingEnabled };
  }

  const r = ctx.schema.reads;
  const [row] = await ctx.db
    .select({ uri: r.uri })
    .from(r)
    .where(
      and(
        eq(r.ownerDid, did),
        eq(r.documentUri, documentUri),
        eq(r.deleted, false),
      ),
    )
    .limit(1);

  return { active: Boolean(row) };
}

export async function handleGetBookmarkStatus(ctx: XrpcRequestContext) {
  const documentUri = requireParam(ctx.params, "document");
  const did = subjectDid(ctx);
  if (!did) return { active: false };

  const b = ctx.schema.bookmarks;
  const [row] = await ctx.db
    .select({ uri: b.uri })
    .from(b)
    .where(
      and(
        eq(b.ownerDid, did),
        eq(b.documentUri, documentUri),
        eq(b.deleted, false),
      ),
    )
    .limit(1);

  return { active: Boolean(row) };
}

export async function handleGetRecommendStatus(ctx: XrpcRequestContext) {
  const documentUri = requireParam(ctx.params, "document");
  const did = subjectDid(ctx);
  if (!did) return { active: false };

  const rec = ctx.schema.recommends;
  const [row] = await ctx.db
    .select({ uri: rec.uri })
    .from(rec)
    .where(
      and(
        eq(rec.recommenderDid, did),
        eq(rec.documentUri, documentUri),
        eq(rec.deleted, false),
      ),
    )
    .limit(1);

  return { active: Boolean(row) };
}

async function loadReaderDocumentQueue(
  ctx: XrpcRequestContext,
  collection: "bookmarks" | "reads" | "recommends",
) {
  const did = subjectDid(ctx);
  const { offset, limit } = paginationFromCursor(ctx.params, 20, 100);
  if (!did) {
    return { cursor: null, items: [] };
  }

  const cols = articleCardColumns(ctx.schema);
  const d = ctx.schema.documents;
  const p = ctx.schema.publications;
  const pr = ctx.schema.profiles;

  if (collection === "bookmarks") {
    const b = ctx.schema.bookmarks;
    const where = and(eq(b.ownerDid, did), eq(b.deleted, false));
    const [countRow, rows] = await Promise.all([
      ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(b)
        .where(where),
      ctx.db
        .select({ ...cols })
        .from(b)
        .innerJoin(d, eq(d.uri, b.documentUri))
        .leftJoin(p, eq(p.uri, d.publicationUri))
        .leftJoin(pr, eq(pr.did, p.did))
        .where(where)
        .orderBy(desc(b.createdAt))
        .limit(limit)
        .offset(offset),
    ]);
    const total = countRow[0]?.count ?? 0;
    const cards = rows
      .map((row) => toArticleCard(row))
      .filter((card): card is NonNullable<typeof card> => card != null);
    const items = await enrichDocuments(ctx, cards);
    return {
      cursor: nextCursor(offset, limit, total),
      items: items.map((item) => toDocumentView(item)),
    };
  }

  if (collection === "reads") {
    const r = ctx.schema.reads;
    const where = and(eq(r.ownerDid, did), eq(r.deleted, false));
    const [countRow, rows] = await Promise.all([
      ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(r)
        .where(where),
      ctx.db
        .select({ ...cols })
        .from(r)
        .innerJoin(d, eq(d.uri, r.documentUri))
        .leftJoin(p, eq(p.uri, d.publicationUri))
        .leftJoin(pr, eq(pr.did, p.did))
        .where(where)
        .orderBy(desc(r.createdAt))
        .limit(limit)
        .offset(offset),
    ]);
    const total = countRow[0]?.count ?? 0;
    const cards = rows
      .map((row) => toArticleCard({ ...row, isRead: true }))
      .filter((card): card is NonNullable<typeof card> => card != null);
    const items = await enrichDocuments(ctx, cards);
    return {
      cursor: nextCursor(offset, limit, total),
      items: items.map((item) => toDocumentView(item)),
    };
  }

  const rec = ctx.schema.recommends;
  const where = and(eq(rec.recommenderDid, did), eq(rec.deleted, false));
  const [countRow, rows] = await Promise.all([
    ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(rec)
      .where(where),
    ctx.db
      .select({ ...cols })
      .from(rec)
      .innerJoin(d, eq(d.uri, rec.documentUri))
      .leftJoin(p, eq(p.uri, d.publicationUri))
      .leftJoin(pr, eq(pr.did, p.did))
      .where(where)
      .orderBy(desc(rec.createdAt))
      .limit(limit)
      .offset(offset),
  ]);
  const total = countRow[0]?.count ?? 0;
  const cards = rows
    .map((row) => toArticleCard(row))
    .filter((card): card is NonNullable<typeof card> => card != null);
  const items = await enrichDocuments(ctx, cards);
  return {
    cursor: nextCursor(offset, limit, total),
    items: items.map((item) => toDocumentView(item)),
  };
}

export async function handleGetSaved(ctx: XrpcRequestContext) {
  return loadReaderDocumentQueue(ctx, "bookmarks");
}

export async function handleGetReadingHistory(ctx: XrpcRequestContext) {
  return loadReaderDocumentQueue(ctx, "reads");
}

export async function handleGetLikes(ctx: XrpcRequestContext) {
  return loadReaderDocumentQueue(ctx, "recommends");
}

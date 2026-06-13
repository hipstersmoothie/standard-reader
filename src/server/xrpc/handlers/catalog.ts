import { searchApi } from "#/integrations/tanstack-query/api-search.functions";
import { fetchBlueskyPublicProfileFields } from "#/lib/bluesky-public-profile";
import { resolveIdentity } from "#/server/atproto/identity";
import { resolveAuthorDid } from "#/server/atproto/resolve-author-ref";
import {
  resolvePageUrl,
  resolvePageUrls,
} from "#/server/extension/resolve-page-url.server";
import { selectPublicationHeader } from "#/server/reader/publication-header";
import {
  discoverDirectoryPublications,
  selectArticleCardsByUris,
} from "#/server/reader/queries";
import { and, eq } from "drizzle-orm";

import type { XrpcRequestContext } from "../types";

import { encodeCursor } from "../db";
import { InvalidRequestError } from "../errors";
import { optionalParam, requireParam } from "../params";
import { toDocumentView, toProfileView, toPublicationView } from "../views";
import {
  authSessionFromContext,
  directorySortFromParam,
  enrichDocuments,
  mapPublicationPage,
  paginationFromCursor,
} from "./_helpers";

function formatResolveView(result: Awaited<ReturnType<typeof resolvePageUrl>>) {
  switch (result.kind) {
    case "article": {
      return {
        $type: "app.standard-reader.defs#resolveViewArticle" as const,
        ...result,
      };
    }
    case "publication": {
      return {
        $type: "app.standard-reader.defs#resolveViewPublication" as const,
        ...result,
      };
    }
    case "reader-link": {
      return {
        $type: "app.standard-reader.defs#resolveViewReaderLink" as const,
        ...result,
      };
    }
    default: {
      return {
        $type: "app.standard-reader.defs#resolveViewUnknown" as const,
        kind: "unknown" as const,
      };
    }
  }
}

export async function handleResolveUrl(ctx: XrpcRequestContext) {
  const url = optionalParam(ctx.params, "url");
  const urlsParam = optionalParam(ctx.params, "urls");
  const session = authSessionFromContext(ctx.auth);

  if (urlsParam) {
    const urls = urlsParam
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      throw new InvalidRequestError("urls must not be empty");
    }
    const resultsByUrl = await resolvePageUrls(
      ctx.db,
      ctx.schema,
      urls,
      session,
    );
    return {
      results: Object.fromEntries(
        Object.entries(resultsByUrl).map(([key, value]) => [
          key,
          formatResolveView(value),
        ]),
      ),
    };
  }

  if (!url) {
    throw new InvalidRequestError("url or urls parameter required");
  }

  const result = await resolvePageUrl(ctx.db, ctx.schema, url, session);
  return formatResolveView(result);
}

export async function handleResolveHandle(ctx: XrpcRequestContext) {
  const handle = requireParam(ctx.params, "handle");
  const result = await searchApi.resolvePublicationByHandle({
    data: { handle },
  });
  return {
    did: result.did,
    handle: result.handle,
    source: result.source,
    publications: result.publications.map((item) => toPublicationView(item)),
  };
}

export async function handleSearchPublications(ctx: XrpcRequestContext) {
  const q = requireParam(ctx.params, "q");
  const { offset, limit } = paginationFromCursor(ctx.params, 20, 50);
  const page = await searchApi.searchPublications({
    data: { q, limit, offset },
  });
  return {
    query: page.query,
    cursor: page.nextOffset == null ? null : encodeCursor(page.nextOffset),
    items: page.items.map((item) => toPublicationView(item)),
  };
}

export async function handleSearchDocuments(ctx: XrpcRequestContext) {
  const q = requireParam(ctx.params, "q");
  const { offset, limit } = paginationFromCursor(ctx.params, 20, 50);
  const page = await searchApi.searchArticles({ data: { q, limit, offset } });
  const items = await enrichDocuments(ctx, page.items);
  return {
    query: page.query,
    cursor: page.nextOffset == null ? null : encodeCursor(page.nextOffset),
    items: items.map((item) => toDocumentView(item)),
  };
}

export async function handleGetPublication(ctx: XrpcRequestContext) {
  const publicationUri = requireParam(ctx.params, "publication");
  const header = await selectPublicationHeader(
    ctx.db,
    ctx.schema,
    publicationUri,
  );
  if (!header) {
    throw new InvalidRequestError("Publication not found");
  }
  return {
    publication: toPublicationView(header.publication),
    owner: toProfileView(header.owner),
    subscriberCount: header.publication.subscriberCount,
    documentCount: header.publication.documentCount,
    lastDocumentAt: header.publication.lastDocumentAt,
  };
}

export async function handleGetDocument(ctx: XrpcRequestContext) {
  const documentUri = requireParam(ctx.params, "document");
  const readForDid =
    ctx.auth && ctx.trackReadingEnabled ? ctx.auth.did : undefined;
  const cards = await selectArticleCardsByUris(ctx.db, ctx.schema, [
    documentUri,
  ]);
  let card = cards[0];
  if (!card) {
    throw new InvalidRequestError("Document not found");
  }

  if (readForDid) {
    const r = ctx.schema.reads;
    const [readRow] = await ctx.db
      .select({ uri: r.uri })
      .from(r)
      .where(
        and(
          eq(r.ownerDid, readForDid),
          eq(r.documentUri, documentUri),
          eq(r.deleted, false),
        ),
      )
      .limit(1);
    card = { ...card, isRead: Boolean(readRow) };
  }

  const [enriched] = await enrichDocuments(ctx, [card], readForDid);
  return toDocumentView(enriched ?? card);
}

export async function handleGetPublications(ctx: XrpcRequestContext) {
  const topic = optionalParam(ctx.params, "topic");
  const sort = directorySortFromParam(optionalParam(ctx.params, "sort"));
  const q = optionalParam(ctx.params, "q");
  const { offset, limit } = paginationFromCursor(ctx.params, 24, 60);

  const items = await discoverDirectoryPublications(ctx.db, ctx.schema, {
    topic: topic ?? undefined,
    sort,
    limit,
    offset,
    query: q ?? undefined,
  });

  const total =
    items.length < limit ? offset + items.length : offset + limit + 1;
  return mapPublicationPage(items, offset, limit, total);
}

async function resolveAuthorProfileSummary(
  ctx: XrpcRequestContext,
  did: string,
) {
  const pr = ctx.schema.profiles;
  const [row] = await ctx.db
    .select({
      did: pr.did,
      handle: pr.handle,
      displayName: pr.displayName,
      description: pr.description,
      avatarUrl: pr.avatarUrl,
      bannerUrl: pr.bannerUrl,
    })
    .from(pr)
    .where(eq(pr.did, did))
    .limit(1);

  if (row) {
    const [identity, publicProfile] = await Promise.all([
      row.handle ? Promise.resolve(null) : resolveIdentity(did as never),
      !row.displayName || !row.avatarUrl
        ? fetchBlueskyPublicProfileFields(did)
        : Promise.resolve(null),
    ]);
    return {
      did: row.did,
      handle: row.handle ?? identity?.handle ?? publicProfile?.handle ?? null,
      displayName: row.displayName ?? publicProfile?.displayName ?? null,
      description: row.description,
      avatarUrl: row.avatarUrl ?? publicProfile?.avatarUrl ?? null,
      bannerUrl: row.bannerUrl,
    };
  }

  const [identity, publicProfile] = await Promise.all([
    resolveIdentity(did as never),
    fetchBlueskyPublicProfileFields(did),
  ]);
  return {
    did,
    handle: identity.handle ?? publicProfile?.handle ?? null,
    displayName: publicProfile?.displayName ?? null,
    description: null,
    avatarUrl: publicProfile?.avatarUrl ?? null,
    bannerUrl: null,
  };
}

export async function handleGetAuthor(ctx: XrpcRequestContext) {
  const did = requireParam(ctx.params, "did");
  const resolvedDid = await resolveAuthorDid(ctx.db, ctx.schema, did);
  const [profile, stats] = await Promise.all([
    resolveAuthorProfileSummary(ctx, resolvedDid),
    import("#/server/reader/queries").then(({ authorProfileStats }) =>
      authorProfileStats(ctx.db, ctx.schema, resolvedDid),
    ),
  ]);

  return {
    profile: toProfileView(profile),
    stats: {
      publicationCount: stats.publicationCount,
      documentCount: stats.documentCount,
      subscriberCount: stats.subscriberCount,
      followingCount: stats.subscriptionCount,
      likeCount: stats.recommendationCount,
    },
  };
}

export async function handleGetAuthorPublications(ctx: XrpcRequestContext) {
  const did = requireParam(ctx.params, "did");
  const resolvedDid = await resolveAuthorDid(ctx.db, ctx.schema, did);
  const { offset, limit } = paginationFromCursor(ctx.params, 20, 50);
  const { authorPublications } = await import("#/server/reader/queries");
  const items = await authorPublications(ctx.db, ctx.schema, {
    did: resolvedDid,
    limit,
    offset,
  });
  const total =
    items.length < limit ? offset + items.length : offset + limit + 1;
  return mapPublicationPage(items, offset, limit, total);
}

export async function handleGetDocumentContext(ctx: XrpcRequestContext) {
  const documentUri = requireParam(ctx.params, "document");
  const d = ctx.schema.documents;
  const [row] = await ctx.db
    .select({
      uri: d.uri,
      publicationUri: d.publicationUri,
    })
    .from(d)
    .where(eq(d.uri, documentUri))
    .limit(1);

  if (!row) {
    return { moreFrom: [], related: [], readersAlsoFollow: [] };
  }

  const {
    relatedArticles,
    articleRecommendedPublications,
    selectArticleCards: selectCards,
  } = await import("#/server/reader/queries");

  const readerDid = ctx.auth?.did;
  const [moreFromRaw, relatedRaw, readersAlsoFollowRaw] = await Promise.all([
    row.publicationUri
      ? selectCards(ctx.db, ctx.schema, {
          publicationUris: [row.publicationUri],
          limit: 4,
        })
      : Promise.resolve([]),
    relatedArticles(ctx.db, ctx.schema, {
      documentUri: row.uri,
      publicationUri: row.publicationUri,
      limit: 6,
    }),
    articleRecommendedPublications(ctx.db, ctx.schema, {
      publicationUri: row.publicationUri,
      readerDid,
      limit: 6,
    }),
  ]);

  const moreFrom = moreFromRaw.filter((doc) => doc.uri !== row.uri).slice(0, 3);
  const [moreFromEnriched, relatedEnriched] = await Promise.all([
    enrichDocuments(ctx, moreFrom),
    enrichDocuments(ctx, relatedRaw),
  ]);

  return {
    moreFrom: moreFromEnriched.map((item) => toDocumentView(item)),
    related: relatedEnriched.map((item) => toDocumentView(item)),
    readersAlsoFollow: readersAlsoFollowRaw.map((item) =>
      toPublicationView(item),
    ),
  };
}

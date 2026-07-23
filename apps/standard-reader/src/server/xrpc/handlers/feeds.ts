import { TRENDING_PAGE_LIMIT } from "#/integrations/tanstack-query/api-feed.functions";
import { articleCardsAsAllRead } from "#/lib/track-reading-history";
import { resolveAuthorDid } from "#/server/atproto/resolve-author-ref";
import { parseAtUri } from "#/server/atproto/uri";
import {
  followedPublications,
  selectArticleCards,
  tagDirectoryPublications,
  trendingArticles,
  trendingPublications,
} from "#/server/reader/queries";
import { effectiveFollowUris, readList } from "#/server/reader/saved-lists";
import { loadOwnSubscriptionLists } from "#/server/reader/shell-snapshot.server";

import { nextCursor } from "../db";
import { InvalidRequestError } from "../errors";
import { intParam, optionalParam, requireParam } from "../params";
import type { XrpcRequestContext } from "../types";
import { toDocumentView, toPublicationView } from "../views";
import {
  enrichDocuments,
  latestFilterFromParam,
  paginationFromCursor,
  tagSortFromParam,
  trendingScopeFromParam,
} from "./_helpers";

export async function handleGetLatestFeed(ctx: XrpcRequestContext) {
  const filter = latestFilterFromParam(optionalParam(ctx.params, "filter"));
  const { offset, limit } = paginationFromCursor(ctx.params, 20, 50);
  const subjectDid = optionalParam(ctx.params, "did") ?? ctx.auth?.did;
  const trackReading = subjectDid == null ? false : ctx.trackReadingEnabled;
  const countOldPostsAsUnread =
    subjectDid == null ? true : ctx.countOldPostsAsUnreadEnabled;
  const followUris = subjectDid
    ? await effectiveFollowUris(ctx.db, ctx.schema, subjectDid)
    : [];

  const trendingLimit =
    filter === "trending"
      ? Math.min(limit, TRENDING_PAGE_LIMIT - offset)
      : limit;

  const items =
    filter === "trending"
      ? trendingLimit > 0
        ? await trendingArticles(ctx.db, ctx.schema, trendingLimit, {
            offset,
            readForDid: trackReading && subjectDid ? subjectDid : undefined,
            scope: "page",
          })
        : []
      : await selectArticleCards(ctx.db, ctx.schema, {
          ...(!subjectDid || filter === "all"
            ? { discoverOnly: true }
            : {
                publicationUris: followUris,
                unreadForDid:
                  trackReading && filter === "unread" ? subjectDid : undefined,
              }),
          readForDid: trackReading && subjectDid ? subjectDid : undefined,
          countOldPostsAsUnread,
          limit,
          offset,
        });

  const enriched = await enrichDocuments(
    ctx,
    trackReading ? items : articleCardsAsAllRead(items),
    trackReading && subjectDid ? subjectDid : undefined,
  );

  const cursor =
    filter === "trending"
      ? null
      : items.length === limit
        ? nextCursor(offset, limit, offset + limit + 1)
        : null;

  return {
    cursor,
    items: enriched.map((item) => toDocumentView(item)),
  };
}

export async function handleGetTrendingPublications(ctx: XrpcRequestContext) {
  const limit = intParam(ctx.params, "limit", 12, { min: 1, max: 100 });
  const items = await trendingPublications(ctx.db, ctx.schema, limit);
  return { items: items.map((item) => toPublicationView(item)) };
}

export async function handleGetTrendingDocuments(ctx: XrpcRequestContext) {
  const limit = intParam(ctx.params, "limit", 12, { min: 1, max: 100 });
  const scope = trendingScopeFromParam(optionalParam(ctx.params, "scope"));
  const readForDid =
    ctx.auth && ctx.trackReadingEnabled ? ctx.auth.did : undefined;
  const items = await trendingArticles(ctx.db, ctx.schema, limit, {
    scope,
    readForDid,
  });
  const enriched = await enrichDocuments(ctx, items, readForDid);
  return { items: enriched.map((item) => toDocumentView(item)) };
}

export async function handleGetTagFeed(ctx: XrpcRequestContext) {
  const tag = requireParam(ctx.params, "tag");
  const view = optionalParam(ctx.params, "view") ?? "articles";
  const { offset, limit } = paginationFromCursor(ctx.params, 20, 50);

  if (view === "publications") {
    const sort = tagSortFromParam(optionalParam(ctx.params, "sort"));
    const items = await tagDirectoryPublications(ctx.db, ctx.schema, {
      tag,
      sort,
      limit,
      offset,
    });
    return {
      view: "publications" as const,
      cursor:
        items.length === limit
          ? nextCursor(offset, limit, offset + limit + 1)
          : null,
      items: items.map((item) => toPublicationView(item)),
    };
  }

  const readForDid =
    ctx.auth && ctx.trackReadingEnabled ? ctx.auth.did : undefined;
  const rows = await selectArticleCards(ctx.db, ctx.schema, {
    tag,
    discoverOnly: true,
    limit,
    offset,
    readForDid,
    countOldPostsAsUnread: ctx.auth ? ctx.countOldPostsAsUnreadEnabled : true,
  });
  const items = await enrichDocuments(ctx, rows, readForDid);
  return {
    view: "articles" as const,
    cursor:
      items.length === limit
        ? nextCursor(offset, limit, offset + limit + 1)
        : null,
    items: items.map((item) => toDocumentView(item)),
  };
}

export async function handleGetList(ctx: XrpcRequestContext) {
  const listUri = requireParam(ctx.params, "list");
  const parsed = parseAtUri(listUri);
  if (!parsed) {
    throw new InvalidRequestError("Invalid list AT-URI");
  }

  const list = await readList(ctx.db, parsed.did, parsed.rkey);
  if (!list) {
    throw new InvalidRequestError("List not found");
  }

  const publications = await followedPublications(
    ctx.db,
    ctx.schema,
    list.publications,
  );
  const byUri = new Map(publications.map((pub) => [pub.uri, pub]));
  const ordered = list.publications
    .map((uri) => byUri.get(uri))
    .filter((pub): pub is NonNullable<typeof pub> => pub != null);

  return {
    uri: listUri,
    name: list.name,
    description: list.description ?? null,
    publications: ordered.map((item) => toPublicationView(item)),
  };
}

export async function handleGetUserLists(ctx: XrpcRequestContext) {
  const did = requireParam(ctx.params, "did");
  const resolvedDid = await resolveAuthorDid(ctx.db, ctx.schema, did);

  const lists = await loadOwnSubscriptionLists(null, resolvedDid);
  if (lists.length === 0) {
    return { lists: [] };
  }

  // Resolve every member publication across all lists in one batched query,
  // then rebuild each list preserving its curated order.
  const allUris = [...new Set(lists.flatMap((list) => list.publications))];
  const cards = await followedPublications(ctx.db, ctx.schema, allUris);
  const viewByUri = new Map(
    cards.map((card) => [card.uri, toPublicationView(card)]),
  );

  return {
    lists: lists.map((list) => ({
      uri: list.uri,
      name: list.name,
      description: list.description ?? null,
      createdAt: list.createdAt ?? null,
      publications: list.publications
        .map((uri) => viewByUri.get(uri))
        .filter((view): view is NonNullable<typeof view> => view != null),
    })),
  };
}

export async function handleGetListFeed(ctx: XrpcRequestContext) {
  const listUri = requireParam(ctx.params, "list");
  const parsed = parseAtUri(listUri);
  if (!parsed) {
    throw new InvalidRequestError("Invalid list AT-URI");
  }
  const { offset, limit } = paginationFromCursor(ctx.params, 20, 50);

  const list = await readList(ctx.db, parsed.did, parsed.rkey);
  if (!list || list.publications.length === 0) {
    return { cursor: null, items: [] };
  }

  const readForDid =
    ctx.auth && ctx.trackReadingEnabled ? ctx.auth.did : undefined;
  const items = await selectArticleCards(ctx.db, ctx.schema, {
    publicationUris: list.publications,
    readForDid,
    countOldPostsAsUnread: ctx.auth ? ctx.countOldPostsAsUnreadEnabled : true,
    limit,
    offset,
  });
  const enriched = await enrichDocuments(ctx, items, readForDid);
  return {
    cursor:
      items.length === limit
        ? nextCursor(offset, limit, offset + limit + 1)
        : null,
    items: enriched.map((item) => toDocumentView(item)),
  };
}

import type { PublicationRecord } from "#/server/atproto/types";

import { isDid } from "@atcute/lexicons/syntax";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { STANDARD_NSID } from "#/lib/atproto/nsids";
import { withoutExcludedPublications } from "#/lib/publication/exclusions";
import { blobCid, getBlobUrl } from "#/server/atproto/blob";
import { resolveIdentity } from "#/server/atproto/identity";
import { ensureTracked } from "#/server/ingest/tap-client";
import { observe } from "#/server/observability/log";
import { attachCommentCountsToArticles } from "#/server/reader/document-comments";
import {
  discoverEligiblePublicationWhere,
  notExcludedPublicationArticleWhere,
} from "#/server/reader/publication-filters";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { ArticleCard, Db, PublicationCard, Schema } from "./api-shapes";

import {
  articleCardColumns,
  publicationCardColumns,
  toArticleCard,
  toPublicationCard,
} from "./api-shapes";
import { dbMiddleware } from "./db-middleware";

/**
 * Search (`APP_VISION.md` §5): full-text search over the read-model's GIN
 * `tsvector` columns (title, description, and body text derived from record
 * `textContent` plus structured content blocks), split into Publications and
 * Articles. Plus handle resolution for the Add/Follow modal — an AT Proto
 * handle/domain → publication preview, resolved from the read-model first
 * and falling back to the author's PDS (kicking off tap tracking) for
 * publications we haven't indexed yet.
 */

const PUBLIC_APPVIEW = "https://public.api.bsky.app";
const RESOLVE_TIMEOUT_MS = 5000;

const searchPageInput = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
});

const resolveInput = z.object({
  handle: z.string().trim().min(1).max(253),
});

export interface SearchPublicationsPage {
  query: string;
  items: Array<PublicationCard>;
  total: number;
  nextOffset: number | null;
}

export interface SearchArticlesPage {
  query: string;
  items: Array<ArticleCard>;
  total: number;
  nextOffset: number | null;
}

export interface ResolvedPublicationPreview {
  did: string | null;
  handle: string | null;
  publications: Array<PublicationCard>;
  /** Where the previews came from: the read-model, the author's repo, or none. */
  source: "index" | "repo" | "none";
}

const searchPublications = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(searchPageInput)
  .handler(
    observe("search.publications", async ({ data, context }, span) => {
      const { db, schema } = context;
      span.set("q", data.q);
      span.set("offset", data.offset);

      const page = await searchIndexedPublications(
        db,
        schema,
        data.q,
        data.limit,
        data.offset,
      );

      let items = page.items;
      let total = page.total;

      if (data.offset === 0 && items.length === 0) {
        const hints = publicationQueryHints(data.q);
        if (hints.urlLike) {
          items = await indexedPublicationsByUrl(
            db,
            schema,
            hints.urlLike,
            data.limit,
          );
        }
        if (items.length === 0 && hints.handleLookup) {
          items = await resolvePublicationCards(db, schema, hints.handleLookup);
        }
        total = items.length;
      }

      span.set("total", total);
      span.set("count", items.length);
      const nextOffset =
        items.length > 0 && data.offset + items.length < total
          ? data.offset + items.length
          : null;

      return {
        query: data.q,
        items,
        total,
        nextOffset,
      } satisfies SearchPublicationsPage;
    }),
  );

const searchArticles = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(searchPageInput)
  .handler(
    observe("search.articles", async ({ data, context }, span) => {
      const { db, schema } = context;
      const d = schema.documents;
      const p = schema.publications;
      const pr = schema.profiles;
      span.set("q", data.q);
      span.set("offset", data.offset);

      const tsq = sql`websearch_to_tsquery('english', ${data.q})`;
      const articleWhere = and(
        eq(d.deleted, false),
        sql`${d.searchVector} @@ ${tsq}`,
        notExcludedPublicationArticleWhere(p),
      );

      const [countRow, articleRows] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(d)
          .leftJoin(p, eq(p.uri, d.publicationUri))
          .where(articleWhere),
        db
          .select(articleCardColumns(schema))
          .from(d)
          .leftJoin(p, eq(p.uri, d.publicationUri))
          .leftJoin(pr, eq(pr.did, p.did))
          .where(articleWhere)
          .orderBy(sql`ts_rank(${d.searchVector}, ${tsq}) desc`)
          .limit(data.limit)
          .offset(data.offset),
      ]);

      const total = countRow[0]?.count ?? 0;
      const items = await attachCommentCountsToArticles(
        db,
        schema,
        articleRows.map((row) => toArticleCard(row)),
      );
      span.set("total", total);
      span.set("count", items.length);

      const nextOffset =
        items.length > 0 && data.offset + items.length < total
          ? data.offset + items.length
          : null;

      return {
        query: data.q,
        items,
        total,
        nextOffset,
      } satisfies SearchArticlesPage;
    }),
  );

/** Indexed publication matches (FTS, URL, handle) with total count. */
async function searchIndexedPublications(
  db: Db,
  schema: Schema,
  q: string,
  limit: number,
  offset: number,
): Promise<{ items: Array<PublicationCard>; total: number }> {
  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;
  const hints = publicationQueryHints(q);
  const tsq = sql`websearch_to_tsquery('english', ${q})`;
  const pubWhere = and(
    discoverEligiblePublicationWhere(p),
    publicationMatchSql(p, pr, tsq, hints),
  );

  const [countRow, publicationQueryRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(p)
      .leftJoin(pr, eq(pr.did, p.did))
      .where(pubWhere),
    db
      .select(publicationCardColumns(schema))
      .from(p)
      .leftJoin(st, eq(st.publicationUri, p.uri))
      .leftJoin(pr, eq(pr.did, p.did))
      .where(pubWhere)
      .orderBy(desc(publicationRankSql(p, pr, tsq, hints)))
      .limit(limit)
      .offset(offset),
  ]);

  return {
    items: publicationQueryRows.map((row) => toPublicationCard(row)),
    total: countRow[0]?.count ?? 0,
  };
}

/** Normalize user input ("@alice.dev", "https://alice.dev/foo") to a handle. */
function normalizeHandle(input: string): string {
  let handle = input.trim();
  if (handle.startsWith("@")) {
    handle = handle.slice(1);
  }

  const greengale = handle.match(
    /(?:https?:\/\/)?greengale\.app\/([^/?#\s]+)/i,
  );
  if (greengale?.[1]) {
    return greengale[1].toLowerCase();
  }

  handle = handle.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return handle.toLowerCase();
}

interface PublicationQueryHints {
  likePattern: string;
  /** Narrower URL match for platform URLs (e.g. greengale.app/melodic.stream). */
  urlLike: string | null;
  /** Handle or DID to resolve when the read-model has no rows yet. */
  handleLookup: string | null;
}

function publicationQueryHints(input: string): PublicationQueryHints {
  const trimmed = input.trim();
  const likePattern = `%${trimmed}%`;

  const greengale = trimmed.match(
    /(?:https?:\/\/)?greengale\.app\/([^/?#\s]+)/i,
  );
  if (greengale?.[1]) {
    const slug = greengale[1].toLowerCase();
    return {
      likePattern: `%${slug}%`,
      urlLike: `%greengale.app/${slug}%`,
      handleLookup: slug,
    };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const path = trimmed.replace(/^https?:\/\//i, "").split(/[?#]/)[0] ?? "";
    return {
      likePattern,
      urlLike: path ? `%${path}%` : null,
      handleLookup: normalizeHandle(trimmed),
    };
  }

  return {
    likePattern,
    urlLike: null,
    handleLookup: normalizeHandle(trimmed),
  };
}

function publicationMatchSql(
  p: Schema["publications"],
  pr: Schema["profiles"],
  tsq: ReturnType<typeof sql>,
  hints: PublicationQueryHints,
) {
  const parts = [
    sql`${p.searchVector} @@ ${tsq}`,
    ilike(p.url, hints.likePattern),
    ilike(pr.handle, hints.likePattern),
  ];
  if (hints.urlLike) {
    parts.push(ilike(p.url, hints.urlLike));
  }
  if (parts.length === 0) return sql`false`;
  return or(...parts) ?? sql`false`;
}

function publicationRankSql(
  p: Schema["publications"],
  pr: Schema["profiles"],
  tsq: ReturnType<typeof sql>,
  hints: PublicationQueryHints,
) {
  return sql`greatest(
    case when ${p.searchVector} @@ ${tsq}
      then ts_rank(${p.searchVector}, ${tsq})::real
      else 0::real
    end,
    case when ${p.url} ilike ${hints.likePattern} then 0.2::real else 0::real end,
    case when ${pr.handle} ilike ${hints.likePattern} then 0.15::real else 0::real end${
      hints.urlLike
        ? sql`, case when ${p.url} ilike ${hints.urlLike} then 0.25::real else 0::real end`
        : sql``
    }
  )`;
}

/** Resolve publications from the index, or live from the author's repo. */
async function resolvePublicationCards(
  db: Db,
  schema: Schema,
  lookup: string,
): Promise<Array<PublicationCard>> {
  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;

  const did = await resolveToDid(lookup);
  if (!did) return [];

  const indexed = await db
    .select(publicationCardColumns(schema))
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(and(eq(p.did, did), eq(p.deleted, false)))
    .orderBy(sql`coalesce(${st.subscriberCount}, 0) desc`)
    .limit(20);

  if (indexed.length > 0) {
    return withoutExcludedPublications(
      indexed.map((row) => toPublicationCard(row)),
    );
  }

  void ensureTracked(did, "manual").catch(() => {});
  const identity = await resolveIdentity(did);
  if (!identity.pds) return [];

  const pubs = await listRepoPublications(identity.pds, did);
  return withoutExcludedPublications(
    pubs.map((pub) => ({
      ...pub,
      ownerHandle: identity.handle ?? pub.ownerHandle,
    })),
  );
}

/** Look up indexed publications by publication URL substring. */
async function indexedPublicationsByUrl(
  db: Db,
  schema: Schema,
  urlLike: string,
  limit: number,
): Promise<Array<PublicationCard>> {
  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;

  const rows = await db
    .select(publicationCardColumns(schema))
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(and(discoverEligiblePublicationWhere(p), ilike(p.url, urlLike)))
    .limit(limit);

  return rows.map((row) => toPublicationCard(row));
}

/** Resolve a handle (or pass through a DID) to a DID, or null on failure. */
async function resolveToDid(handle: string): Promise<string | null> {
  if (isDid(handle)) {
    return handle;
  }
  try {
    const url = new URL(
      "/xrpc/com.atproto.identity.resolveHandle",
      PUBLIC_APPVIEW,
    );
    url.searchParams.set("handle", handle);
    const res = await fetch(url, {
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { did?: string };
    return body.did && isDid(body.did) ? body.did : null;
  } catch {
    return null;
  }
}

/** List a repo's `site.standard.publication` records straight from its PDS. */
async function listRepoPublications(
  pds: string,
  did: string,
): Promise<Array<PublicationCard>> {
  try {
    const url = new URL("/xrpc/com.atproto.repo.listRecords", pds);
    url.searchParams.set("repo", did);
    url.searchParams.set("collection", STANDARD_NSID.publication);
    url.searchParams.set("limit", "20");
    const res = await fetch(url, {
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    });
    if (!res.ok) {
      return [];
    }
    const body = (await res.json()) as {
      records?: Array<{ uri: string; value: PublicationRecord }>;
    };
    return (body.records ?? []).map((entry) => {
      const record = entry.value;
      const cid = blobCid(record.icon);
      return {
        uri: entry.uri,
        did,
        name: record.name ?? "Untitled publication",
        url: record.url ?? "",
        description: record.description ?? null,
        iconUrl: cid ? getBlobUrl(pds, did, cid) : null,
        ownerAvatarUrl: null,
        ownerHandle: null,
        topic: null,
        verified: false,
        subscriberCount: 0,
        documentCount: 0,
        lastDocumentAt: null,
      } satisfies PublicationCard;
    });
  } catch {
    return [];
  }
}

const resolvePublicationByHandle = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(resolveInput)
  .handler(
    observe(
      "search.resolveHandle",
      async ({ data, context }, span): Promise<ResolvedPublicationPreview> => {
        const { db, schema } = context;
        const wasDid = isDid(data.handle.trim());
        const handle = wasDid ? null : normalizeHandle(data.handle);
        const lookup = wasDid ? data.handle.trim() : (handle ?? data.handle);
        span.set("input", lookup);

        const did = await resolveToDid(lookup);
        if (!did) {
          span.set("resolved", false);
          return { did: null, handle, publications: [], source: "none" };
        }
        span.set("did", did);

        const publications = await resolvePublicationCards(db, schema, lookup);
        if (publications.length > 0) {
          const indexed = await db
            .select({ one: sql`1` })
            .from(schema.publications)
            .where(
              and(
                eq(schema.publications.did, did),
                eq(schema.publications.deleted, false),
              ),
            )
            .limit(1);
          const identity = await resolveIdentity(did);
          span.set("source", indexed.length > 0 ? "index" : "repo");
          return {
            did,
            handle: handle ?? identity.handle,
            publications,
            source: indexed.length > 0 ? "index" : "repo",
          };
        }

        span.set("source", "none");
        return { did, handle, publications: [], source: "none" };
      },
    ),
  );

function searchPublicationsQueryOptions({
  q = "",
  limit = 20,
  offset = 0,
}: { q?: string; limit?: number; offset?: number } = {}) {
  const trimmed = q.trim();
  return queryOptions({
    queryKey: ["search", "publications", trimmed, limit, offset] as const,
    queryFn: async () =>
      searchPublications({ data: { q: trimmed, limit, offset } }),
    enabled: trimmed.length > 0,
  });
}

function searchArticlesInfiniteQueryOptions({
  q = "",
  limit = 20,
}: { q?: string; limit?: number } = {}) {
  const trimmed = q.trim();
  return infiniteQueryOptions({
    queryKey: ["search", "articles", trimmed, limit] as const,
    queryFn: async ({ pageParam }) =>
      searchArticles({
        data: { q: trimmed, limit, offset: pageParam },
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: trimmed.length > 0,
  });
}

function resolvePublicationByHandleQueryOptions(handle: string) {
  const trimmed = handle.trim();
  return queryOptions({
    queryKey: ["resolve", "publication", trimmed] as const,
    queryFn: async () =>
      resolvePublicationByHandle({ data: { handle: trimmed } }),
    enabled: trimmed.length > 0,
  });
}

export const searchApi = {
  searchPublications,
  searchArticles,
  searchPublicationsQueryOptions,
  searchArticlesInfiniteQueryOptions,
  resolvePublicationByHandle,
  resolvePublicationByHandleQueryOptions,
};

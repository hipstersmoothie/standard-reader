import { isDid } from "@atcute/lexicons/syntax";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { STANDARD_NSID } from "#/lib/atproto/nsids";
import { parseInternalRoute } from "#/lib/internal-route";
import { getPublicUrl } from "#/lib/public-url";
import { withoutExcludedPublications } from "#/lib/publication/exclusions";
import { blobCid, cdnImageUrl } from "#/server/atproto/blob";
import { listRepoRecords } from "#/server/atproto/fetch-record";
import { resolveIdentity } from "#/server/atproto/identity";
import type { PublicationRecord } from "#/server/atproto/types";
import { ensureTracked } from "#/server/ingest/tap-client";
import { observe } from "#/server/observability/log";
import { attachReaderSpanContext } from "#/server/observability/span-context.ts";
import { attachCommentCountsToArticles } from "#/server/reader/document-comments";
import {
  discoverEligiblePublicationWhere,
  notExcludedPublicationArticleWhere,
} from "#/server/reader/publication-filters";
import {
  documentSearchSnippetHeadline,
  documentSearchTitleHeadline,
  publicationSearchNameHeadline,
  publicationSearchSnippetHeadline,
} from "#/server/reader/search-headline";

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
  q: z.string().trim().min(1).max(512),
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
  nextOffset: number | null;
}

export interface ResolvedPublicationPreview {
  did: string | null;
  handle: string | null;
  publications: Array<PublicationCard>;
  /** Where the previews came from: the read-model, the author's repo, or none. */
  source: "index" | "repo" | "none";
  /**
   * Whether the resolved account has loose documents (no publication). Used by
   * the add-publication modal to show the account as a disabled row with a note
   * instead of a bare "no publications" empty state.
   */
  hasDocuments: boolean;
}

const searchPublications = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(searchPageInput)
  .handler(
    observe("search.publications", async ({ data, context }, span) => {
      const { db, schema } = context;
      span.set("q", data.q);
      span.set("offset", data.offset);
      await attachReaderSpanContext(span, getRequest());

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
  .validator(searchPageInput)
  .handler(
    observe("search.articles", async ({ data, context }, span) => {
      const { db, schema } = context;
      const d = schema.documents;
      const p = schema.publications;
      const pr = schema.profiles;
      const pa = alias(schema.profiles, "pa");
      span.set("q", data.q);
      span.set("offset", data.offset);
      await attachReaderSpanContext(span, getRequest());

      const tsq = sql`websearch_to_tsquery('english', ${data.q})`;
      const hints = documentQueryHints(data.q);
      // Resolve author/handle matches up front via a trigram-indexed profile
      // lookup, so the documents predicate stays single-table (index-served)
      // instead of OR-ing `ILIKE '%q%'` across the joined profiles tables — the
      // cross-table OR is what forced a full scan of `documents` on every query.
      const authorMatch = await resolveAuthorMatchesForQuery(
        db,
        schema,
        data.q,
        hints,
      );
      const matchClause = documentMatchSql(d, tsq, hints, authorMatch);
      const articleWhere = and(
        eq(d.deleted, false),
        matchClause,
        notExcludedPublicationArticleWhere(p),
      );

      // Page the bare document URIs (newest first) in an inner subquery, then
      // join back to the real tables in the outer query for the card columns and
      // the ts_headline snippets — so headline (and the recommend-count subquery)
      // run only for the `limit + 1` returned rows, not every matched document.
      // The inner subquery projects only `uri` on purpose: `articleCardColumns`
      // selects several columns that share an underlying name (`d.did`/`p.did`,
      // owner vs. author `handle`/`avatar_url`), which would collide as subquery
      // output columns. Fetching one extra row tells us whether a next page
      // exists without an exact count(*) over the whole match set.
      const page = db
        .select({ uri: d.uri })
        .from(d)
        .leftJoin(p, eq(p.uri, d.publicationUri))
        .where(articleWhere)
        .orderBy(desc(d.publishedAt), desc(d.uri))
        .limit(data.limit + 1)
        .offset(data.offset)
        .as("page");

      const pageRows = await db
        .select({
          ...articleCardColumns(schema),
          searchTitleHtml: documentSearchTitleHeadline(d.title, tsq),
          searchSnippetHtml: documentSearchSnippetHeadline(
            d.description,
            d.textContent,
            tsq,
          ),
          // Which of the document's tags the query actually hit — so the card can
          // show the matching tag (and mark it) even when it isn't a leading tag.
          // Mirrors the `search_vector` fold: english-lexize each tag and test it
          // against the same tsquery.
          matchedTags: sql<
            Array<string>
          >`coalesce(array(select t from unnest(${d.tags}) as t where to_tsvector('english', t) @@ ${tsq}), '{}')`,
        })
        .from(page)
        .innerJoin(d, eq(d.uri, page.uri))
        .leftJoin(p, eq(p.uri, d.publicationUri))
        .leftJoin(pr, eq(pr.did, p.did))
        .leftJoin(pa, eq(pa.did, d.did))
        .orderBy(desc(d.publishedAt), desc(d.uri));

      const hasMore = pageRows.length > data.limit;
      const articleRows = hasMore ? pageRows.slice(0, data.limit) : pageRows;

      const items = await attachCommentCountsToArticles(
        db,
        schema,
        articleRows.map((row) => toArticleCard(row)),
      );
      span.set("count", items.length);

      const nextOffset = hasMore ? data.offset + data.limit : null;

      return {
        query: data.q,
        items,
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
      .select({
        ...publicationCardColumns(schema),
        searchNameHtml: publicationSearchNameHeadline(p.name, tsq),
        searchSnippetHtml: publicationSearchSnippetHeadline(p.description, tsq),
      })
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

interface DocumentQueryHints {
  /** Exact document at-URI to match (an at:// URI or a Standard Reader URL). */
  uri: string | null;
  /** Canonical-URL substring match for a general (external) article URL. */
  canonicalLike: string | null;
  /** Author/publication-owner handle to also match (e.g. `alice.bsky.social`). */
  authorHandle: string | null;
  /** Author DID to match the document author directly. */
  authorDid: string | null;
}

const EMPTY_DOCUMENT_HINTS: DocumentQueryHints = {
  uri: null,
  canonicalLike: null,
  authorHandle: null,
  authorDid: null,
};

/** A bare handle/domain like `alice.bsky.social` (no scheme, no spaces). */
const BARE_HANDLE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

/**
 * Detect when an article query is a reference rather than free text. An
 * `at://…/site.standard.document/…` URI or a Standard Reader `/a/$did/$rkey`
 * URL resolves to an exact document at-URI; a profile URL, `@handle`, bare
 * handle, or DID resolves to an author match (additive — still runs FTS); any
 * other `http(s)` URL falls back to a canonical-URL substring match. Plain
 * text returns no hints (FTS only).
 */
function documentQueryHints(input: string): DocumentQueryHints {
  const trimmed = input.trim();

  if (isDid(trimmed)) {
    return { ...EMPTY_DOCUMENT_HINTS, authorDid: trimmed };
  }

  const route = parseInternalRoute(trimmed, getPublicUrl());
  if (route?.to === "/a/$did/$rkey") {
    return {
      ...EMPTY_DOCUMENT_HINTS,
      uri: `at://${route.params.did}/${STANDARD_NSID.document}/${route.params.rkey}`,
    };
  }
  if (route?.to === "/u/$did") {
    const ref = route.params.did;
    return isDid(ref)
      ? { ...EMPTY_DOCUMENT_HINTS, authorDid: ref }
      : { ...EMPTY_DOCUMENT_HINTS, authorHandle: ref.toLowerCase() };
  }

  if (trimmed.startsWith("@") || BARE_HANDLE.test(trimmed)) {
    return { ...EMPTY_DOCUMENT_HINTS, authorHandle: normalizeHandle(trimmed) };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    // Match on host + path so http/https and tracking params don't break it,
    // mirroring the publication URL hints above.
    const path = trimmed.replace(/^https?:\/\//i, "").split(/[?#]/)[0] ?? "";
    return {
      ...EMPTY_DOCUMENT_HINTS,
      canonicalLike: path ? `%${path}%` : null,
    };
  }

  return EMPTY_DOCUMENT_HINTS;
}

/** Cap on how many matching author profiles a single search resolves. */
const AUTHOR_MATCH_LIMIT = 50;
/** Trigram indexes need a full 3-char gram; shorter terms can't use the index. */
const AUTHOR_MATCH_MIN_LENGTH = 3;

/** Author DIDs (and their publications) whose handle/name matched the query. */
interface AuthorMatch {
  dids: Array<string>;
  pubUris: Array<string>;
}

const EMPTY_AUTHOR_MATCH: AuthorMatch = { dids: [], pubUris: [] };

/**
 * Decide the author term for an article query and resolve matching profiles.
 * Reference-style queries (exact at-URI, canonical URL, or DID) never match by
 * name. A bare `@handle`/handle hint matches that handle; a plain-text query of
 * at least {@link AUTHOR_MATCH_MIN_LENGTH} chars matches handles and display
 * names, so "alice" or "alice.bsky.social" still surfaces her documents (incl.
 * loose docs whose author has no publication row). Returns empty when there's
 * nothing to resolve — the caller then matches on the FTS vector alone.
 */
async function resolveAuthorMatchesForQuery(
  db: Db,
  schema: Schema,
  q: string,
  hints: DocumentQueryHints,
): Promise<AuthorMatch> {
  if (hints.uri || hints.canonicalLike || hints.authorDid) {
    return EMPTY_AUTHOR_MATCH;
  }
  const term = hints.authorHandle ?? q.trim();
  if (term.length < AUTHOR_MATCH_MIN_LENGTH) return EMPTY_AUTHOR_MATCH;
  return resolveAuthorMatches(db, schema, term);
}

/**
 * Trigram-indexed profile lookup → the matching author DIDs and the URIs of
 * any publications they own. Both feed single-table `IN (...)` predicates on
 * `documents` (`did` covers the author / loose-doc case; `publication_uri`
 * covers documents published under a matched author's publication), so the
 * planner can serve the whole article match with a BitmapOr over indexes
 * instead of scanning to evaluate a cross-table `ILIKE`. Capped at
 * {@link AUTHOR_MATCH_LIMIT} joined rows.
 */
async function resolveAuthorMatches(
  db: Db,
  schema: Schema,
  term: string,
): Promise<AuthorMatch> {
  const pr = schema.profiles;
  const p = schema.publications;
  const like = `%${term}%`;
  const rows = await db
    .select({ did: pr.did, pubUri: p.uri })
    .from(pr)
    .leftJoin(p, and(eq(p.did, pr.did), eq(p.deleted, false)))
    .where(or(ilike(pr.handle, like), ilike(pr.displayName, like)))
    .limit(AUTHOR_MATCH_LIMIT);

  const dids = [...new Set(rows.map((row) => row.did))];
  const pubUris = [
    ...new Set(
      rows.map((row) => row.pubUri).filter((uri): uri is string => uri != null),
    ),
  ];
  return { dids, pubUris };
}

/**
 * Build the article match clause from {@link documentQueryHints} and the
 * pre-resolved {@link AuthorMatch}: an exact record/URL reference matches alone,
 * otherwise the FTS vector is OR-ed with the matched author DIDs / publications
 * (and an explicit author DID hint) so "alice.bsky.social" surfaces her
 * articles alongside ordinary title/body hits. Every arm is a `documents`
 * column, so the OR stays index-servable.
 */
function documentMatchSql(
  d: Schema["documents"],
  tsq: ReturnType<typeof sql>,
  hints: DocumentQueryHints,
  authorMatch: AuthorMatch,
) {
  if (hints.uri) return eq(d.uri, hints.uri);
  if (hints.canonicalLike) return ilike(d.canonicalUrl, hints.canonicalLike);

  const parts = [sql`${d.searchVector} @@ ${tsq}`];
  if (authorMatch.dids.length > 0) {
    parts.push(inArray(d.did, authorMatch.dids));
  }
  if (authorMatch.pubUris.length > 0) {
    parts.push(inArray(d.publicationUri, authorMatch.pubUris));
  }
  if (hints.authorDid) {
    parts.push(eq(d.did, hints.authorDid));
  }
  return or(...parts) ?? sql`false`;
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
    ilike(pr.displayName, hints.likePattern),
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
    case when ${pr.handle} ilike ${hints.likePattern} then 0.15::real else 0::real end,
    case when ${pr.displayName} ilike ${hints.likePattern} then 0.15::real else 0::real end${
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

  // Search is a discovery surface — drop pubs that opted out of discovery. Base
  // "is this DID indexed?" on the unfiltered set so an author whose only pubs are
  // hidden returns empty here rather than falling through to the live repo (which
  // would resurface them).
  if (indexed.length > 0) {
    return withoutExcludedPublications(
      indexed
        .map((row) => toPublicationCard(row))
        .filter((card) => !card.hiddenFromDiscover),
    );
  }

  void ensureTracked(did, "manual").catch(() => {});
  const identity = await resolveIdentity(did);
  if (!identity.pds) return [];

  const pubs = await listRepoPublications(identity.pds, did);
  return withoutExcludedPublications(
    pubs
      .filter((pub) => !pub.hiddenFromDiscover)
      .map((pub) => ({
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

/** List a repo's `site.standard.publication` records (Slingshot first, PDS
 * fallback, migration retry) and map them to preview cards. Caps at 20 —
 * enough to populate the search dropdown without fanning out unbounded. */
async function listRepoPublications(
  pds: string,
  did: string,
): Promise<Array<PublicationCard>> {
  try {
    const { records } = await listRepoRecords(
      did,
      STANDARD_NSID.publication,
      pds,
      20,
    );
    return records.map((entry) => {
      const record = entry.value as unknown as PublicationRecord | undefined;
      if (!record) {
        return {
          uri: entry.uri,
          did,
          name: "Untitled publication",
          url: "",
          description: null,
          iconUrl: null,
          ownerAvatarUrl: null,
          ownerHandle: null,
          topic: null,
          verified: false,
          hiddenFromDiscover: false,
          subscriberCount: 0,
          documentCount: 0,
          lastDocumentAt: null,
        };
      }
      const cid = blobCid(record.icon);
      return {
        uri: entry.uri,
        did,
        name: record.name ?? "Untitled publication",
        url: record.url ?? "",
        description: record.description ?? null,
        iconUrl: cid ? cdnImageUrl(did, cid, "png") : null,
        ownerAvatarUrl: null,
        ownerHandle: null,
        topic: null,
        verified: false,
        hiddenFromDiscover: record.preferences?.showInDiscover === false,
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
  .validator(resolveInput)
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
          return {
            did: null,
            handle,
            publications: [],
            source: "none",
            hasDocuments: false,
          };
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
            hasDocuments: false,
          };
        }

        // No publications — check whether the account has loose documents so
        // the modal can show a disabled row instead of a bare empty note.
        const [docRow] = await db
          .select({ one: sql`1` })
          .from(schema.documents)
          .where(
            and(
              eq(schema.documents.did, did),
              eq(schema.documents.deleted, false),
              isNull(schema.documents.publicationUri),
            ),
          )
          .limit(1);
        const hasDocuments = docRow != null;
        span.set("hasDocuments", hasDocuments);

        span.set("source", "none");
        return { did, handle, publications: [], source: "none", hasDocuments };
      },
    ),
  );

/**
 * An account that has loose documents but no publications — surfaced in the
 * add-publication modal as a disabled row so searchers can see it exists even
 * though there's nothing to follow yet.
 */
export interface LooseDocAccount {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  documentCount: number;
}

const looseDocAccountsInput = z.object({
  q: z.string().trim().min(1).max(512),
  limit: z.number().int().min(1).max(10).default(5),
});

/** Profiles with loose documents whose handle/display name partially match `q`. */
const searchLooseDocAccounts = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(looseDocAccountsInput)
  .handler(
    observe("search.looseDocAccounts", async ({ data, context }, span) => {
      const { db, schema } = context;
      const pr = schema.profiles;
      const d = schema.documents;
      const like = `%${data.q}%`;
      span.set("q", data.q);

      const rows = await db
        .select({
          did: pr.did,
          handle: pr.handle,
          displayName: pr.displayName,
          avatarUrl: pr.avatarUrl,
          documentCount: sql<number>`count(${d.uri})::int`,
        })
        .from(pr)
        .innerJoin(d, eq(d.did, pr.did))
        .where(
          and(
            eq(d.deleted, false),
            isNull(d.publicationUri),
            or(ilike(pr.handle, like), ilike(pr.displayName, like)),
          ),
        )
        .groupBy(pr.did, pr.handle, pr.displayName, pr.avatarUrl)
        .limit(data.limit);

      span.set("count", rows.length);
      return rows;
    }),
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

function searchLooseDocAccountsQueryOptions({
  q = "",
  limit = 5,
}: { q?: string; limit?: number } = {}) {
  const trimmed = q.trim();
  return queryOptions({
    queryKey: ["search", "looseDocAccounts", trimmed, limit] as const,
    queryFn: async () =>
      searchLooseDocAccounts({ data: { q: trimmed, limit } }),
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
  searchLooseDocAccounts,
  searchLooseDocAccountsQueryOptions,
};

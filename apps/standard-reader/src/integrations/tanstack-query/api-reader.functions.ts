import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import {
  isResumableProgress,
  READING_PROGRESS_DONE,
  READING_PROGRESS_MIN,
} from "#/lib/reading-progress";
import {
  getAtprotoSessionForRequest,
  getReaderDidForRequest,
} from "#/middleware/auth-session.server";
import {
  deleteBookmarkRecord,
  deleteReadRecord,
  deleteRecommendRecord,
  putBookmarkRecord,
  putReadRecord,
  putRecommendRecord,
  putSubscriptionRecord,
  putUserFollowRecord,
  subjectRkey,
} from "#/server/atproto/repo-records";
import {
  backfillFollowedUserContent,
  upsertSubscription,
  upsertUserFollow,
} from "#/server/ingest/handlers";
import { ensureTracked } from "#/server/ingest/tap-client";
import { observe } from "#/server/observability/log";
import { syncFollowedPublications } from "#/server/reader/followed-publications-sync.server";
import { markDocumentsRead } from "#/server/reader/mark-documents-read";
import {
  mirrorBookmarkRemoved,
  mirrorBookmarkSaved,
  mirrorReadRemoved,
  mirrorReadsMarked,
  mirrorRecommendAdded,
  mirrorRecommendRemoved,
} from "#/server/reader/personal-state-mirror";
import type { SavedFacets } from "#/server/reader/queries";
import {
  selectSavedFacets,
  selectUnreadDocumentPage,
  selectUnreadDocumentUris,
} from "#/server/reader/queries";
import { attachViewerRecommendedToArticles } from "#/server/reader/recommended-by";
import { effectiveFollowSets } from "#/server/reader/saved-lists";
import {
  unfollowPublicationForSession,
  unfollowUserForSession,
} from "#/server/reader/unfollow-subject.server";

import type { ArticleCard, Schema } from "./api-shapes";
import {
  articleQueueCardColumns,
  publicationSortNameSql,
  toArticleCard,
} from "./api-shapes";
import { dbMiddleware } from "./db-middleware";

/**
 * Reader API — the personal write path (follow / like / save / read) plus the status
 * reads that back the UI toggles. Writes go to the signed-in reader's own AT
 * Proto repo (source of truth); status reads come from the Neon read-model (the
 * tap-fed cache), so the UI should treat toggles as optimistic. Mirrors the
 * `~/Documents/at-store` server-fn + query-options layout, with structured
 * observability around every call (`src/server/observability/log.ts`).
 */

/** Re-exported so the UI takes its filter-option shapes off the API layer
 * rather than reaching into a server-only query module. */
export type { SavedFacetOption, SavedFacets } from "#/server/reader/queries";

const publicationInput = z.object({
  publicationUri: z.string().min(1),
});

const userFollowInput = z.object({
  did: z.string().startsWith("did:"),
});

const documentInput = z.object({
  documentUri: z.string().min(1),
});

const documentsInput = z.object({
  documentUris: z.array(z.string().min(1)).max(100),
});

/** Default page size for likes / saved / history infinite scroll. */
export const READER_QUEUE_PAGE_SIZE = 20;

/**
 * How many in-progress articles the "Continue reading" shelf holds. Short on
 * purpose: it is a prompt to pick something back up, and a long one reads as
 * another backlog to feel behind on.
 */
export const UNFINISHED_SHELF_SIZE = 6;

const readerListInput = z.object({
  limit: z.number().int().min(1).max(100).default(READER_QUEUE_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
});

/** Sort orders exposed on the `/saved` page. */
export const SAVED_SORT_VALUES = [
  "added",
  "published",
  "publication",
  "title",
] as const;
export type SavedSort = (typeof SAVED_SORT_VALUES)[number];

/** Which way a {@link SavedSort} runs. */
export const SAVED_SORT_DIRECTIONS = ["desc", "asc"] as const;
export type SavedSortDirection = (typeof SAVED_SORT_DIRECTIONS)[number];

/**
 * The direction a field runs in until the reader flips it: dates read
 * newest-first, names read A–Z. Callers resolve the direction through this so
 * an implicit and an explicit "newest first" are the same query.
 */
export function defaultSavedSortDirection(sort: SavedSort): SavedSortDirection {
  return sort === "publication" || sort === "title" ? "asc" : "desc";
}

/**
 * Ceiling on how many values one facet can carry in the URL. Far above what a
 * reader will ever tick by hand; it exists so a hand-edited or stale link
 * can't turn into an unbounded `IN (...)`.
 */
export const SAVED_FILTER_MAX_VALUES = 100;

/** Longest search string we'll send to the server. */
export const SAVED_SEARCH_MAX_LENGTH = 200;

/**
 * The filter half of `/saved`'s state, shared by the route's search params and
 * the server fn's validator so the two can't drift. Every field is optional:
 * absent, empty, and all-blank all mean "not filtering on this".
 */
export const savedFiltersSchema = z.object({
  /** Free text, matched against title, description, publication name, and the
   * author's handle / display name. */
  q: z.string().max(SAVED_SEARCH_MAX_LENGTH).optional(),
  /** Publication AT-URIs. */
  pubs: z.array(z.string().min(1)).max(SAVED_FILTER_MAX_VALUES).optional(),
  /** Author DIDs. */
  authors: z.array(z.string().min(1)).max(SAVED_FILTER_MAX_VALUES).optional(),
  /** Normalized (lowercased, trimmed) tags. */
  tags: z.array(z.string().min(1)).max(SAVED_FILTER_MAX_VALUES).optional(),
});

export type SavedFilters = z.infer<typeof savedFiltersSchema>;

const savedListInput = readerListInput.extend({
  sort: z.enum(SAVED_SORT_VALUES).default("added"),
  /** Absent means "whatever this field's natural direction is". */
  dir: z.enum(SAVED_SORT_DIRECTIONS).optional(),
  ...savedFiltersSchema.shape,
});

/**
 * Drop the noise from a filter set: trim the query, sort and de-duplicate each
 * facet, and omit anything empty.
 *
 * Both halves of this matter. Omitting empties keeps `?pubs=[]` out of the URL
 * and off the query key, and sorting makes ticking A-then-B and B-then-A the
 * same cache entry — otherwise every click order is its own server round trip.
 */
export function normalizeSavedFilters(filters: SavedFilters): SavedFilters {
  const q = filters.q?.trim();
  return {
    authors: normalizeFacetValues(filters.authors),
    pubs: normalizeFacetValues(filters.pubs),
    q: q ? q.slice(0, SAVED_SEARCH_MAX_LENGTH) : undefined,
    tags: normalizeFacetValues(filters.tags),
  };
}

function normalizeFacetValues(
  values: Array<string> | undefined,
): Array<string> | undefined {
  if (!values?.length) return;
  const unique = [...new Set(values.map((value) => value.trim()))].filter(
    Boolean,
  );
  return unique.length > 0 ? unique.toSorted() : undefined;
}

/** Whether anything in this filter set would narrow the list. */
export function hasSavedFilters(filters: SavedFilters): boolean {
  return Boolean(
    filters.q?.trim() ||
    filters.pubs?.length ||
    filters.authors?.length ||
    filters.tags?.length,
  );
}

/** Escape LIKE metacharacters so a literal `%` or `_` a reader types stays
 * literal instead of becoming a wildcard. Postgres' default LIKE escape is
 * `\`, so no `ESCAPE` clause is needed. */
function escapeLikePattern(input: string): string {
  return input
    .replaceAll("\\", String.raw`\\`)
    .replaceAll("%", String.raw`\%`)
    .replaceAll("_", String.raw`\_`);
}

/**
 * `WHERE` fragments for a saved-list filter set — AND-ed together, with the
 * values inside one facet OR-ed. Ticking two publications widens; adding a tag
 * on top narrows.
 *
 * Every fragment reads off the joins the saved query already carries
 * (`documents`, `publications`, and the `pa` author-profile alias), so callers
 * only have to make sure those joins are present.
 */
function savedFilterConditions(
  schema: Schema,
  filters: SavedFilters,
): Array<SQL> {
  const d = schema.documents;
  const p = schema.publications;
  const pa = alias(schema.profiles, "pa");
  const conditions: Array<SQL> = [];

  if (filters.pubs?.length) {
    conditions.push(inArray(d.publicationUri, filters.pubs));
  }
  if (filters.authors?.length) {
    conditions.push(inArray(d.did, filters.authors));
  }
  if (filters.tags?.length) {
    // Matched through `immutable_normalized_tags` for the same reason the tag
    // pages do (see `documentCarriesTagWhere`): case and whitespace variants of
    // one tag are one tag, and the expression is the indexed one.
    conditions.push(
      sql`immutable_normalized_tags(${d.tags}) && array[${sql.join(
        filters.tags.map((tag) => sql`lower(btrim(${tag}))`),
        sql`, `,
      )}]::text[]`,
    );
  }

  const q = filters.q?.trim();
  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`;
    // Deliberately not the document body: `/saved` omits `text_content` from
    // its projection, and a hit the row can't visibly explain reads as a bug.
    conditions.push(
      or(
        ilike(d.title, pattern),
        ilike(d.description, pattern),
        ilike(p.name, pattern),
        ilike(pa.handle, pattern),
        ilike(pa.displayName, pattern),
      ) as SQL,
    );
  }

  return conditions;
}

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
  coverImageCid: string | null;
  publishedAt: Date | null;
  featured: boolean | null;
  publicationUri: string | null;
  publicationName: string | null;
  publicationDid: string | null;
  publicationIconCid: string | null;
  publicationOwnerAvatarUrl: string | null;
  publicationOwnerHandle: string | null;
  publicationBannerUrl: string | null;
  publicationTopic: string | null;
  authorHandle: string | null;
  authorAvatarUrl: string | null;
  authorDisplayName: string | null;
  tags: Array<string> | null;
  textContent?: string | null;
  hasRenderableBody: boolean | null;
  isCollection?: boolean | null;
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
    coverImageCid: row.coverImageCid,
    publishedAt: row.publishedAt,
    featured: row.featured ?? false,
    publicationUri: row.publicationUri,
    publicationName: row.publicationName,
    publicationDid: row.publicationDid,
    publicationIconCid: row.publicationIconCid,
    publicationOwnerAvatarUrl: row.publicationOwnerAvatarUrl,
    publicationOwnerHandle: row.publicationOwnerHandle,
    publicationBannerUrl: row.publicationBannerUrl,
    publicationTopic: row.publicationTopic,
    authorHandle: row.authorHandle,
    authorAvatarUrl: row.authorAvatarUrl,
    authorDisplayName: row.authorDisplayName,
    tags: row.tags,
    textContent: row.textContent ?? null,
    hasRenderableBody: row.hasRenderableBody,
    isCollection: row.isCollection,
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

/**
 * Flag the queue items (saved / history) whose article the viewer recommended,
 * so the rows show a filled heart on the like count. One batched query over
 * the page's cards; a no-op when nothing on the page is recommended.
 */
async function flagViewerRecommendedItems<
  T extends { article: ArticleCard | null },
>(
  db: Parameters<typeof attachViewerRecommendedToArticles>[0],
  schema: Parameters<typeof attachViewerRecommendedToArticles>[1],
  viewerDid: string | null | undefined,
  items: Array<T>,
): Promise<Array<T>> {
  const articles = items
    .map((item) => item.article)
    .filter((article): article is ArticleCard => article != null);
  const flagged = await attachViewerRecommendedToArticles(
    db,
    schema,
    viewerDid,
    articles,
  );
  const recommendedUris = new Set(
    flagged
      .filter((article) => article.viewerHasRecommended)
      .map((article) => article.uri),
  );
  if (recommendedUris.size === 0) return items;
  return items.map((item) =>
    item.article && recommendedUris.has(item.article.uri)
      ? { ...item, article: { ...item.article, viewerHasRecommended: true } }
      : item,
  );
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

/**
 * One page of `/saved`. `total` is how many rows the *current* filters match
 * (what pagination runs on); `totalSaved` is the reader's whole queue, which
 * the masthead keeps showing so its headline figure doesn't move as filters
 * come and go.
 */
export interface SavedListPage extends ReaderListPage<SavedArticleItem> {
  totalSaved: number;
}

/** A read article (`app.standard-reader.read`) with hydrated card data. */
export interface ReadHistoryItem {
  readUri: string;
  readAt: string | null;
  documentUri: string;
  /** Null when the document is no longer in the read-model. */
  article: ArticleCard | null;
}

/** Where a reader stopped in one article, as the server knows it. */
export interface ReadingPosition {
  /** Fraction of the article body scrolled past, 0–1. */
  progress: number;
  updatedAt: string;
}

/** An article the reader is partway through, with hydrated card data. */
export interface UnfinishedReadingItem extends ReadingPosition {
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
  .validator(publicationInput)
  .handler(
    observe("reader.getFollowStatus", async ({ data, context }, span) => {
      span.set("publicationUri", data.publicationUri);
      const did = await getReaderDidForRequest(getRequest());
      if (!did) {
        return { isFollowing: false } satisfies FollowStatus;
      }
      span.set("did", did);

      const sub = context.schema.subscriptions;
      const [row] = await context.db
        .select({ uri: sub.uri })
        .from(sub)
        .where(
          and(
            eq(sub.subscriberDid, did),
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
  .validator(publicationInput)
  .handler(
    observe("reader.followPublication", async ({ data }, span) => {
      span.set("publicationUri", data.publicationUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to subscribe to publications.");
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

/** Follow several publications in one request — used by the onboarding wizard's
 * select-then-commit flow. Writes are sequential (one restored PDS client, no
 * parallel `putRecord` burst against a brand-new account's PDS) and per-URI
 * failures are reported rather than aborting the batch, so the UI can keep the
 * failed rows selected and offer a retry. */
const followPublications = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(
    z.object({ publicationUris: z.array(z.string().min(1)).min(1).max(25) }),
  )
  .handler(
    observe("reader.followPublications", async ({ data }, span) => {
      span.set("count", data.publicationUris.length);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to subscribe to publications.");
      }
      span.set("did", session.did);

      const results: Array<{ uri: string; ok: boolean; error?: string }> = [];
      for (const publicationUri of data.publicationUris) {
        try {
          const createdAt = new Date().toISOString();
          const { uri, cid } = await putSubscriptionRecord(
            session.client,
            session.did,
            publicationUri,
            createdAt,
          );
          await upsertSubscription(
            uri,
            session.did,
            subjectRkey(publicationUri),
            cid,
            { publication: publicationUri, createdAt },
          );
          results.push({ uri: publicationUri, ok: true });
        } catch (error) {
          console.warn("[reader] batch follow failed", publicationUri, error);
          results.push({
            uri: publicationUri,
            ok: false,
            error: String(error),
          });
        }
      }

      span.set("followed", results.filter((r) => r.ok).length);
      await trackReaderRepo(session.did);
      return { results };
    }),
  );

const unfollowPublication = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(publicationInput)
  .handler(
    observe("reader.unfollowPublication", async ({ data, context }, span) => {
      span.set("publicationUri", data.publicationUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage subscriptions.");
      }
      span.set("did", session.did);

      const records = await unfollowPublicationForSession(
        session,
        context.db,
        context.schema,
        data.publicationUri,
      );
      span.set("records", records);
      return { ok: true as const };
    }),
  );

// ── Follow user (app.standard-reader.graph.follow) ──────────────────────────

/**
 * Followed subjects we've already kicked a PDS content backfill for this
 * process. Once a subject is tracked, tap keeps their recommends/documents
 * fresh, so the direct backfill is a one-shot catch-up so the follower's feed
 * isn't empty until tap catches up (see {@link backfillFollowedUserContent}).
 */
const followBackfillAttempted = new Set<string>();

/** Fire the followed-user content backfill in the background, at most once per
 * process per subject. Never awaited — the follow write must not block on
 * listing the subject's repo. */
function scheduleFollowedUserBackfill(subjectDid: string): void {
  if (followBackfillAttempted.has(subjectDid)) return;
  followBackfillAttempted.add(subjectDid);
  void (async () => {
    try {
      await backfillFollowedUserContent(subjectDid);
    } catch (error) {
      followBackfillAttempted.delete(subjectDid);
      console.warn(
        `[reader] followed-user backfill failed for ${subjectDid}`,
        error,
      );
    }
  })();
}

const getUserFollowStatus = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(userFollowInput)
  .handler(
    observe("reader.getUserFollowStatus", async ({ data, context }, span) => {
      span.set("subjectDid", data.did);
      const did = await getReaderDidForRequest(getRequest());
      if (!did) {
        return { isFollowing: false } satisfies FollowStatus;
      }
      span.set("did", did);

      const uf = context.schema.userFollows;
      const [row] = await context.db
        .select({ uri: uf.uri })
        .from(uf)
        .where(
          and(
            eq(uf.followerDid, did),
            eq(uf.subjectDid, data.did),
            eq(uf.deleted, false),
          ),
        )
        .limit(1);

      return { isFollowing: Boolean(row) } satisfies FollowStatus;
    }),
  );

const followUser = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(userFollowInput)
  .handler(
    observe("reader.followUser", async ({ data }, span) => {
      span.set("subjectDid", data.did);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to follow people.");
      }
      span.set("did", session.did);
      if (session.did === data.did) {
        throw new Error("You can't follow yourself.");
      }

      const createdAt = new Date().toISOString();
      const { uri, cid } = await putUserFollowRecord(
        session.client,
        session.did,
        data.did,
        createdAt,
      );
      await upsertUserFollow(uri, session.did, subjectRkey(data.did), cid, {
        subject: data.did,
        createdAt,
      });
      await trackReaderRepo(session.did);
      scheduleFollowedUserBackfill(data.did);
      // Materialize real subscriptions to the followed user's publications so
      // the author keeps portable subscribers. Fire-and-forget — the follow
      // shouldn't block on writing N subscription records to the PDS.
      void syncFollowedPublications(
        session.client,
        session.did,
        data.did,
      ).catch((error) => {
        console.warn("[reader] follow publication sync failed", error);
      });
      return { ok: true as const };
    }),
  );

const unfollowUser = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(userFollowInput)
  .handler(
    observe("reader.unfollowUser", async ({ data, context }, span) => {
      span.set("subjectDid", data.did);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage who you follow.");
      }
      span.set("did", session.did);

      const records = await unfollowUserForSession(
        session,
        context.db,
        context.schema,
        data.did,
      );
      span.set("records", records);
      return { ok: true as const };
    }),
  );

// ── Bulk subscription management (the /subscriptions directory) ─────────────

/** A multi-select on `/subscriptions`: publications and people in one payload. */
const subscriptionSelectionInput = z.object({
  publicationUris: z.array(z.string().min(1)).max(200).default([]),
  userDids: z.array(z.string().startsWith("did:")).max(200).default([]),
});

export interface BulkUnfollowResult {
  publicationsRemoved: number;
  peopleRemoved: number;
  /** Per-subject failures; the rest of the batch still went through. */
  failed: Array<{ id: string; error: string }>;
}

/**
 * Unsubscribe from publications and unfollow people in one request. Writes are
 * sequential (one restored PDS client, no parallel delete burst) and per-subject
 * failures are collected rather than aborting the batch, so the UI can report
 * exactly what survived.
 */
const unfollowSubscriptions = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(subscriptionSelectionInput)
  .handler(
    observe("reader.unfollowSubscriptions", async ({ data, context }, span) => {
      span.set("publications", data.publicationUris.length);
      span.set("users", data.userDids.length);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage subscriptions.");
      }
      span.set("did", session.did);

      const failed: Array<{ id: string; error: string }> = [];
      let publicationsRemoved = 0;
      let peopleRemoved = 0;

      for (const publicationUri of data.publicationUris) {
        try {
          await unfollowPublicationForSession(
            session,
            context.db,
            context.schema,
            publicationUri,
          );
          publicationsRemoved += 1;
        } catch (error) {
          console.warn(
            "[reader] bulk unsubscribe failed",
            publicationUri,
            error,
          );
          failed.push({ id: publicationUri, error: String(error) });
        }
      }

      for (const subjectDid of data.userDids) {
        try {
          await unfollowUserForSession(
            session,
            context.db,
            context.schema,
            subjectDid,
          );
          peopleRemoved += 1;
        } catch (error) {
          console.warn("[reader] bulk unfollow failed", subjectDid, error);
          failed.push({ id: subjectDid, error: String(error) });
        }
      }

      span.set("removed", publicationsRemoved + peopleRemoved);
      span.set("failed", failed.length);
      return {
        publicationsRemoved,
        peopleRemoved,
        failed,
      } satisfies BulkUnfollowResult;
    }),
  );

// ── Like (site.standard.graph.recommend) ────────────────────────────────────

const getRecommendStatus = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(documentInput)
  .handler(
    observe("reader.getRecommendStatus", async ({ data, context }, span) => {
      span.set("documentUri", data.documentUri);
      const did = await getReaderDidForRequest(getRequest());
      if (!did) {
        return { isRecommended: false } satisfies RecommendStatus;
      }
      span.set("did", did);

      const rec = context.schema.recommends;
      const [row] = await context.db
        .select({ uri: rec.uri })
        .from(rec)
        .where(
          and(
            eq(rec.recommenderDid, did),
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
  .validator(readerListInput)
  .handler(
    observe("reader.getLikes", async ({ data, context }, span) => {
      const did = await getReaderDidForRequest(getRequest());
      if (!did) {
        return buildReaderListPage<LikedArticleItem>([], data.offset, 0);
      }
      span.set("did", did);
      span.set("limit", data.limit);
      span.set("offset", data.offset);

      const rec = context.schema.recommends;
      const d = context.schema.documents;
      const p = context.schema.publications;
      const pr = context.schema.profiles;
      const pa = alias(context.schema.profiles, "pa");
      const cols = articleQueueCardColumns(context.schema);
      const where = and(eq(rec.recommenderDid, did), eq(rec.deleted, false));

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
          .leftJoin(pa, eq(pa.did, d.did))
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
  .validator(documentInput)
  .handler(
    observe("reader.recommendDocument", async ({ context, data }, span) => {
      span.set("documentUri", data.documentUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to like articles.");
      }
      span.set("did", session.did);

      const createdAt = new Date().toISOString();
      const { cid } = await putRecommendRecord(
        session.client,
        session.did,
        data.documentUri,
        createdAt,
      );
      await mirrorRecommendAdded(context.db, context.schema, {
        cid,
        createdAt,
        documentUri: data.documentUri,
        recommenderDid: session.did,
      });
      await trackReaderRepo(session.did);
      return { ok: true as const };
    }),
  );

const unrecommendDocument = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(documentInput)
  .handler(
    observe("reader.unrecommendDocument", async ({ context, data }, span) => {
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
      await mirrorRecommendRemoved(context.db, context.schema, {
        documentUri: data.documentUri,
        recommenderDid: session.did,
      });
      return { ok: true as const };
    }),
  );

// ── Read state (app.standard-reader.read) ───────────────────────────────────

const getReadStatus = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(documentInput)
  .handler(
    observe("reader.getReadStatus", async ({ data, context }, span) => {
      span.set("documentUri", data.documentUri);
      const did = await getReaderDidForRequest(getRequest());
      if (!did) {
        return { isRead: false } satisfies ReadStatus;
      }
      span.set("did", did);

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
            eq(r.ownerDid, did),
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
  .validator(documentsInput)
  .handler(
    observe("reader.getReadDocuments", async ({ data, context }, span) => {
      const did = await getReaderDidForRequest(getRequest());
      if (!did || data.documentUris.length === 0) {
        return [] satisfies Array<string>;
      }
      span.set("did", did);
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
            eq(r.ownerDid, did),
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
  .validator(documentInput)
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

      const createdAt = new Date().toISOString();
      const { cid } = await putReadRecord(
        session.client,
        session.did,
        data.documentUri,
        createdAt,
      );
      // Reflect the read in our own read-model now — the tap replay of this
      // same record is idempotent, and waiting on it can take hours.
      await mirrorReadsMarked(context.db, context.schema, {
        createdAt,
        ownerDid: session.did,
        reads: [{ cid, documentUri: data.documentUri }],
      });
      await trackReaderRepo(session.did);
      return { ok: true as const };
    }),
  );

const markUnread = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(documentInput)
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
      await mirrorReadRemoved(context.db, context.schema, {
        documentUri: data.documentUri,
        ownerDid: session.did,
      });
      return { ok: true as const };
    }),
  );

const getReadingHistory = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(readerListInput)
  .handler(
    observe("reader.getReadingHistory", async ({ data, context }, span) => {
      const did = await getReaderDidForRequest(getRequest());
      if (!did) {
        return buildReaderListPage<ReadHistoryItem>([], data.offset, 0);
      }
      span.set("did", did);
      span.set("limit", data.limit);
      span.set("offset", data.offset);

      const r = context.schema.reads;
      const d = context.schema.documents;
      const p = context.schema.publications;
      const pr = context.schema.profiles;
      const pa = alias(context.schema.profiles, "pa");
      const cols = articleQueueCardColumns(context.schema);
      const where = and(eq(r.ownerDid, did), eq(r.deleted, false));

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
          .leftJoin(pa, eq(pa.did, d.did))
          .where(where)
          // NULLS LAST matches `reads_owner_idx` (owner_did, created_at DESC
          // NULLS LAST); bare `desc()` is NULLS FIRST, which the planner can't
          // satisfy from the index — it would seq-scan + sort every read.
          .orderBy(sql`${r.createdAt} desc nulls last`)
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

      const withViewerRecs = await flagViewerRecommendedItems(
        context.db,
        context.schema,
        did,
        items,
      );

      return buildReaderListPage(withViewerRecs, data.offset, total);
    }),
  );

// ── Reading position (app-local; deliberately not a repo record) ────────────

const readingProgressInput = z.object({
  documentUri: z.string().min(1),
  /** Fraction of the article body scrolled past. */
  progress: z.number().min(0).max(1),
});

const unfinishedInput = z.object({
  limit: z.number().int().min(1).max(50).default(UNFINISHED_SHELF_SIZE),
});

/**
 * Remember where the reader stopped — or forget it, once they finish. Rows are
 * only kept while {@link isResumableProgress} holds, so `reading_progress` is
 * exactly the set of articles "Continue reading" should show and never needs a
 * sweep to stay that way.
 */
const setReadingProgress = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(readingProgressInput)
  .handler(
    observe("reader.setReadingProgress", async ({ data, context }, span) => {
      span.set("documentUri", data.documentUri);
      span.set("progress", data.progress);
      const did = await getReaderDidForRequest(getRequest());
      if (!did) return { ok: true as const };
      span.set("did", did);

      // Position is reading history by another name — a reader who turned that
      // off did not ask us to keep a finer-grained version of it.
      if (!context.trackReadingEnabled) return { ok: true as const };

      const rp = context.schema.readingProgress;
      const where = and(
        eq(rp.ownerDid, did),
        eq(rp.documentUri, data.documentUri),
      );

      if (!isResumableProgress(data.progress)) {
        await context.db.delete(rp).where(where);
        span.set("cleared", true);
        return { ok: true as const };
      }

      await context.db
        .insert(rp)
        .values({
          documentUri: data.documentUri,
          ownerDid: did,
          progress: data.progress,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [rp.ownerDid, rp.documentUri],
          set: { progress: data.progress, updatedAt: new Date() },
        });

      return { ok: true as const };
    }),
  );

/** Drop a remembered position (the reader chose to start from the top). */
const clearReadingProgress = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(documentInput)
  .handler(
    observe("reader.clearReadingProgress", async ({ data, context }, span) => {
      span.set("documentUri", data.documentUri);
      const did = await getReaderDidForRequest(getRequest());
      if (!did) return { ok: true as const };
      span.set("did", did);

      const rp = context.schema.readingProgress;
      await context.db
        .delete(rp)
        .where(and(eq(rp.ownerDid, did), eq(rp.documentUri, data.documentUri)));
      return { ok: true as const };
    }),
  );

/**
 * The position this reader's *other* devices know about. The local copy drives
 * the initial scroll (it is available before first paint); this is what corrects
 * it when the reader got further on their phone.
 */
const getReadingProgress = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(documentInput)
  .handler(
    observe("reader.getReadingProgress", async ({ data, context }, span) => {
      span.set("documentUri", data.documentUri);
      const did = await getReaderDidForRequest(getRequest());
      if (!did) return null satisfies ReadingPosition | null;
      span.set("did", did);

      const rp = context.schema.readingProgress;
      const rows = await context.db
        .select({ progress: rp.progress, updatedAt: rp.updatedAt })
        .from(rp)
        .where(and(eq(rp.ownerDid, did), eq(rp.documentUri, data.documentUri)))
        .limit(1);

      const row = rows[0];
      if (!row) return null;
      return {
        progress: row.progress,
        updatedAt: row.updatedAt.toISOString(),
      } satisfies ReadingPosition;
    }),
  );

/** Articles the reader is partway through, most recently touched first. */
const getUnfinishedReading = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(unfinishedInput)
  .handler(
    observe("reader.getUnfinishedReading", async ({ data, context }, span) => {
      const did = await getReaderDidForRequest(getRequest());
      if (!did) return [] satisfies Array<UnfinishedReadingItem>;
      span.set("did", did);
      span.set("limit", data.limit);

      const rp = context.schema.readingProgress;
      const d = context.schema.documents;
      const p = context.schema.publications;
      const pr = context.schema.profiles;
      const pa = alias(context.schema.profiles, "pa");
      const cols = articleQueueCardColumns(context.schema);

      const rows = await context.db
        .select({
          documentUri: rp.documentUri,
          progress: rp.progress,
          updatedAt: rp.updatedAt,
          ...cols,
        })
        .from(rp)
        .leftJoin(d, eq(d.uri, rp.documentUri))
        .leftJoin(p, eq(p.uri, d.publicationUri))
        .leftJoin(pr, eq(pr.did, p.did))
        .leftJoin(pa, eq(pa.did, d.did))
        .where(
          and(
            eq(rp.ownerDid, did),
            // Writes already hold this invariant; the filter keeps a stale row
            // from an older threshold out of the shelf.
            sql`${rp.progress} >= ${READING_PROGRESS_MIN}`,
            sql`${rp.progress} < ${READING_PROGRESS_DONE}`,
          ),
        )
        // Matches `reading_progress_owner_idx` (owner_did, updated_at DESC).
        .orderBy(desc(rp.updatedAt))
        .limit(data.limit);

      span.set("count", rows.length);

      const items = rows.map((row) => ({
        documentUri: row.documentUri,
        progress: row.progress,
        updatedAt: row.updatedAt.toISOString(),
        article: hydrateArticleFromRow(row, { isRead: true }),
      })) satisfies Array<UnfinishedReadingItem>;

      return flagViewerRecommendedItems(context.db, context.schema, did, items);
    }),
  );

// ── Save for later (app.standard-reader.bookmark) ───────────────────────────

const getBookmarkStatus = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(documentInput)
  .handler(
    observe("reader.getBookmarkStatus", async ({ data, context }, span) => {
      span.set("documentUri", data.documentUri);
      const did = await getReaderDidForRequest(getRequest());
      if (!did) {
        return { isBookmarked: false } satisfies BookmarkStatus;
      }
      span.set("did", did);

      const b = context.schema.bookmarks;
      const [row] = await context.db
        .select({ uri: b.uri })
        .from(b)
        .where(
          and(
            eq(b.ownerDid, did),
            eq(b.documentUri, data.documentUri),
            eq(b.deleted, false),
          ),
        )
        .limit(1);

      return { isBookmarked: Boolean(row) } satisfies BookmarkStatus;
    }),
  );

/**
 * `ORDER BY` for a {@link SavedSort} run in `direction`. Every ranking carries
 * a stable tiebreak (`bookmarks.uri`) so pagination never mixes or drops rows
 * across pages.
 *
 * Bookmark lists are scoped to one reader (small, per-user data — not a
 * network-wide feed), so unlike the feed-scale orderings in
 * `src/server/reader/queries.ts`, these sorts rely on `bookmarks_owner_idx` to
 * narrow the row set and then sort in memory rather than needing dedicated
 * composite indexes.
 * NULLS LAST is spelled out (not Drizzle's bare `desc()`, which emits NULLS
 * FIRST) so left-joined rows for a deleted/missing document sort to the end
 * instead of the top. It stays LAST in *both* directions: a bookmark whose
 * document is gone has no title or published date to rank by, so flipping the
 * order must not float it to the top.
 */
function savedOrderBy(
  schema: Schema,
  sort: SavedSort,
  direction: SavedSortDirection,
): Array<SQL> {
  const b = schema.bookmarks;
  const d = schema.documents;
  const p = schema.publications;
  const dir = direction === "asc" ? sql`asc` : sql`desc`;
  const tiebreak = direction === "asc" ? asc(b.uri) : desc(b.uri);

  if (sort === "published") {
    return [sql`${d.publishedAt} ${dir} nulls last`, tiebreak];
  }
  if (sort === "publication") {
    // Only the grouping flips — articles stay newest-first inside each
    // publication either way, which is what the group is read for.
    return [
      sql`${publicationSortNameSql(p.name, p.url)} ${dir} nulls last`,
      sql`${d.publishedAt} desc nulls last`,
      tiebreak,
    ];
  }
  if (sort === "title") {
    return [sql`lower(${d.title}) ${dir} nulls last`, tiebreak];
  }
  return [sql`${b.createdAt} ${dir} nulls last`, tiebreak];
}

const getSaved = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(savedListInput)
  .handler(
    observe("reader.getSaved", async ({ data, context }, span) => {
      const did = await getReaderDidForRequest(getRequest());
      if (!did) {
        return {
          ...buildReaderListPage<SavedArticleItem>([], data.offset, 0),
          totalSaved: 0,
        } satisfies SavedListPage;
      }
      const direction = data.dir ?? defaultSavedSortDirection(data.sort);
      span.set("did", did);
      span.set("limit", data.limit);
      span.set("offset", data.offset);
      span.set("sort", data.sort);
      span.set("dir", direction);

      const b = context.schema.bookmarks;
      const d = context.schema.documents;
      const p = context.schema.publications;
      const pr = context.schema.profiles;
      const pa = alias(context.schema.profiles, "pa");
      const cols = articleQueueCardColumns(context.schema);
      const where = and(eq(b.ownerDid, did), eq(b.deleted, false));

      const conditions = savedFilterConditions(context.schema, data);
      const filterWhere =
        conditions.length > 0 ? (and(...conditions) as SQL) : null;
      span.set("filtered", filterWhere != null);

      // Both totals come off one aggregate: `total` is the headline figure the
      // masthead keeps showing regardless of filters, `matching` is what drives
      // pagination. Unfiltered, the two are the same count and the query stays
      // the lean `bookmarks`-only scan it has always been — the joins are only
      // paid for when a filter actually references them.
      const countBase = context.db
        .select({
          matching: filterWhere
            ? sql<number>`count(*) filter (where ${filterWhere})::int`.mapWith(
                Number,
              )
            : sql<number>`count(*)::int`.mapWith(Number),
          total: sql<number>`count(*)::int`.mapWith(Number),
        })
        .from(b)
        .$dynamic();

      const [countRow, rows] = await Promise.all([
        filterWhere
          ? countBase
              .leftJoin(d, eq(d.uri, b.documentUri))
              .leftJoin(p, eq(p.uri, d.publicationUri))
              .leftJoin(pa, eq(pa.did, d.did))
              .where(where)
          : countBase.where(where),
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
          .leftJoin(pa, eq(pa.did, d.did))
          .where(filterWhere ? and(where, filterWhere) : where)
          // The "added" sort in its default direction matches
          // `bookmarks_owner_idx` (owner_did, created_at DESC NULLS LAST); see
          // getReadingHistory for why bare `desc()` is slow. Every other
          // sort/direction pair filters via that same index, then sorts in
          // memory — see savedOrderBy.
          .orderBy(...savedOrderBy(context.schema, data.sort, direction))
          .limit(data.limit)
          .offset(data.offset),
      ]);

      const totalSaved = countRow[0]?.total ?? 0;
      const total = countRow[0]?.matching ?? 0;
      span.set("count", rows.length);
      span.set("total", total);
      span.set("totalSaved", totalSaved);

      const items = rows.map((row) => ({
        bookmarkUri: row.bookmarkUri,
        savedAt: row.savedAt?.toISOString() ?? null,
        documentUri: row.documentUri,
        article: hydrateArticleFromRow(row),
      })) satisfies Array<SavedArticleItem>;

      const withViewerRecs = await flagViewerRecommendedItems(
        context.db,
        context.schema,
        did,
        items,
      );

      return {
        ...buildReaderListPage(withViewerRecs, data.offset, total),
        totalSaved,
      };
    }),
  );

/**
 * The reader's own publications / authors / tags, for `/saved`'s filter
 * popover. Separate from the list itself so the rows paint first — the options
 * are only needed once the popover opens, and this page's cost is dominated by
 * round trips (see the `railway-neon-region-mismatch` note).
 */
const getSavedFacets = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe("reader.getSavedFacets", async ({ context }, span) => {
      const did = await getReaderDidForRequest(getRequest());
      if (!did) {
        return {
          authors: [],
          publications: [],
          tags: [],
          truncated: false,
        } satisfies SavedFacets;
      }
      span.set("did", did);

      const facets = await selectSavedFacets(context.db, context.schema, did);
      span.set("publications", facets.publications.length);
      span.set("authors", facets.authors.length);
      span.set("tags", facets.tags.length);
      span.set("truncated", facets.truncated);
      return facets;
    }),
  );

const bookmarkDocument = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(documentInput)
  .handler(
    observe("reader.bookmarkDocument", async ({ context, data }, span) => {
      span.set("documentUri", data.documentUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to save articles for later.");
      }
      span.set("did", session.did);

      const createdAt = new Date().toISOString();
      const { cid } = await putBookmarkRecord(
        session.client,
        session.did,
        data.documentUri,
        createdAt,
      );
      await mirrorBookmarkSaved(context.db, context.schema, {
        cid,
        createdAt,
        documentUri: data.documentUri,
        ownerDid: session.did,
      });
      await trackReaderRepo(session.did);
      return { ok: true as const };
    }),
  );

const unbookmarkDocument = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(documentInput)
  .handler(
    observe("reader.unbookmarkDocument", async ({ context, data }, span) => {
      span.set("documentUri", data.documentUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage saved articles.");
      }
      span.set("did", session.did);

      await deleteBookmarkRecord(session.client, session.did, data.documentUri);
      await mirrorBookmarkRemoved(context.db, context.schema, {
        documentUri: data.documentUri,
        ownerDid: session.did,
      });
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

      // Read rkeys from the DB mirror (no PDS I/O for the read).
      const readRows = await context.db
        .select({
          rkey: context.schema.reads.rkey,
          subject: context.schema.reads.documentUri,
        })
        .from(context.schema.reads)
        .where(eq(context.schema.reads.ownerDid, session.did));

      await Promise.all(
        readRows.map(async (row) => {
          await deleteReadRecord(session.client, session.did, row.subject);
        }),
      );

      await context.db
        .delete(context.schema.reads)
        .where(eq(context.schema.reads.ownerDid, session.did));

      // Positions are reading history at a finer grain. Someone clearing the
      // one and being left with the other would reasonably call that a bug.
      await context.db
        .delete(context.schema.readingProgress)
        .where(eq(context.schema.readingProgress.ownerDid, session.did));

      await trackReaderRepo(session.did);
      span.set("deleted", readRows.length);
      return { ok: true as const, deleted: readRows.length };
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

      // Read rkeys from the DB mirror (no PDS I/O for the read).
      const bookmarkRows = await context.db
        .select({
          rkey: context.schema.bookmarks.rkey,
          subject: context.schema.bookmarks.documentUri,
        })
        .from(context.schema.bookmarks)
        .where(eq(context.schema.bookmarks.ownerDid, session.did));

      await Promise.all(
        bookmarkRows.map(async (row) => {
          await deleteBookmarkRecord(session.client, session.did, row.subject);
        }),
      );

      await context.db
        .delete(context.schema.bookmarks)
        .where(eq(context.schema.bookmarks.ownerDid, session.did));

      await trackReaderRepo(session.did);
      span.set("deleted", bookmarkRows.length);
      return { ok: true as const, deleted: bookmarkRows.length };
    }),
  );

const markPublicationAllRead = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(publicationInput)
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
              countOldPostsAsUnread: context.countOldPostsAsUnreadEnabled,
            })
          : [];
        span.set("count", documentUris.length);
        return markDocumentsRead({
          client: session.client,
          db: context.db,
          did: session.did,
          documentUris,
          schema: context.schema,
          trackReading,
        });
      },
    ),
  );

/**
 * One page of the offline-sync walk. 500 keeps a single response comfortably
 * small (a URI is ~80 bytes) while letting a several-thousand-item backlog
 * enumerate in a handful of round trips — which matters given the ~230ms
 * Railway↔Neon round trip.
 */
const OFFLINE_SYNC_PAGE_SIZE = 500;

const unreadDocumentUrisInput = z.object({
  cursor: z
    .object({ publishedAt: z.string(), uri: z.string() })
    .nullish()
    .transform((value) => value ?? undefined),
  limit: z
    .number()
    .int()
    .min(1)
    .max(OFFLINE_SYNC_PAGE_SIZE)
    .default(OFFLINE_SYNC_PAGE_SIZE),
});

/**
 * The reader's unread documents, newest first, for offline pre-caching.
 *
 * Deliberately returns URIs only — the bodies come from `getArticle` one at a
 * time so they land in the service worker's `data` cache under the exact URL
 * the article route will later ask for.
 *
 * Returns an empty page when reading history is off: with no `reads` rows
 * there is no "unread" to speak of, and syncing the entire follow feed is not
 * what the reader asked for by turning tracking off.
 */
const getUnreadDocumentUris = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(unreadDocumentUrisInput)
  .handler(
    observe("reader.getUnreadDocumentUris", async ({ data, context }, span) => {
      const did = await getReaderDidForRequest(getRequest());
      if (!did || !context.trackReadingEnabled) {
        return { nextCursor: null, uris: [] as Array<string> };
      }
      span.set("did", did);

      const { publicationUris, userDids } = await effectiveFollowSets(
        context.db,
        context.schema,
        did,
      );
      const rows = await selectUnreadDocumentPage(context.db, context.schema, {
        countOldPostsAsUnread: context.countOldPostsAsUnreadEnabled,
        cursor: data.cursor,
        followedUserDids: userDids,
        limit: data.limit,
        publicationUris,
        readerDid: did,
      });
      span.set("count", rows.length);

      const last = rows.at(-1);
      // A short page means the walk is done. A full page hands back the last
      // row as the next keyset position.
      const nextCursor =
        rows.length === data.limit && last
          ? {
              publishedAt: last.publishedAt.toISOString(),
              uri: last.uri,
            }
          : null;

      return { nextCursor, uris: rows.map((row) => row.uri) };
    }),
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

      // Effective follows: subscriptions + saved-list publications + followed
      // users (authored + recommended) — matches the follow feed.
      const { publicationUris, userDids } = await effectiveFollowSets(
        context.db,
        context.schema,
        session.did,
      );
      const documentUris = trackReading
        ? await selectUnreadDocumentUris(context.db, context.schema, {
            readerDid: session.did,
            publicationUris,
            followedUserDids: userDids,
            countOldPostsAsUnread: context.countOldPostsAsUnreadEnabled,
          })
        : [];
      span.set("count", documentUris.length);
      return markDocumentsRead({
        client: session.client,
        db: context.db,
        did: session.did,
        documentUris,
        schema: context.schema,
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

function getUserFollowStatusQueryOptions(did: string) {
  return queryOptions({
    queryKey: ["reader", "userFollowStatus", did] as const,
    queryFn: async () => getUserFollowStatus({ data: { did } }),
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
  sort = "added",
  dir,
  limit = READER_QUEUE_PAGE_SIZE,
  ...filters
}: {
  sort?: SavedSort;
  dir?: SavedSortDirection;
  limit?: number;
} & SavedFilters = {}) {
  // Both resolved here, not in the key builder's caller, so `/saved?sort=added`
  // and `/saved?sort=added&dir=desc` share one cache entry instead of
  // refetching — and so does ticking two filters in either order.
  const direction = dir ?? defaultSavedSortDirection(sort);
  const normalized = normalizeSavedFilters(filters);
  return infiniteQueryOptions({
    queryKey: ["reader", "saved", sort, direction, limit, normalized] as const,
    queryFn: async ({ pageParam }) =>
      getSaved({
        data: {
          ...normalized,
          sort,
          dir: direction,
          limit,
          offset: pageParam,
        },
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });
}

function getSavedFacetsQueryOptions() {
  return queryOptions({
    // Deliberately outside the `["reader", "saved"]` prefix that the bookmark
    // optimistic update rewrites — facets are counts, not list pages, and
    // shouldn't be walked by a helper looking for infinite data.
    queryKey: ["reader", "savedFacets"] as const,
    queryFn: async () => getSavedFacets(),
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

function getReadingProgressQueryOptions(documentUri: string) {
  return queryOptions({
    queryKey: ["reader", "readingProgress", documentUri] as const,
    queryFn: async () => getReadingProgress({ data: { documentUri } }),
    // The reader is looking at the article right now; their own scrolling is
    // the authority here, not a refetch.
    staleTime: 5 * 60 * 1000,
  });
}

function getUnfinishedReadingQueryOptions({
  limit = UNFINISHED_SHELF_SIZE,
}: { limit?: number } = {}) {
  return queryOptions({
    queryKey: ["reader", "unfinished", limit] as const,
    queryFn: async () => getUnfinishedReading({ data: { limit } }),
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

function followUserMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "followUser"] as const,
    mutationFn: async (did: string) => followUser({ data: { did } }),
  });
}

function unfollowUserMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "unfollowUser"] as const,
    mutationFn: async (did: string) => unfollowUser({ data: { did } }),
  });
}

/** One selection payload shared by the two bulk mutations. */
export interface SubscriptionSelection {
  publicationUris: Array<string>;
  userDids: Array<string>;
}

function unfollowSubscriptionsMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "unfollowSubscriptions"] as const,
    mutationFn: async (selection: SubscriptionSelection) =>
      unfollowSubscriptions({ data: selection }),
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
  followPublications,
  unfollowPublication,
  unfollowPublicationMutationOptions,
  // follow user (app.standard-reader.graph.follow)
  getUserFollowStatus,
  getUserFollowStatusQueryOptions,
  followUser,
  followUserMutationOptions,
  unfollowUser,
  unfollowUserMutationOptions,
  // bulk subscription management (/subscriptions)
  unfollowSubscriptions,
  unfollowSubscriptionsMutationOptions,
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
  // offline pre-caching (`#/pwa/offline-sync`)
  getUnreadDocumentUris,
  markUnread,
  markUnreadMutationOptions,
  getReadingHistory,
  getReadingHistoryInfiniteQueryOptions,
  // reading position (app-local, not a repo record)
  getReadingProgress,
  getReadingProgressQueryOptions,
  setReadingProgress,
  clearReadingProgress,
  getUnfinishedReading,
  getUnfinishedReadingQueryOptions,
  // save for later (app.standard-reader.bookmark)
  getBookmarkStatus,
  getBookmarkStatusQueryOptions,
  getSaved,
  getSavedInfiniteQueryOptions,
  getSavedFacets,
  getSavedFacetsQueryOptions,
  bookmarkDocument,
  bookmarkDocumentMutationOptions,
  unbookmarkDocument,
  unbookmarkDocumentMutationOptions,
  deleteAllReadHistory,
  deleteAllReadHistoryMutationOptions,
  deleteAllBookmarks,
  deleteAllBookmarksMutationOptions,
};

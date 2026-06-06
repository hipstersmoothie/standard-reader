import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { observe } from "#/server/observability/log";
import { readersAlsoFollow, selectArticleCards } from "#/server/reader/queries";
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

/**
 * Publication-profile and article reading queries (`APP_VISION.md` §5).
 *
 * The profile assembles the header (publication + owner identity + stats),
 * recent writing, and the "readers also follow" rail. The article query returns
 * full content plus its publication card, byline contributors, and recommend
 * count. Opening an article marks it read via `readerApi.markRead` from the UI —
 * this GET stays side-effect-free.
 */

const profileInput = z.object({
  publicationUri: z.string().min(1),
  recentLimit: z.number().int().min(1).max(30).default(10),
  alsoFollowLimit: z.number().int().min(1).max(20).default(6),
});

const articleInput = z.object({
  documentUri: z.string().min(1),
});

export interface PublicationProfile {
  publication: PublicationCard;
  owner: ProfileSummary;
  recentDocuments: Array<ArticleCard>;
  readersAlsoFollow: Array<PublicationCard>;
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
  textContent: string | null;
  bskyPostUri: string | null;
  bskyPostCid: string | null;
  publicationUri: string | null;
  publication: PublicationCard | null;
  contributors: Array<ArticleContributor>;
  recommendCount: number;
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
        const sub = schema.subscriptions;
        const doc = schema.documents;
        span.set("publicationUri", data.publicationUri);

        const [headerRow, recentDocuments, alsoFollow, liveCounts] =
          await Promise.all([
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
            selectArticleCards(db, schema, {
              publicationUris: [data.publicationUri],
              limit: data.recentLimit,
            }),
            readersAlsoFollow(
              db,
              schema,
              data.publicationUri,
              data.alsoFollowLimit,
            ),
            // Live counts: `publication_stats` lags behind the firehose, so
            // count active subscriptions/documents directly for the header.
            db
              .select({
                subscriberCount: sql<number>`count(distinct ${sub.subscriberDid}) filter (where ${sub.deleted} = false)`.mapWith(
                  Number,
                ),
              })
              .from(sub)
              .where(eq(sub.publicationUri, data.publicationUri))
              .then(async (subRows) => {
                const docRows = await db
                  .select({
                    documentCount: sql<number>`count(*)`.mapWith(Number),
                  })
                  .from(doc)
                  .where(
                    and(
                      eq(doc.publicationUri, data.publicationUri),
                      eq(doc.deleted, false),
                    ),
                  );
                return {
                  subscriberCount: subRows[0]?.subscriberCount ?? 0,
                  documentCount: docRows[0]?.documentCount ?? 0,
                };
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
        publication.subscriberCount = liveCounts.subscriberCount;
        publication.documentCount = liveCounts.documentCount;

        return {
          publication,
          owner,
          recentDocuments,
          readersAlsoFollow: alsoFollow,
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
        span.set("documentUri", data.documentUri);

        const [docRows, contributorRows, recommendRows] = await Promise.all([
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
        ]);

        const row = docRows[0];
        if (!row) {
          span.set("found", false);
          return null;
        }
        span.set("found", true);

        const publication: PublicationCard | null = row.pubUri
          ? toPublicationCard({
              uri: row.pubUri,
              did: row.pubDid ?? row.did,
              name: row.pubName ?? "",
              url: row.pubUrl ?? "",
              description: row.pubDescription,
              iconUrl: row.pubIconUrl,
              ownerAvatarUrl: row.pubOwnerAvatarUrl,
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

        return {
          uri: row.uri,
          did: row.did,
          title: row.title,
          description: row.description,
          path: row.path,
          canonicalUrl: row.canonicalUrl,
          coverImageUrl: row.coverImageUrl,
          publishedAt: row.publishedAt.toISOString(),
          updatedAt: row.recordUpdatedAt?.toISOString() ?? null,
          featured: row.featured,
          tags: row.tags,
          contentJson: (row.contentJson ?? null) as JsonValue,
          contentFormat: row.contentFormat,
          textContent: row.textContent,
          bskyPostUri: row.bskyPostUri,
          bskyPostCid: row.bskyPostCid,
          publicationUri: row.publicationUri,
          publication,
          contributors,
          recommendCount: recommendRows[0]?.count ?? 0,
        };
      },
    ),
  );

function getPublicationProfileQueryOptions(
  publicationUri: string,
  {
    recentLimit = 10,
    alsoFollowLimit = 6,
  }: { recentLimit?: number; alsoFollowLimit?: number } = {},
) {
  return queryOptions({
    queryKey: ["publication", "profile", publicationUri] as const,
    queryFn: async () =>
      getPublicationProfile({
        data: { publicationUri, recentLimit, alsoFollowLimit },
      }),
  });
}

function getArticleQueryOptions(documentUri: string) {
  return queryOptions({
    queryKey: ["article", documentUri] as const,
    queryFn: async () => getArticle({ data: { documentUri } }),
  });
}

export const publicationApi = {
  getPublicationProfile,
  getPublicationProfileQueryOptions,
  getArticle,
  getArticleQueryOptions,
};

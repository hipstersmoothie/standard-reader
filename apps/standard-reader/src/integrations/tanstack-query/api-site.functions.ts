import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { publicationUriFromParams } from "#/components/reader/format";
import type { PublicationThemeColors } from "#/components/reader/publication-theme-scale";
import type { SiteConfig, SiteLink, SiteTheme } from "#/lib/site/config";
import {
  DEFAULT_SITE_CONFIG,
  SITE_MAX_LINK_LABEL_LENGTH,
  SITE_MAX_LINKS,
  SITE_MAX_TAGLINE_LENGTH,
  normalizeSiteLinks,
  normalizeSiteTheme,
} from "#/lib/site/config";
import type { SiteStyle } from "#/lib/site/styles";
import { SITE_STYLES, toSiteStyle } from "#/lib/site/styles";
import {
  getAtprotoSessionForRequest,
  getReaderDidForRequest,
} from "#/middleware/auth-session.server";
import {
  AUTHOR_SITE_RKEY,
  deleteSiteRecord,
  publicationSiteRkey,
  putSiteRecord,
} from "#/server/atproto/repo-records";
import { resolveAuthorDid } from "#/server/atproto/resolve-author-ref";
import { blockEdgeFor, blockFilterDid } from "#/server/blocks/blocks";
import { upsertSite } from "#/server/ingest/handlers";
import { observe } from "#/server/observability/log";
import { selectPublicationHeader } from "#/server/reader/publication-header";
import {
  authorDocuments,
  authorProfileStats,
  authorPublications,
  selectPublicationArticleCards,
} from "#/server/reader/queries";
import {
  loadOwnerSiteConfigs,
  loadSiteConfig,
} from "#/server/reader/site-config.server";

import type { ArticleCard, PublicationCard } from "./api-shapes";
import { dbMiddleware } from "./db-middleware";

/**
 * Standalone sites — an author's or a publication's own page, with none of
 * Standard Reader's chrome (`/site/u/$did`, `/site/p/$did/$rkey`).
 *
 * Everything a site renders comes back in one round trip, because a site page
 * has no tabs, no reader-scoped state, and nothing below the fold that could
 * usefully be deferred: it is a masthead and an archive. The queries are
 * deliberately the *public* ones — no read/unread flags, no recommend
 * attribution, no comment counts — since a site is written for people who are
 * not signed in here and often never will be.
 */

/** Documents a site's first page carries before "older posts" paginates. */
export const SITE_PAGE_SIZE = 24;

/** Identity for the masthead — the same fields for both kinds of site. */
export interface SiteMasthead {
  /** The site's title: the publication's name, or the author's display name. */
  name: string;
  /** The owner's handle, when they have a usable one. */
  handle: string | null;
  /** Description from the publication record, or the author's bio. */
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  /** Total posts, across every publication for an author site. */
  documentCount: number;
  subscriberCount: number;
  /** Most recent post, for the "last published" line. */
  lastPublishedAt: string | null;
}

export interface SitePage {
  kind: "author" | "publication";
  /** The owner's DID — canonical, even when the route was given a handle. */
  did: string;
  /** The publication's rkey, for a publication site. */
  rkey: string | null;
  /** AT-URI of the publication, for a publication site. */
  publicationUri: string | null;
  masthead: SiteMasthead;
  config: SiteConfig;
  /**
   * The colors the site is painted in: its own theme when the owner set one,
   * the publication's otherwise, and null when neither states any (the site
   * then wears the default editorial palette).
   */
  theme: PublicationThemeColors | null;
  articles: Array<ArticleCard>;
  nextOffset: number | null;
  /** The author's publications — the masthead's sections on an author site. */
  publications: Array<PublicationCard>;
}

const sitePageInput = z.object({
  /** DID or handle of the author / publication owner. */
  did: z.string().min(1),
  /** Record key of the publication; absent for an author site. */
  rkey: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(SITE_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
});

/**
 * Turn a site's own theme colors into the shape the publication colour scale
 * already speaks, so both kinds of site go through one generator.
 */
function themeColorsFromSiteTheme(
  theme: SiteTheme | null,
): PublicationThemeColors | null {
  if (!theme) return null;
  return {
    themeBackground: theme.background,
    themeForeground: theme.foreground,
    themeAccent: theme.accent,
    themeAccentForeground: theme.accentForeground,
  };
}

const getSitePage = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(sitePageInput)
  .handler(
    observe(
      "site.getPage",
      async ({ data, context }, span): Promise<SitePage | null> => {
        const { db, schema } = context;
        const did = await resolveAuthorDid(db, schema, data.did);
        span.set("subject.did", did);
        span.set("kind", data.rkey ? "publication" : "author");
        span.set("offset", data.offset);

        // A site is that account's page. If the viewer and the owner have
        // blocked each other, it is not shown at all — the same answer the
        // profile gives, rather than an empty site that still names them.
        const readerDid = await getReaderDidForRequest(getRequest());
        // `undefined` for the overwhelming majority — readers who block nobody
        // — which is what keeps the card queries off the block joins entirely.
        const viewerDid = await blockFilterDid(db, schema, readerDid);
        if (viewerDid && (await blockEdgeFor(db, schema, viewerDid, did))) {
          span.set("blocked", true);
          return null;
        }

        if (data.rkey) {
          const publicationUri = publicationUriFromParams(did, data.rkey);
          const [header, config] = await Promise.all([
            selectPublicationHeader(db, schema, publicationUri),
            loadSiteConfig(db, schema, did, publicationUri),
          ]);
          if (!header) {
            span.set("found", false);
            return null;
          }
          const articles = await selectPublicationArticleCards(db, schema, {
            publicationUri,
            limit: data.limit,
            offset: data.offset,
            viewerDid,
          });
          span.set("count", articles.length);
          return {
            kind: "publication",
            did,
            rkey: data.rkey,
            publicationUri,
            masthead: {
              name: header.publication.name,
              handle: header.owner.handle,
              description: header.publication.description,
              avatarUrl:
                header.publication.iconUrl ?? header.owner.avatarUrl ?? null,
              bannerUrl: header.owner.bannerUrl,
              documentCount: header.publication.documentCount,
              subscriberCount: header.publication.subscriberCount,
              lastPublishedAt: header.publication.lastDocumentAt,
            },
            config,
            // The owner's stated colors win, because they chose them for *this*
            // page; the publication's own theme is what a site inherits when
            // they stated none.
            theme: themeColorsFromSiteTheme(config.theme) ?? header.theme,
            articles,
            nextOffset:
              articles.length === data.limit ? data.offset + data.limit : null,
            publications: [],
          };
        }

        const [config, stats, documentsPage, publications, profile] =
          await Promise.all([
            loadSiteConfig(db, schema, did, null),
            authorProfileStats(db, schema, did),
            authorDocuments(db, schema, {
              did,
              limit: data.limit,
              offset: data.offset,
            }),
            authorPublications(db, schema, { did, limit: 24 }),
            db.query.profiles.findFirst({
              where: eq(schema.profiles.did, did),
              columns: {
                did: true,
                handle: true,
                displayName: true,
                description: true,
                avatarUrl: true,
                bannerUrl: true,
              },
            }),
          ]);

        // An account with no identity and nothing published has no site — the
        // same "not found" the profile route gives for an unknown DID.
        if (!profile && stats.documentCount === 0) {
          span.set("found", false);
          return null;
        }

        span.set("count", documentsPage.items.length);
        return {
          kind: "author",
          did,
          rkey: null,
          publicationUri: null,
          masthead: {
            name: profile?.displayName?.trim() || profile?.handle || did,
            handle: profile?.handle ?? null,
            description: profile?.description ?? null,
            avatarUrl: profile?.avatarUrl ?? null,
            bannerUrl: profile?.bannerUrl ?? null,
            documentCount: stats.documentCount,
            subscriberCount: stats.subscriberCount,
            lastPublishedAt: documentsPage.items[0]?.publishedAt ?? null,
          },
          config,
          // An author writes across publications that need not agree on a
          // palette, so nothing is inherited here: it is the colors they chose
          // for their site, or the editorial default.
          theme: themeColorsFromSiteTheme(config.theme),
          articles: documentsPage.items,
          nextOffset:
            documentsPage.items.length === data.limit
              ? data.offset + data.limit
              : null,
          publications,
        };
      },
    ),
  );

/** One entry in the owner's site settings: a site they can configure. */
export interface OwnedSite {
  /** AT-URI of the publication, or null for the author's own site. */
  publicationUri: string | null;
  /** Record key of the publication, for building its site URL. */
  rkey: string | null;
  name: string;
  iconUrl: string | null;
  documentCount: number;
  config: SiteConfig;
}

const getOwnedSites = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe(
      "site.getOwned",
      async (
        { context },
        span,
      ): Promise<{
        did: string;
        sites: Array<OwnedSite>;
      } | null> => {
        const { db, schema } = context;
        const did = await getReaderDidForRequest(getRequest());
        if (!did) return null;
        span.set("did", did);

        const [configs, publications, profile] = await Promise.all([
          loadOwnerSiteConfigs(db, schema, did),
          // Hidden publications included: a publication kept out of discovery can
          // still have a site — that is arguably the point of one.
          authorPublications(db, schema, {
            did,
            limit: 100,
            includeHidden: true,
          }),
          db.query.profiles.findFirst({
            where: eq(schema.profiles.did, did),
            columns: { handle: true, displayName: true, avatarUrl: true },
          }),
        ]);
        span.set("publications", publications.length);

        return {
          did,
          sites: [
            {
              publicationUri: null,
              rkey: null,
              name: profile?.displayName?.trim() || profile?.handle || did,
              iconUrl: profile?.avatarUrl ?? null,
              documentCount: 0,
              config: configs.get("") ?? DEFAULT_SITE_CONFIG,
            },
            ...publications.map((pub) => ({
              publicationUri: pub.uri,
              rkey: pub.uri.split("/").pop() ?? null,
              name: pub.name,
              iconUrl: pub.iconUrl ?? pub.ownerAvatarUrl ?? null,
              documentCount: pub.documentCount,
              config: configs.get(pub.uri) ?? DEFAULT_SITE_CONFIG,
            })),
          ],
        };
      },
    ),
  );

const hexColor = z
  .string()
  .regex(/^#(?:[\da-f]{3}|[\da-f]{6})$/i)
  .nullable();

const putSiteInput = z.object({
  /** AT-URI of the publication to configure; null for the author's own site. */
  publicationUri: z.string().min(1).nullable().default(null),
  style: z.enum(SITE_STYLES),
  tagline: z.string().max(SITE_MAX_TAGLINE_LENGTH).nullable().default(null),
  theme: z
    .object({
      background: hexColor.default(null),
      foreground: hexColor.default(null),
      accent: hexColor.default(null),
      accentForeground: hexColor.default(null),
    })
    .nullable()
    .default(null),
  links: z
    .array(
      z.object({
        label: z.string().min(1).max(SITE_MAX_LINK_LABEL_LENGTH),
        url: z.string().url().max(2048),
      }),
    )
    .max(SITE_MAX_LINKS)
    .default([]),
  showStandardReaderLink: z.boolean().default(true),
});

const putSite = createServerFn({ method: "POST" })
  .validator(putSiteInput)
  .handler(
    observe("site.put", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to customize your site.");
      }
      span.set("did", session.did);
      span.set("style", data.style);
      span.set("publication", data.publicationUri != null);

      // A site record is only ever about the writer's own work, so the
      // publication has to live in their repo. Without this check a signed-in
      // reader could write a record claiming somebody else's publication, and
      // the mirror would happily index it against that publication's URI.
      if (
        data.publicationUri &&
        !data.publicationUri.startsWith(`at://${session.did}/`)
      ) {
        throw new Error("You can only customize your own publications.");
      }

      const updatedAt = new Date().toISOString();
      const theme = normalizeSiteTheme(data.theme);
      const links = normalizeSiteLinks(data.links);
      const tagline = data.tagline?.trim() || null;

      const { uri, cid, rkey } = await putSiteRecord(
        session.client,
        session.did,
        {
          publication: data.publicationUri,
          style: data.style,
          tagline,
          theme,
          links,
          showStandardReaderLink: data.showStandardReaderLink,
          updatedAt,
        },
      );
      // Write through to the mirror so the site repaints on the next read
      // rather than when the firehose comes back around.
      await upsertSite(uri, session.did, rkey, cid, {
        publication: data.publicationUri ?? undefined,
        style: data.style,
        tagline: tagline ?? undefined,
        // The record shape omits absent slots rather than nulling them, which
        // is what `putSiteRecord` writes — mirror that exactly so the
        // write-through row matches the row the firehose will produce.
        theme: theme
          ? {
              background: theme.background ?? undefined,
              foreground: theme.foreground ?? undefined,
              accent: theme.accent ?? undefined,
              accentForeground: theme.accentForeground ?? undefined,
            }
          : undefined,
        links,
        showStandardReaderLink: data.showStandardReaderLink,
        updatedAt,
      });
      return { ok: true as const };
    }),
  );

const deleteSiteInput = z.object({
  publicationUri: z.string().min(1).nullable().default(null),
});

const deleteSite = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(deleteSiteInput)
  .handler(
    observe("site.delete", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to reset your site.");
      }
      span.set("did", session.did);
      if (
        data.publicationUri &&
        !data.publicationUri.startsWith(`at://${session.did}/`)
      ) {
        throw new Error("You can only customize your own publications.");
      }

      await deleteSiteRecord(session.client, session.did, data.publicationUri);
      // Delete the mirror row directly rather than waiting for the stream, for
      // the same reason `putSite` writes through: the settings page re-reads
      // immediately after.
      const { db, schema } = context;
      const rkey = data.publicationUri
        ? publicationSiteRkey(data.publicationUri)
        : AUTHOR_SITE_RKEY;
      await db
        .delete(schema.sites)
        .where(
          eq(
            schema.sites.uri,
            `at://${session.did}/app.standard-reader.site/${rkey}`,
          ),
        );
      return { ok: true as const };
    }),
  );

function getSitePageQueryOptions(input: {
  did: string;
  rkey?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = input.limit ?? SITE_PAGE_SIZE;
  const offset = input.offset ?? 0;
  return queryOptions({
    queryKey: [
      "site",
      "page",
      input.did,
      input.rkey ?? null,
      limit,
      offset,
    ] as const,
    queryFn: async () =>
      getSitePage({
        data: { did: input.did, rkey: input.rkey, limit, offset },
      }),
    staleTime: 5 * 60_000,
  });
}

const getOwnedSitesQueryOptions = queryOptions({
  queryKey: ["site", "owned"] as const,
  queryFn: async () => getOwnedSites(),
  staleTime: 60_000,
});

function putSiteMutationOptions() {
  return mutationOptions({
    mutationKey: ["site", "put"] as const,
    mutationFn: async (input: z.input<typeof putSiteInput>) =>
      putSite({ data: input }),
  });
}

function deleteSiteMutationOptions() {
  return mutationOptions({
    mutationKey: ["site", "delete"] as const,
    mutationFn: async (input: z.input<typeof deleteSiteInput>) =>
      deleteSite({ data: input }),
  });
}

export type { SiteConfig, SiteLink, SiteStyle };

export const siteApi = {
  getSitePage,
  getSitePageQueryOptions,
  getOwnedSites,
  getOwnedSitesQueryOptions,
  putSite,
  putSiteMutationOptions,
  deleteSite,
  deleteSiteMutationOptions,
  toSiteStyle,
};

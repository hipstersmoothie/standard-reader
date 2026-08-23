import {
  documents,
  profiles,
  publicationStats,
  publications,
  sites,
} from "@standard-reader/db/schema";
import type { SiteConfig } from "@standard-reader/site-config";
import {
  DEFAULT_SITE_CONFIG,
  siteConfigFromRow,
} from "@standard-reader/site-config";
/**
 * Server-only: everything a standalone site renders.
 *
 * These are deliberately *lean* queries rather than the reader's card pipeline.
 * A site is a public page — no signed-in viewer, no read/unread state, no
 * recommend attribution, no comment counts, no label or block filtering — so it
 * needs a publication header, a page of posts, and the owner's identity, and
 * nothing else. Re-stating that much Drizzle here is far less code than sharing
 * the reader's query layer would be, and it keeps a site's cost honest: one
 * round trip over two indexed tables.
 */
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { getDb } from "../db/index.server";

/** How many posts a site's first page carries before "older posts" pages. */
export const SITE_PAGE_SIZE = 24;

/** A post as a site renders it — the public subset of the reader's card. */
export interface SiteArticle {
  uri: string;
  did: string;
  rkey: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  publishedAt: string;
  /** Which publication it came from — the kicker on an author site. */
  publicationName: string | null;
}

/** Identity for the masthead — the same fields for both kinds of site. */
export interface SiteMasthead {
  name: string;
  handle: string | null;
  description: string | null;
  avatarUrl: string | null;
  documentCount: number;
  lastPublishedAt: string | null;
}

/** The four flat colors a themed surface starts from. */
export interface SiteThemeColors {
  themeBackground: string | null;
  themeForeground: string | null;
  themeAccent: string | null;
  themeAccentForeground: string | null;
}

export interface SitePage {
  kind: "author" | "publication";
  did: string;
  rkey: string | null;
  publicationUri: string | null;
  masthead: SiteMasthead;
  config: SiteConfig;
  /**
   * The colors the site is painted in: its own when the owner set any, the
   * publication's otherwise, and null when neither states any — the site then
   * wears the default editorial palette.
   */
  theme: SiteThemeColors | null;
  articles: Array<SiteArticle>;
  nextOffset: number | null;
}

const CDN = "https://cdn.bsky.app/img/feed_thumbnail/plain";

function blobUrl(did: string, cid: string | null): string | null {
  return cid ? `${CDN}/${did}/${cid}@jpeg` : null;
}

function rkeyOf(uri: string): string {
  return uri.split("/").pop() ?? "";
}

/**
 * One subject's site configuration, or the defaults.
 *
 * A missing row is a normal answer, not a miss: every account and every
 * publication has a site whether or not its owner has customized one. The
 * record only decides how it looks.
 */
export async function loadSiteConfig(
  ownerDid: string,
  publicationUri: string | null,
): Promise<SiteConfig> {
  const db = getDb();
  if (!db) return DEFAULT_SITE_CONFIG;
  const [row] = await db
    .select()
    .from(sites)
    .where(
      and(
        eq(sites.ownerDid, ownerDid),
        eq(sites.deleted, false),
        publicationUri
          ? eq(sites.publicationUri, publicationUri)
          : sql`${sites.publicationUri} is null`,
      ),
    )
    .limit(1);
  return row ? siteConfigFromRow(row) : DEFAULT_SITE_CONFIG;
}

/** Every site configuration one owner has saved, keyed by publication AT-URI
 * (the author's own site under the empty string). */
export async function loadOwnerSiteConfigs(
  ownerDid: string,
): Promise<Map<string, SiteConfig>> {
  const db = getDb();
  if (!db) return new Map();
  const rows = await db
    .select()
    .from(sites)
    .where(and(eq(sites.ownerDid, ownerDid), eq(sites.deleted, false)));
  return new Map(
    rows.map((row) => [row.publicationUri ?? "", siteConfigFromRow(row)]),
  );
}

/** Resolve a route's `$did` — which may be a handle — to a DID. */
export async function resolveSiteDid(
  didOrHandle: string,
): Promise<string | null> {
  if (didOrHandle.startsWith("did:")) return didOrHandle;
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ did: profiles.did })
    .from(profiles)
    .where(eq(profiles.handle, didOrHandle))
    .limit(1);
  return row?.did ?? null;
}

const publishedNotInFuture = sql`${documents.publishedAt} <= now()`;

/** One publication's standalone site. */
export async function loadPublicationSite(
  did: string,
  rkey: string,
  offset = 0,
  limit = SITE_PAGE_SIZE,
): Promise<SitePage | null> {
  const db = getDb();
  if (!db) return null;
  const publicationUri = `at://${did}/site.standard.publication/${rkey}`;

  const [[pub], config] = await Promise.all([
    db
      .select({
        uri: publications.uri,
        did: publications.did,
        name: publications.name,
        description: publications.description,
        iconCid: publications.iconCid,
        themeBackground: publications.themeBackground,
        themeForeground: publications.themeForeground,
        themeAccent: publications.themeAccent,
        themeAccentForeground: publications.themeAccentForeground,
        ownerHandle: profiles.handle,
        ownerAvatarUrl: profiles.avatarUrl,
        documentCount: publicationStats.documentCount,
        lastDocumentAt: publicationStats.lastDocumentAt,
      })
      .from(publications)
      .leftJoin(profiles, eq(profiles.did, publications.did))
      .leftJoin(
        publicationStats,
        eq(publicationStats.publicationUri, publications.uri),
      )
      .where(
        and(
          eq(publications.uri, publicationUri),
          eq(publications.deleted, false),
        ),
      )
      .limit(1),
    loadSiteConfig(did, publicationUri),
  ]);
  if (!pub) return null;

  const rows = await db
    .select({
      uri: documents.uri,
      did: documents.did,
      title: documents.title,
      description: documents.description,
      coverImageCid: documents.coverImageCid,
      publishedAt: documents.publishedAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.publicationUri, publicationUri),
        eq(documents.deleted, false),
        publishedNotInFuture,
      ),
    )
    .orderBy(desc(documents.publishedAt))
    .limit(limit)
    .offset(offset);

  const ownTheme = siteThemeFromConfig(config);
  return {
    kind: "publication",
    did,
    rkey,
    publicationUri,
    masthead: {
      name: pub.name,
      handle: pub.ownerHandle,
      description: pub.description,
      avatarUrl: blobUrl(pub.did, pub.iconCid) ?? pub.ownerAvatarUrl ?? null,
      documentCount: pub.documentCount ?? 0,
      lastPublishedAt: pub.lastDocumentAt?.toISOString() ?? null,
    },
    config,
    // The owner's stated colors win — they chose them for *this* page; the
    // publication's own theme is what a site inherits when they stated none.
    theme:
      ownTheme ??
      ({
        themeBackground: pub.themeBackground,
        themeForeground: pub.themeForeground,
        themeAccent: pub.themeAccent,
        themeAccentForeground: pub.themeAccentForeground,
      } satisfies SiteThemeColors),
    articles: rows.map((row) => ({
      uri: row.uri,
      did: row.did,
      rkey: rkeyOf(row.uri),
      title: row.title,
      description: row.description,
      coverImageUrl: blobUrl(row.did, row.coverImageCid),
      publishedAt: row.publishedAt.toISOString(),
      publicationName: null,
    })),
    nextOffset: rows.length === limit ? offset + limit : null,
  };
}

/** One author's standalone site — everything they publish, across publications. */
export async function loadAuthorSite(
  did: string,
  offset = 0,
  limit = SITE_PAGE_SIZE,
): Promise<SitePage | null> {
  const db = getDb();
  if (!db) return null;

  const [[profile], config] = await Promise.all([
    db
      .select({
        did: profiles.did,
        handle: profiles.handle,
        displayName: profiles.displayName,
        description: profiles.description,
        avatarUrl: profiles.avatarUrl,
      })
      .from(profiles)
      .where(eq(profiles.did, did))
      .limit(1),
    loadSiteConfig(did, null),
  ]);

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        uri: documents.uri,
        did: documents.did,
        title: documents.title,
        description: documents.description,
        coverImageCid: documents.coverImageCid,
        publishedAt: documents.publishedAt,
        publicationName: publications.name,
      })
      .from(documents)
      .leftJoin(publications, eq(publications.uri, documents.publicationUri))
      .where(
        and(
          eq(documents.did, did),
          eq(documents.deleted, false),
          publishedNotInFuture,
        ),
      )
      .orderBy(desc(documents.publishedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(documents)
      .where(
        and(
          eq(documents.did, did),
          eq(documents.deleted, false),
          publishedNotInFuture,
        ),
      ),
  ]);

  // An account with no identity and nothing published has no site.
  if (!profile && (totals?.count ?? 0) === 0) return null;

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
      documentCount: totals?.count ?? 0,
      lastPublishedAt: rows[0]?.publishedAt.toISOString() ?? null,
    },
    config,
    // An author writes across publications that need not agree on a palette, so
    // nothing is inherited here: their stated colors, or the editorial default.
    theme: siteThemeFromConfig(config),
    articles: rows.map((row) => ({
      uri: row.uri,
      did: row.did,
      rkey: rkeyOf(row.uri),
      title: row.title,
      description: row.description,
      coverImageUrl: blobUrl(row.did, row.coverImageCid),
      publishedAt: row.publishedAt.toISOString(),
      publicationName: row.publicationName,
    })),
    nextOffset: rows.length === limit ? offset + limit : null,
  };
}

function siteThemeFromConfig(config: SiteConfig): SiteThemeColors | null {
  const theme = config.theme;
  if (!theme) return null;
  return {
    themeBackground: theme.background,
    themeForeground: theme.foreground,
    themeAccent: theme.accent,
    themeAccentForeground: theme.accentForeground,
  };
}

/** Publications this account owns that have at least one published post — the
 * subjects a site editor can offer. */
export async function loadOwnedPublicationUris(
  ownerDid: string,
): Promise<Array<{ uri: string; rkey: string; name: string }>> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      uri: publications.uri,
      rkey: publications.rkey,
      name: publications.name,
    })
    .from(publications)
    .where(
      and(
        eq(publications.did, ownerDid),
        eq(publications.deleted, false),
        isNotNull(publications.name),
      ),
    )
    .orderBy(desc(publications.indexedAt));
  return rows;
}

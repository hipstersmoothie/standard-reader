import type * as DbSchema from "#/db/schema";
import type { SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { sql } from "drizzle-orm";

/**
 * Shared shapes + helpers for the read-model query layer (`APP_VISION.md` §5).
 *
 * The personal write path lives in `api-reader.functions.ts`; this module backs
 * the *read* queries (feeds, directory, profiles, articles, search). It defines
 * the serializable DTOs the UI consumes, the Drizzle column projections that
 * produce them, and the row→DTO mappers. Kept dependency-light (types + pure
 * mappers only — no server-only imports) so it can be referenced from anywhere.
 */

/** A JSON-serializable value (e.g. a document's raw `content` union object). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | Array<JsonValue>
  | { [key: string]: JsonValue };

/** The full schema module (matches `dbMiddleware`'s `context.schema`). */
export type Schema = typeof DbSchema;
/** The Drizzle client type (matches `dbMiddleware`'s `context.db`). */
export type Db = NodePgDatabase<Schema>;

/** A publication as rendered in cards, rails, and the directory. */
export interface PublicationCard {
  uri: string;
  did: string;
  name: string;
  url: string;
  description: string | null;
  iconUrl: string | null;
  /** Owning profile's avatar, used as an icon fallback when the pub has none. */
  ownerAvatarUrl: string | null;
  /** Owning profile's handle (e.g. `alice.bsky.social`). */
  ownerHandle: string | null;
  topic: string | null;
  verified: boolean;
  subscriberCount: number;
  documentCount: number;
  lastDocumentAt: string | null;
  /** `ts_headline` HTML for the name in search results. */
  searchNameHtml?: string | null;
  /** `ts_headline` HTML excerpt for search results. */
  searchSnippetHtml?: string | null;
}

/** An article (document) as rendered in feed rows, rails, and search results. */
export interface ArticleCard {
  uri: string;
  did: string;
  title: string;
  description: string | null;
  path: string | null;
  canonicalUrl: string | null;
  coverImageUrl: string | null;
  publishedAt: string;
  featured: boolean;
  publicationUri: string | null;
  publicationName: string | null;
  publicationIconUrl: string | null;
  /** Owning profile's avatar, used as a byline-icon fallback when the pub has none. */
  publicationOwnerAvatarUrl: string | null;
  /** Owning profile's handle (e.g. `alice.bsky.social`). */
  publicationOwnerHandle: string | null;
  /** Owning publication's banner (from the owner profile), for cover fallback. */
  publicationBannerUrl: string | null;
  /** Owning publication's derived topic (e.g. "Design"), for meta labels. */
  publicationTopic: string | null;
  /** Free-form tags from the document record. */
  tags: Array<string> | null;
  /** Plaintext body when indexed (used for reading-time on cards). */
  textContent: string | null;
  /** Network likes (`site.standard.graph.recommend`). */
  recommendCount: number;
  /** Bluesky link/quote posts + margin.at notes on this article (Constellation). */
  commentCount: number;
  /**
   * Whether the reader can render an in-app body. `false` for "external" posts
   * (plain text / bsky-anchored / no structured content) — those link straight
   * out to the publication site in a new tab instead of routing through
   * `/a/$did/$rkey`.
   */
  hasRenderableBody: boolean;
  /**
   * Whether the requesting reader has marked this read. Only meaningful when the
   * query was scoped to a reader (`readForDid`); otherwise defaults to `false`.
   */
  isRead: boolean;
  /** `ts_headline` HTML for the title in search results. */
  searchTitleHtml?: string | null;
  /** `ts_headline` HTML excerpt for search results. */
  searchSnippetHtml?: string | null;
}

/** A profile summary (byline / publication owner). */
export interface ProfileSummary {
  did: string;
  handle: string | null;
  displayName: string | null;
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
}

// ── Drizzle column projections ──────────────────────────────────────────────

/**
 * Select-columns for a {@link PublicationCard}. Pulls the canonical record from
 * `publications`, the derived counts from `publication_stats`, and the owner's
 * avatar from `profiles`; queries should `leftJoin` stats (a publication may not
 * have a stats row yet) and `profiles` on `profiles.did = publications.did`.
 */
export function publicationCardColumns(schema: Schema) {
  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;
  return {
    uri: p.uri,
    did: p.did,
    name: p.name,
    url: p.url,
    description: p.description,
    iconUrl: p.iconUrl,
    ownerAvatarUrl: pr.avatarUrl,
    ownerHandle: pr.handle,
    topic: p.topic,
    verified: p.verified,
    subscriberCount: st.subscriberCount,
    documentCount: st.documentCount,
    lastDocumentAt: st.lastDocumentAt,
  };
}

/**
 * Select-columns for an {@link ArticleCard}. Pulls the document plus its
 * publication's name/icon and the owner profile's banner; queries should
 * `leftJoin` publications on `publications.uri = documents.publication_uri`
 * (loose documents have none) and `profiles` on `profiles.did = publications.did`.
 */
export function articleCardColumns(schema: Schema) {
  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;
  const rec = schema.recommends;
  return {
    uri: d.uri,
    did: d.did,
    title: d.title,
    description: d.description,
    path: d.path,
    canonicalUrl: d.canonicalUrl,
    coverImageUrl: d.coverImageUrl,
    publishedAt: d.publishedAt,
    featured: d.featured,
    publicationUri: d.publicationUri,
    publicationName: p.name,
    publicationIconUrl: p.iconUrl,
    publicationOwnerAvatarUrl: pr.avatarUrl,
    publicationOwnerHandle: pr.handle,
    publicationBannerUrl: pr.bannerUrl,
    publicationTopic: p.topic,
    tags: d.tags,
    textContent: d.textContent,
    hasRenderableBody: d.hasRenderableBody,
    recommendCount: sql<number>`coalesce((
      select count(*)::int
      from ${rec}
      where ${rec.documentUri} = ${d.uri}
        and ${rec.deleted} = false
    ), 0)`.mapWith(Number),
  };
}

/**
 * Lighter {@link ArticleCard} projection for personal queue pages (saved,
 * likes, history). Omits `textContent` — list rows never render bodies, and
 * full essays bloat the query + SSR dehydration.
 */
export function articleQueueCardColumns(schema: Schema) {
  const { textContent: _textContent, ...columns } = articleCardColumns(schema);
  return columns;
}

// ── Row → DTO mappers ───────────────────────────────────────────────────────

/** Drizzle timestamps are `Date`; raw SQL / aggregates may return strings. */
function toIsoTimestamp(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

type PublicationCardRow = {
  uri: string;
  did: string;
  name: string;
  url: string;
  description: string | null;
  iconUrl: string | null;
  ownerAvatarUrl: string | null;
  ownerHandle: string | null;
  topic: string | null;
  verified: boolean;
  subscriberCount: number | null;
  documentCount: number | null;
  lastDocumentAt: Date | string | null;
  searchNameHtml?: string | null;
  searchSnippetHtml?: string | null;
};

/**
 * A human label for a publication. The lexicon requires `name`, but some
 * records carry an empty string — fall back to the URL host, then a generic
 * label, so cards never render blank.
 */
export function publicationDisplayName(name: string, url: string): string {
  const trimmed = name.trim();
  if (trimmed) return trimmed;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host) return host;
  } catch {
    // url is empty or malformed — fall through to the generic label
  }
  return "Untitled publication";
}

/**
 * SQL sort key aligned with {@link publicationDisplayName} — trim stored name,
 * else lowercased URL host (no `www.`), else a stable fallback label.
 */
export function publicationSortNameSql(
  name: typeof DbSchema.publications.name,
  url: typeof DbSchema.publications.url,
): SQL {
  return sql`case
    when nullif(trim(${name}), '') is not null then lower(trim(${name}))
    when ${url} ~ '^https?://' then lower(
      regexp_replace(
        regexp_replace(substring(${url} from '^https?://([^/?#]+)'), '^www\\.', ''),
        ':[0-9]+$', ''
      )
    )
    else 'untitled publication'
  end`;
}

/** Sort followed publications by most recent activity, then display name. */
export function sortFollowingPublications<
  T extends Pick<PublicationCard, "lastDocumentAt" | "name">,
>(pubs: Array<T>): Array<T> {
  return pubs.toSorted((a, b) => {
    const aTime = a.lastDocumentAt ? Date.parse(a.lastDocumentAt) : 0;
    const bTime = b.lastDocumentAt ? Date.parse(b.lastDocumentAt) : 0;
    if (bTime !== aTime) return bTime - aTime;
    return a.name.localeCompare(b.name);
  });
}

export function toPublicationCard(row: PublicationCardRow): PublicationCard {
  return {
    uri: row.uri,
    did: row.did,
    name: publicationDisplayName(row.name, row.url),
    url: row.url,
    description: row.description,
    iconUrl: row.iconUrl,
    ownerAvatarUrl: row.ownerAvatarUrl,
    ownerHandle: row.ownerHandle,
    topic: row.topic,
    verified: row.verified,
    subscriberCount: row.subscriberCount ?? 0,
    documentCount: row.documentCount ?? 0,
    lastDocumentAt: toIsoTimestamp(row.lastDocumentAt),
    searchNameHtml: row.searchNameHtml ?? undefined,
    searchSnippetHtml: row.searchSnippetHtml ?? undefined,
  };
}

type ArticleCardRow = {
  uri: string;
  did: string;
  title: string;
  description: string | null;
  path: string | null;
  canonicalUrl: string | null;
  coverImageUrl: string | null;
  publishedAt: Date;
  featured: boolean;
  publicationUri: string | null;
  publicationName: string | null;
  publicationIconUrl: string | null;
  publicationOwnerAvatarUrl: string | null;
  publicationOwnerHandle: string | null;
  publicationBannerUrl: string | null;
  publicationTopic: string | null;
  tags: Array<string> | null;
  textContent?: string | null;
  hasRenderableBody?: boolean | null;
  recommendCount: number | null;
  isRead?: boolean | null;
  searchTitleHtml?: string | null;
  searchSnippetHtml?: string | null;
};

export function toArticleCard(row: ArticleCardRow): ArticleCard {
  return {
    uri: row.uri,
    did: row.did,
    title: row.title,
    description: row.description,
    path: row.path,
    canonicalUrl: row.canonicalUrl,
    coverImageUrl: row.coverImageUrl,
    publishedAt: row.publishedAt.toISOString(),
    featured: row.featured,
    publicationUri: row.publicationUri,
    publicationName: row.publicationName,
    publicationIconUrl: row.publicationIconUrl,
    publicationOwnerAvatarUrl: row.publicationOwnerAvatarUrl,
    publicationOwnerHandle: row.publicationOwnerHandle,
    publicationBannerUrl: row.publicationBannerUrl,
    publicationTopic: row.publicationTopic,
    tags: row.tags,
    textContent: row.textContent ?? null,
    hasRenderableBody: row.hasRenderableBody ?? true,
    recommendCount: row.recommendCount ?? 0,
    commentCount: 0,
    isRead: row.isRead ?? false,
    searchTitleHtml: row.searchTitleHtml ?? undefined,
    searchSnippetHtml: row.searchSnippetHtml ?? undefined,
  };
}

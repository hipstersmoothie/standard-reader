/**
 * Shared assembly for the public RSS feed routes (`src/routes/feed.*.tsx`):
 * batch-loads the raw content bodies `ArticleCard` omits, then maps cards to
 * {@link FeedItem}s with the excerpt/full-HTML fallback the feeds share.
 */

import { inArray } from "drizzle-orm";

import { articleReaderUrl } from "#/components/reader/format";
import type {
  ArticleCard,
  Db,
  JsonValue,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import { documentContentHtml } from "#/lib/document/content-html";
import type { FeedItem } from "#/lib/feeds/rss";

interface FeedItemBody {
  contentJson: JsonValue | null;
  contentFormat: string | null;
}

/** Batched `contentJson`/`contentFormat` lookup for a set of document URIs. */
export async function loadFeedItemBodies(
  db: Db,
  schema: Schema,
  uris: Array<string>,
): Promise<Map<string, FeedItemBody>> {
  if (uris.length === 0) return new Map();

  const d = schema.documents;
  const rows = await db
    .select({
      uri: d.uri,
      contentJson: d.contentJson,
      contentFormat: d.contentFormat,
    })
    .from(d)
    .where(inArray(d.uri, uris));

  return new Map(
    rows.map((row) => [
      row.uri,
      {
        contentJson: (row.contentJson as JsonValue | null) ?? null,
        contentFormat: row.contentFormat,
      },
    ]),
  );
}

/** Byline label for `dc:creator` — author first, then the publication. */
function creatorForCard(card: ArticleCard): string | null {
  if (card.authorDisplayName) return card.authorDisplayName;
  if (card.authorHandle) return `@${card.authorHandle}`;
  if (card.publicationName) return card.publicationName;
  if (card.publicationOwnerHandle) return `@${card.publicationOwnerHandle}`;
  return null;
}

/**
 * Map {@link ArticleCard}s to {@link FeedItem}s. `contentJson`/`contentFormat`
 * come from {@link loadFeedItemBodies} (keyed by `card.uri`) since `ArticleCard`
 * doesn't carry the raw body. `content:encoded` is included only for formats
 * `documentContentHtml` can render as HTML (HTML/Gutenberg/markdown) — every
 * other format falls back to the `description` excerpt only, never `textContent`.
 */
export function feedItemsFromCards(
  cards: Array<ArticleCard>,
  bodies: Map<string, FeedItemBody>,
  baseUrl: string,
  /** Byline fallback for cards with no author/publication info (e.g. `selectPublicationArticleCards`, which nulls those fields on the assumption the page-level header already shows them). */
  defaultCreator?: string | null,
): Array<FeedItem> {
  return cards.map((card) => {
    const body = bodies.get(card.uri);
    const contentHtml = body
      ? documentContentHtml(body.contentJson, body.contentFormat)
      : null;
    const link =
      card.canonicalUrl ?? articleReaderUrl(card.uri, baseUrl) ?? baseUrl;

    return {
      uri: card.uri,
      title: card.title,
      link,
      description: card.description,
      creator: creatorForCard(card) ?? defaultCreator ?? null,
      publishedAt: card.publishedAt,
      tags: card.tags,
      contentHtml,
      coverImageUrl: card.coverImageUrl,
    };
  });
}

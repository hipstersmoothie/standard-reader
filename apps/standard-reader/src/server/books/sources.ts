/**
 * Read model to book: turning the same cards the feeds and the catalog serve
 * into an {@link EpubSpec}.
 *
 * Everything here reads from the DB mirror, never the PDS — the bodies come
 * from `documents.content_json`, which the ingester keeps current (see the
 * "AT Protocol data model" rules in CLAUDE.md). A download is a read.
 */

import { articleReaderUrl } from "#/components/reader/format";
import type {
  ArticleCard,
  Db,
  JsonValue,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import type { BskyPostView } from "#/server/atproto/bsky-posts";
import { loadFeedItemBodies } from "#/server/feeds/build";

import { bskyPostUrisInDocument, hydrateBskyPosts } from "./bsky-embeds";
import type { EpubChapterSource, EpubSpec } from "./epub";
import { renderDocumentBody } from "./render";

/** How many articles a collection-shaped book carries at most. */
export const BOOK_ARTICLE_LIMIT = 50;

/**
 * Drop the cards that have no body to package.
 *
 * `hasRenderableBody` is the app's existing judgement that a document is worth
 * opening in the reader rather than linking out to (bridged link posts, bare
 * Bluesky anchors). A chapter for one of those is a title and a URL, and forty
 * of them is a book that wastes the reader's time — so a shelf silently carries
 * only what it can actually deliver.
 */
export function packageableCards(
  cards: Array<ArticleCard>,
): Array<ArticleCard> {
  return cards.filter((card) => card.hasRenderableBody);
}

interface FeedItemBody {
  contentJson: JsonValue | null;
  contentFormat: string | null;
}

/** Byline for a card — author first, then the publication, as the feeds do. */
export function cardByline(card: ArticleCard): string | null {
  if (card.authorDisplayName) return card.authorDisplayName;
  if (card.authorHandle) return `@${card.authorHandle}`;
  if (card.publicationName) return card.publicationName;
  if (card.publicationOwnerHandle) return `@${card.publicationOwnerHandle}`;
  return null;
}

function formatDateline(iso: string): string | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return new Date(time).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  });
}

/** Public URL for a card — the publication's own page when it has one. */
export function cardSourceUrl(card: ArticleCard, baseUrl: string): string {
  return card.canonicalUrl ?? articleReaderUrl(card.uri, baseUrl) ?? baseUrl;
}

/**
 * The newest timestamp in a set of cards, as the book's `dcterms:modified`.
 *
 * Using content time rather than build time is what makes a rebuild produce
 * the same bytes — and what lets a reader's device tell a genuinely updated
 * book from the same book fetched twice.
 */
function newestTimestamp(cards: Array<ArticleCard>, fallback: string): string {
  let newest = 0;
  for (const card of cards) {
    const time = Date.parse(card.publishedAt);
    if (!Number.isNaN(time) && time > newest) newest = time;
  }
  return newest === 0 ? fallback : new Date(newest).toISOString();
}

/** Distinct bylines across a book, most frequent first, capped for sanity. */
function collectAuthors(cards: Array<ArticleCard>, limit = 6): Array<string> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const byline = cardByline(card);
    if (!byline) continue;
    counts.set(byline, (counts.get(byline) ?? 0) + 1);
  }
  return [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([byline]) => byline);
}

function chapterFromCard(
  card: ArticleCard,
  body: FeedItemBody | undefined,
  index: number,
  baseUrl: string,
  posts: Map<string, BskyPostView>,
): EpubChapterSource {
  const sourceUrl = cardSourceUrl(card, baseUrl);
  return {
    id: `ch${String(index + 1).padStart(4, "0")}`,
    meta: {
      byline: cardByline(card),
      dateline: formatDateline(card.publishedAt),
      sourceLabel: card.publicationName ?? card.canonicalUrl ?? sourceUrl,
      sourceUrl,
    },
    render: (localImages) =>
      renderDocumentBody({
        authorDid: card.did,
        content: body?.contentJson ?? null,
        contentFormat: body?.contentFormat ?? null,
        description: card.description,
        documentUrl: sourceUrl,
        localImages,
        posts,
      }),
    title: card.title,
  };
}

export interface BookFromCardsOptions {
  identifier: string;
  title: string;
  baseUrl: string;
  description?: string | null;
  publisher?: string | null;
  subtitle?: string | null;
  sourceUrl?: string | null;
  coverImageUrl?: string | null;
  subjects?: Array<string>;
  /** Byline for the book as a whole; defaults to the bylines inside it. */
  authors?: Array<string>;
}

/** Assemble a book from cards plus their bodies, in the order given. */
export async function bookFromCards(
  db: Db,
  schema: Schema,
  cards: Array<ArticleCard>,
  options: BookFromCardsOptions,
): Promise<EpubSpec> {
  const bodies = await loadFeedItemBodies(
    db,
    schema,
    cards.map((card) => card.uri),
  );

  // One round trip for every post the whole book embeds: the AppView takes 25
  // URIs at a time, and a forty-article anthology would otherwise be forty
  // requests to hydrate what is often the same handful of posts.
  const posts = await hydrateBskyPosts(
    cards.flatMap((card) => {
      const body = bodies.get(card.uri);
      return bskyPostUrisInDocument({
        authorDid: card.did,
        content: body?.contentJson ?? null,
        contentFormat: body?.contentFormat ?? null,
        description: card.description,
      });
    }),
  );

  const first = cards[0];
  return {
    authors: options.authors ?? collectAuthors(cards),
    chapters: cards.map((card, index) =>
      chapterFromCard(
        card,
        bodies.get(card.uri),
        index,
        options.baseUrl,
        posts,
      ),
    ),
    coverImageUrl: options.coverImageUrl ?? first?.coverImageUrl ?? null,
    description: options.description ?? null,
    identifier: options.identifier,
    modified: newestTimestamp(cards, new Date(0).toISOString()),
    published: first?.publishedAt ?? null,
    publisher: options.publisher ?? "Standard Reader",
    sourceUrl: options.sourceUrl ?? null,
    subjects:
      options.subjects ??
      [...new Set(cards.flatMap((c) => c.tags ?? []))].slice(0, 12),
    subtitle: options.subtitle ?? null,
    title: options.title,
  };
}

/**
 * A filename a reader will recognise on their device.
 *
 * Kept ASCII and punctuation-free: these files travel to e-readers over USB,
 * SD cards and FTP, through filesystems that still disagree about everything
 * except `[A-Za-z0-9._-]`.
 */
export function bookFilename(title: string, extension: string): string {
  const slug = title
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036F]/gu, "")
    .replaceAll(/[^\w\s-]/gu, "")
    .trim()
    .replaceAll(/\s+/gu, "-")
    .slice(0, 80)
    .replaceAll(/^-+|-+$/gu, "");
  return `${slug || "standard-reader"}${extension}`;
}

/**
 * Read-model rows as OPDS entries.
 *
 * One rule shapes all of this: **an acquisition link is a promise**. A catalog
 * client shows a download button for every acquisition link it sees, and a
 * button that 404s is worse than no button. So an article only gets an EPUB
 * link when it has a body worth packaging (`hasRenderableBody`). Everything else
 * still appears — with an `alternate` link out to the web.
 *
 * Comics do not come through here at all: their documents are pages rather than
 * issues, so they are built from the shelf instead (`server/opds/comics.ts`).
 */

import type {
  ArticleCard,
  PublicationCard,
} from "#/integrations/tanstack-query/api-shapes";
import type {
  OpdsAcquisition,
  OpdsNavigationEntry,
  OpdsPublicationEntry,
} from "#/lib/opds/model";
import { EPUB_TYPE } from "#/lib/opds/model";
import {
  articleEpubUrl,
  opdsPublicationUrl,
  publicationEpubUrl,
} from "#/lib/opds/urls";
import { cardByline, cardSourceUrl } from "#/server/books/sources";

/** `at://did/collection/rkey` → `rkey`, for building download URLs. */
function rkeyOf(uri: string): string | null {
  const rkey = uri.split("/").pop();
  return rkey || null;
}

export function articleEntry(
  card: ArticleCard,
  baseUrl: string,
): OpdsPublicationEntry {
  const rkey = rkeyOf(card.uri);
  const acquisitions: Array<OpdsAcquisition> = [];

  if (rkey && card.hasRenderableBody) {
    acquisitions.push({
      href: articleEpubUrl(baseUrl, card.did, rkey),
      title: "EPUB",
      type: EPUB_TYPE,
    });
  }

  const byline = cardByline(card);
  return {
    acquisitions,
    authors: byline
      ? [
          {
            name: byline,
            uri: `${baseUrl}/u/${encodeURIComponent(card.publicationOwnerDid ?? card.did)}`,
          },
        ]
      : [],
    categories: card.tags ?? [],
    coverImageUrl: card.coverImageUrl,
    id: card.uri,
    published: card.publishedAt,
    publisher: card.publicationName,
    summary: card.description,
    thumbnailUrl: card.coverImageUrl,
    title: card.title,
    updated: card.publishedAt,
    webUrl: cardSourceUrl(card, baseUrl),
  };
}

/**
 * A publication as a navigation entry — a shelf to open, not a file to take.
 *
 * The whole-publication EPUB lives on the publication's own feed rather than
 * here: navigation entries carry one link, and "browse the issues" is the more
 * useful of the two.
 */
export function publicationNavEntry(
  publication: PublicationCard,
  baseUrl: string,
  updated: string,
): OpdsNavigationEntry {
  const rkey = rkeyOf(publication.uri) ?? "";
  const icon = publication.iconUrl ?? publication.ownerAvatarUrl;
  return {
    href: opdsPublicationUrl(baseUrl, publication.did, rkey),
    id: publication.uri,
    imageUrl: icon,
    kind: "acquisition",
    summary: publication.description,
    thumbnailUrl: icon,
    title: publication.name,
    updated,
  };
}

/** The "download the whole publication" entry, at the head of its own feed. */
export function publicationBookEntry(
  publication: PublicationCard,
  baseUrl: string,
  { articleCount, updated }: { articleCount: number; updated: string },
): OpdsPublicationEntry {
  const rkey = rkeyOf(publication.uri) ?? "";
  const icon = publication.iconUrl ?? publication.ownerAvatarUrl;
  return {
    acquisitions: [
      {
        href: publicationEpubUrl(baseUrl, publication.did, rkey),
        title: "EPUB",
        type: EPUB_TYPE,
      },
    ],
    authors: publication.ownerHandle
      ? [
          {
            name: publication.ownerHandle,
            uri: `${baseUrl}/u/${encodeURIComponent(publication.did)}`,
          },
        ]
      : [],
    coverImageUrl: icon,
    id: `${publication.uri}#book`,
    publisher: publication.name,
    summary:
      publication.description ??
      `The ${articleCount} most recent articles from ${publication.name}, as one book.`,
    thumbnailUrl: icon,
    title: `${publication.name} — recent articles`,
    updated,
  };
}

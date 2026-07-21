import { collectionPieceReadUrl } from "#/components/reader/format";
import { collectionMarkpubContent } from "#/lib/markpub/collection-fields.ts";

import type { CollectionColophon, CollectionEditorial } from "./manifest.ts";

/**
 * The portable representation of a collection: a markpub-flavored newsletter
 * that renders as ordinary content off-platform. Per the product decision the
 * body is "note + title + link" — it does not reproduce others' full articles.
 *
 * Client-safe; the API layer resolves each item's title/byline/url from the
 * read-model and passes them in here.
 */

export interface NewsletterItem {
  title: string;
  byline?: string | null;
  url?: string | null;
  /** The curator's optional markdown note for this piece. */
  note?: string | null;
}

/** Card fields needed to resolve a collection piece's "Read the piece →" URL. */
export interface CollectionNewsletterCard {
  uri: string;
  title: string;
  publicationName: string | null;
  hasRenderableBody: boolean;
  canonicalUrl: string | null;
}

export function newsletterItemsFromManifest(input: {
  manifestItems: Array<{ document: string; note?: string | null }>;
  cardsByUri: Map<string, CollectionNewsletterCard>;
  baseUrl: string;
}): Array<NewsletterItem> {
  return input.manifestItems.map((item) => {
    const card = input.cardsByUri.get(item.document);
    return {
      title: card?.title ?? "Untitled",
      byline: card?.publicationName ?? null,
      url: card ? collectionPieceReadUrl(card, input.baseUrl) : null,
      note: item.note,
    };
  });
}

/** Build markpub content for a collection from its manifest + indexed cards. */
export function composeCollectionNewsletterContent(input: {
  editorial?: CollectionEditorial;
  colophon?: CollectionColophon;
  manifestItems: Array<{ document: string; note?: string | null }>;
  cardsByUri: Map<string, CollectionNewsletterCard>;
  baseUrl: string;
  omitColophon?: boolean;
}): Record<string, unknown> {
  return collectionMarkpubContent(
    composeCollectionNewsletter({
      editorial: input.editorial,
      colophon: input.colophon,
      items: newsletterItemsFromManifest(input),
      omitColophon: input.omitColophon,
    }),
  );
}

/** Prefix every line so multi-line markdown notes render as one blockquote. */
function blockquote(markdown: string): string {
  return markdown
    .trim()
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
}

/** Build the newsletter markdown body for a collection. */
export function composeCollectionNewsletter(input: {
  editorial?: CollectionEditorial;
  colophon?: CollectionColophon;
  items: Array<NewsletterItem>;
  /** When true, omit colophon from the body (rendered separately in-app). */
  omitColophon?: boolean;
}): string {
  const parts: Array<string> = [];

  const editorialTitle = input.editorial?.title?.trim();
  const editorialBody = input.editorial?.body?.trim();
  if (editorialTitle) parts.push(`## ${editorialTitle}`);
  if (editorialBody) parts.push(editorialBody);
  if (editorialTitle || editorialBody) parts.push("---");

  for (let index = 0; index < input.items.length; index++) {
    const item = input.items[index];
    const byline = item.byline?.trim();
    parts.push(
      `### ${index + 1}. ${item.title}${byline ? ` — ${byline}` : ""}`,
    );
    const note = item.note?.trim();
    if (note) parts.push(blockquote(note));
    if (item.url) parts.push(`[Read the piece →](${item.url})`);
  }

  const colophonBody =
    !input.omitColophon && input.colophon?.body?.trim()
      ? input.colophon.body.trim()
      : null;
  if (colophonBody) {
    parts.push("---", colophonBody);
  }

  return `${parts.join("\n\n")}\n`;
}

export { collectionMarkpubContent } from "#/lib/markpub/collection-fields.ts";

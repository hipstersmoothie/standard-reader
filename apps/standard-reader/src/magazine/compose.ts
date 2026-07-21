import { articlePublicationUrl } from "#/components/reader/format";
import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import type {
  CollectionColophon,
  CollectionEditorial,
} from "#/lib/collections/manifest";
import type { CollectionTheme } from "#/lib/collections/theme";
import { parseArticleBlocks } from "#/lib/document/blocks";
import { resolveArticleHeroImage } from "#/lib/document/lead-image";

import type { MagIssue, MagMeta } from "./types";

const WORDS_PER_MINUTE = 220;

function rkeyFromUri(uri: string): string {
  const parts = uri.split("/");
  return parts.at(-1) ?? "";
}

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function readingMinutes(article: ArticleDetail): number {
  const text =
    article.textContent ??
    parseArticleBlocks({
      textContent: article.textContent,
      contentJson: article.contentJson,
    })
      .map((b) => b.text)
      .join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function bylineAuthor(article: ArticleDetail): string {
  const contributor = article.contributors.find((c) => c.displayName?.trim());
  if (contributor?.displayName) return contributor.displayName;
  if (article.publicationOwnerDisplayName?.trim()) {
    return article.publicationOwnerDisplayName;
  }
  if (article.publicationOwnerHandle?.trim()) {
    return `@${article.publicationOwnerHandle}`;
  }
  return article.publication?.name ?? "Unknown";
}

export function articleMeta(article: ArticleDetail): MagMeta {
  const hero = resolveArticleHeroImage(article);
  return {
    id: article.uri,
    did: article.did,
    rkey: rkeyFromUri(article.uri),
    title: article.title || "Untitled",
    dek: article.description?.trim() || null,
    author: bylineAuthor(article),
    handle: article.publicationOwnerHandle,
    date: formatDate(article.publishedAt),
    minutes: readingMinutes(article),
    pubName: article.publication?.name ?? "Standard Reader",
    topic: article.publication?.topic ?? article.tags?.[0] ?? "Feature",
    coverImageUrl: hero?.url ?? null,
    leadImageFromFirstBlock: hero?.fromFirstBlock ?? false,
    externalUrl: articlePublicationUrl(article),
  };
}

export function composeIssue(
  name: string,
  ownerHandle: string | null,
  articles: Array<ArticleDetail>,
  list?: { did: string; rkey: string; listUri: string | null },
): MagIssue {
  const subscribe =
    list?.listUri == null
      ? null
      : ({
          kind: "list",
          uri: list.listUri,
          name,
          did: list.did,
          rkey: list.rkey,
        } satisfies MagIssue["subscribe"]);

  return {
    name,
    no: "No. 1",
    ownerHandle,
    features: articles.map((detail) => ({ meta: articleMeta(detail), detail })),
    subscribe,
  };
}

/**
 * Compose a magazine issue from a curated collection: editorial intro, the
 * curator's per-piece notes, the collection cover, and the owning publication's
 * theme/fonts. Items keep the manifest's order.
 */
export function composeCollectionIssue(input: {
  name: string;
  publicationName: string | null;
  publicationUri: string | null;
  publicationParams: { did: string; rkey: string } | null;
  ownerHandle: string | null;
  editorial: CollectionEditorial | null;
  colophon: CollectionColophon | null;
  coverImageUrl: string | null;
  theme: CollectionTheme | null;
  documentUri?: string | null;
  recommendCount?: number;
  features: Array<{ detail: ArticleDetail; note?: string | null }>;
}): MagIssue {
  const subscribe =
    input.publicationUri && input.publicationParams
      ? ({
          kind: "publication",
          uri: input.publicationUri,
          name: input.publicationName ?? input.name,
          did: input.publicationParams.did,
          rkey: input.publicationParams.rkey,
        } satisfies MagIssue["subscribe"])
      : null;

  return {
    name: input.name,
    no: "No. 1",
    ownerHandle: input.ownerHandle,
    publicationName: input.publicationName,
    editorial: input.editorial,
    colophon: input.colophon,
    coverImageUrl: input.coverImageUrl,
    theme: input.theme,
    subscribe,
    documentUri: input.documentUri ?? null,
    recommendCount: input.recommendCount ?? 0,
    features: input.features.map((f) => ({
      meta: articleMeta(f.detail),
      detail: f.detail,
      note: f.note ?? null,
    })),
  };
}

import type {
  ArticleContributor,
  ArticleDetail,
} from "#/integrations/tanstack-query/api-publication.functions";
import type {
  Db,
  JsonValue,
  PublicationCard,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import type { CollectionManifest } from "#/lib/collections/manifest";
import type { LeafletCodeBlock } from "#/lib/leaflet/types";
import type { CodeHighlightsByScheme, ThemeMode } from "#/lib/theme";

import { toPublicationCard } from "#/integrations/tanstack-query/api-shapes";
import { composeCollectionNewsletterContent } from "#/lib/collections/compose-newsletter";
import { parseCollectionManifest } from "#/lib/collections/manifest";
import { themeFontsFromJson } from "#/lib/collections/theme";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { leafletBlocks } from "#/lib/leaflet/blocks";
import { LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { offprintBlocks } from "#/lib/offprint/blocks";
import { OFFPRINT_CONTENT } from "#/lib/offprint/types";
import { pcktBlocks, pcktCodeLanguage } from "#/lib/pckt/blocks";
import { PCKT_CONTENT } from "#/lib/pckt/types";
import { getPublicUrl } from "#/lib/public-url";
import { EMPTY_CODE_HIGHLIGHTS } from "#/lib/theme";
import { cdnImageUrl } from "#/server/atproto/blob";
import { resolveAndPersistContent } from "#/server/content/resolve-and-persist";
import { countDocumentComments } from "#/server/reader/document-comments";
import { selectArticleCardsByUris } from "#/server/reader/queries";
import { highlightLeafletCodeBlocks } from "#/server/shiki/highlighter";

/** Row shape shared by single-article and collection bundle queries. */
export interface ArticleDetailSourceRow {
  uri: string;
  did: string;
  title: string;
  description: string | null;
  path: string | null;
  canonicalUrl: string | null;
  coverImageCid: string | null;
  publishedAt: Date;
  recordUpdatedAt: Date | null;
  featured: boolean;
  tags: Array<string> | null;
  contentJson: unknown;
  contentFormat: string | null;
  collectionJson: unknown;
  textContent: string | null;
  bskyPostUri: string | null;
  bskyPostCid: string | null;
  publicationUri: string | null;
  pubUri: string | null;
  pubDid: string | null;
  pubName: string | null;
  pubUrl: string | null;
  pubDescription: string | null;
  pubIconCid: string | null;
  pubThemeBackground: string | null;
  pubThemeForeground: string | null;
  pubThemeAccent: string | null;
  pubThemeAccentForeground: string | null;
  pubThemeJson: unknown;
  pubOwnerAvatarUrl: string | null;
  pubOwnerHandle: string | null;
  pubOwnerDisplayName: string | null;
  pubTopic: string | null;
  pubVerified: boolean | null;
  pubSubscriberCount: number | null;
  pubDocumentCount: number | null;
  pubLastDocumentAt: Date | null;
}

export interface BuildArticleDetailOptions {
  /** Skip recommend/read/comment counts (magazine bundle). */
  skipSocialCounts?: boolean;
  /** Skip newsletter compose for collection manifests (unused for magazine). */
  skipCollectionNewsletterCompose?: boolean;
  readCount?: number;
  recommendCount?: number;
}

async function codeHighlightsForThemeMode(
  blocks: Array<Pick<LeafletCodeBlock, "language" | "plaintext">>,
  themeMode: ThemeMode,
): Promise<CodeHighlightsByScheme> {
  if (blocks.length === 0) return EMPTY_CODE_HIGHLIGHTS;

  if (themeMode === "system") {
    const [light, dark] = await Promise.all([
      highlightLeafletCodeBlocks(blocks, "light"),
      highlightLeafletCodeBlocks(blocks, "dark"),
    ]);
    return { light, dark };
  }

  const single = await highlightLeafletCodeBlocks(blocks, themeMode);
  return themeMode === "dark"
    ? { light: {}, dark: single }
    : { light: single, dark: {} };
}

function publicationFromRow(
  row: ArticleDetailSourceRow,
): PublicationCard | null {
  if (!row.pubUri) return null;
  return toPublicationCard({
    uri: row.pubUri,
    did: row.pubDid ?? row.did,
    name: row.pubName ?? "",
    url: row.pubUrl ?? "",
    description: row.pubDescription,
    iconCid: row.pubIconCid,
    ownerAvatarUrl: row.pubOwnerAvatarUrl,
    ownerHandle: row.pubOwnerHandle,
    topic: row.pubTopic,
    verified: row.pubVerified ?? false,
    subscriberCount: row.pubSubscriberCount,
    documentCount: row.pubDocumentCount,
    lastDocumentAt: row.pubLastDocumentAt,
  });
}

function codeBlocksFromContent(
  contentFormat: string | null,
  resolvedContentFormat: string | null,
  resolvedContentJson: JsonValue | null,
): Array<Pick<LeafletCodeBlock, "language" | "plaintext">> {
  if (contentFormat === LEAFLET_CONTENT && resolvedContentJson) {
    return leafletBlocks(resolvedContentJson)
      .filter((block) => block.kind === "code")
      .map((block) => block.block);
  }
  if (contentFormat === PCKT_CONTENT && resolvedContentJson) {
    return pcktBlocks(resolvedContentJson)
      .filter((block) => block.kind === "code")
      .map((block) => ({
        plaintext: block.block.plaintext,
        language: pcktCodeLanguage(block.block),
      }));
  }
  if (contentFormat === OFFPRINT_CONTENT && resolvedContentJson) {
    return offprintBlocks(resolvedContentJson)
      .filter((block) => block.kind === "code")
      .map((block) => ({
        plaintext: block.plaintext,
        language: block.language,
      }));
  }
  if (
    resolvedContentFormat === STANDARD_MARKDOWN_CONTENT &&
    resolvedContentJson
  ) {
    return [];
  }
  return [];
}

export async function buildArticleDetail(
  db: Db,
  schema: Schema,
  row: ArticleDetailSourceRow,
  contributors: Array<ArticleContributor>,
  authorPdsEndpoint: string | null,
  themeMode: ThemeMode,
  options: BuildArticleDetailOptions = {},
): Promise<ArticleDetail> {
  const publication = publicationFromRow(row);
  const collection = parseCollectionManifest(row.collectionJson);

  const rawContentJson = row.contentJson ?? null;
  const resolved =
    rawContentJson == null
      ? { contentJson: null, contentFormat: row.contentFormat }
      : await resolveAndPersistContent(
          db,
          row.uri,
          row.did,
          rawContentJson,
          row.contentFormat,
          authorPdsEndpoint,
        );
  let resolvedContentJson = resolved.contentJson;
  const resolvedContentFormat = resolved.contentFormat;

  if (
    collection &&
    collection.items.length > 0 &&
    !options.skipCollectionNewsletterCompose
  ) {
    const cards = await selectArticleCardsByUris(
      db,
      schema,
      collection.items.map((item) => item.document),
    );
    resolvedContentJson = composeCollectionNewsletterContent({
      editorial: collection.editorial,
      colophon: collection.colophon,
      manifestItems: collection.items,
      cardsByUri: new Map(cards.map((card) => [card.uri, card])),
      baseUrl: getPublicUrl(),
      omitColophon: true,
    }) as JsonValue;
  }

  const codeBlocks = codeBlocksFromContent(
    row.contentFormat,
    resolvedContentFormat,
    resolvedContentJson,
  );

  const [codeHighlights, commentCount] = await Promise.all([
    codeHighlightsForThemeMode(codeBlocks, themeMode),
    options.skipSocialCounts
      ? Promise.resolve(0)
      : countDocumentComments(db, schema, row.uri),
  ]);

  return {
    uri: row.uri,
    did: row.did,
    authorPds: authorPdsEndpoint,
    title: row.title,
    description: row.description,
    path: row.path,
    canonicalUrl: row.canonicalUrl,
    coverImageUrl: row.coverImageCid
      ? cdnImageUrl(row.did, row.coverImageCid, "jpeg")
      : null,
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.recordUpdatedAt?.toISOString() ?? null,
    featured: row.featured,
    tags: row.tags,
    contentJson: resolvedContentJson,
    contentFormat: resolvedContentFormat,
    codeHighlights,
    textContent: row.textContent,
    bskyPostUri: row.bskyPostUri,
    bskyPostCid: row.bskyPostCid,
    publicationUri: row.publicationUri,
    publication,
    collection,
    collectionTheme: row.pubUri
      ? {
          background: row.pubThemeBackground,
          foreground: row.pubThemeForeground,
          accent: row.pubThemeAccent,
          accentForeground: row.pubThemeAccentForeground,
          fontTitle: themeFontsFromJson(row.pubThemeJson).title,
          fontBody: themeFontsFromJson(row.pubThemeJson).body,
        }
      : null,
    publicationOwnerHandle: row.pubOwnerHandle ?? null,
    publicationOwnerDisplayName: row.pubOwnerDisplayName ?? null,
    contributors,
    readCount: options.readCount ?? 0,
    recommendCount: options.recommendCount ?? 0,
    commentCount,
    moreFrom: [],
    readersAlsoFollow: [],
  };
}

export function manifestFromCollectionRow(
  row: ArticleDetailSourceRow,
): CollectionManifest | null {
  return parseCollectionManifest(row.collectionJson);
}

import {
  publicationRenderedSurfaces,
  publicationThemeFromRow,
} from "#/components/reader/publication-theme-scale";
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
import { toPublicationCard } from "#/integrations/tanstack-query/api-shapes";
import { composeCollectionNewsletterContent } from "#/lib/collections/compose-newsletter";
import type { CollectionManifest } from "#/lib/collections/manifest";
import { parseCollectionManifest } from "#/lib/collections/manifest";
import { themeFontsFromJson } from "#/lib/collections/theme";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { leafletBlocks } from "#/lib/leaflet/blocks";
import type { LeafletCodeBlock } from "#/lib/leaflet/types";
import { LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { extractMarkdownCodeBlocks } from "#/lib/markdown/extract-code-blocks";
import { offprintBlocks } from "#/lib/offprint/blocks";
import { OFFPRINT_CONTENT } from "#/lib/offprint/types";
import { pcktBlocks, pcktCodeLanguage } from "#/lib/pckt/blocks";
import { PCKT_CONTENT } from "#/lib/pckt/types";
import { getPublicUrl } from "#/lib/public-url";
import type { CodeHighlightsByScheme, ThemeSchemeMode } from "#/lib/theme";
import { EMPTY_CODE_HIGHLIGHTS } from "#/lib/theme";
import { cdnImageUrl } from "#/server/atproto/blob";
import { publicationFontsFromThemeJson } from "#/server/fonts/publication-fonts.server";
import { countDocumentComments } from "#/server/reader/document-comments";
import { publicationBackgroundImage } from "#/server/reader/publication-background";
import { selectArticleCardsByUris } from "#/server/reader/queries";
import { highlightLeafletCodeBlocks } from "#/server/shiki/highlighter";
import { pickCodeTheme } from "#/server/shiki/match-theme";

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
  /** `preferences.prevNextDirection` + the derived serial kind — drive the
   * serial reading experience (comic reader / "Up next"). */
  pubPrevNextDirection: string | null;
  pubSerialKind: string | null;
  pubSubscriberCount: number | null;
  pubDocumentCount: number | null;
  pubLastDocumentAt: Date | null;
}

export interface BuildArticleDetailOptions {
  /**
   * Match the code theme to the publication's palette. Only set when the reader
   * opted into publication themes — otherwise their code blocks would take a
   * publication's colours while the rest of the page stayed editorial.
   */
  usePublicationTheme?: boolean;
  /** Skip recommend/read/comment counts (magazine bundle). */
  skipSocialCounts?: boolean;
  /** Skip newsletter compose for collection manifests (unused for magazine). */
  skipCollectionNewsletterCompose?: boolean;
  readCount?: number;
  recommendCount?: number;
}

async function codeHighlightsForThemeMode(
  blocks: Array<Pick<LeafletCodeBlock, "language" | "plaintext">>,
  themeMode: ThemeSchemeMode,
  codeTheme: {
    accent: string | null;
    surfaces: ReturnType<typeof publicationRenderedSurfaces>;
  } | null,
): Promise<CodeHighlightsByScheme> {
  if (blocks.length === 0) return EMPTY_CODE_HIGHLIGHTS;

  // Match a bundled Shiki theme to the publication's palette so code blocks read
  // as part of the page rather than a foreign panel dropped into it. Scored
  // against the *rendered* surface for that scheme — the stated background can
  // belong to the other mode entirely. Null keeps the editorial theme.
  const themeFor = async (scheme: "light" | "dark") =>
    codeTheme
      ? ((await pickCodeTheme(
          {
            background: codeTheme.surfaces[scheme].background,
            foreground: codeTheme.surfaces[scheme].foreground,
            accent: codeTheme.accent,
          },
          scheme,
        )) ?? undefined)
      : undefined;

  if (themeMode === "system") {
    const [lightTheme, darkTheme] = await Promise.all([
      themeFor("light"),
      themeFor("dark"),
    ]);
    const [light, dark] = await Promise.all([
      highlightLeafletCodeBlocks(blocks, "light", lightTheme),
      highlightLeafletCodeBlocks(blocks, "dark", darkTheme),
    ]);
    return { light, dark };
  }

  const single = await highlightLeafletCodeBlocks(
    blocks,
    themeMode,
    await themeFor(themeMode),
  );
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
    prevNextDirection: row.pubPrevNextDirection,
    serialKind: row.pubSerialKind,
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
    resolvedContentJson &&
    typeof resolvedContentJson === "object" &&
    !Array.isArray(resolvedContentJson) &&
    typeof resolvedContentJson.text === "string"
  ) {
    return extractMarkdownCodeBlocks(resolvedContentJson.text);
  }
  return [];
}

export async function buildArticleDetail(
  db: Db,
  schema: Schema,
  row: ArticleDetailSourceRow,
  contributors: Array<ArticleContributor>,
  themeMode: ThemeSchemeMode,
  options: BuildArticleDetailOptions = {},
): Promise<ArticleDetail> {
  const publication = publicationFromRow(row);
  const collection = parseCollectionManifest(row.collectionJson);

  const rawContentJson = row.contentJson ?? null;
  let resolvedContentJson = rawContentJson as JsonValue | null;
  const resolvedContentFormat = row.contentFormat;

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

  // Resolved through the publisher's native theme so Leaflet/PCKT/Offprint
  // publications contribute their real surface colors (and authored dark
  // palette), not just the flattened `basicTheme` baseline. Resolved before the
  // highlight pass because it also picks the code theme.
  const publicationTheme = publicationThemeFromRow({
    themeBackground: row.pubThemeBackground,
    themeForeground: row.pubThemeForeground,
    themeAccent: row.pubThemeAccent,
    themeAccentForeground: row.pubThemeAccentForeground,
    themeJson: row.pubThemeJson,
  });

  const [codeHighlights, commentCount] = await Promise.all([
    codeHighlightsForThemeMode(
      codeBlocks,
      themeMode,
      options.usePublicationTheme
        ? {
            accent: publicationTheme.themeAccent,
            surfaces: publicationRenderedSurfaces(publicationTheme),
          }
        : null,
    ),
    options.skipSocialCounts
      ? Promise.resolve(0)
      : countDocumentComments(db, schema, row.uri),
  ]);
  const publicationFonts = await publicationFontsFromThemeJson(
    row.pubThemeJson,
  );

  return {
    uri: row.uri,
    did: row.did,
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
          background: publicationTheme.themeBackground,
          foreground: publicationTheme.themeForeground,
          accent: publicationTheme.themeAccent,
          accentForeground: publicationTheme.themeAccentForeground,
          dark: publicationTheme.dark ?? null,
          surface: publicationTheme.surface ?? null,
          surfaceHover: publicationTheme.surfaceHover ?? null,
          border: publicationTheme.border ?? null,
          canvas: publicationTheme.canvas ?? null,
          publicationFonts,
          publicationBackgroundImage: publicationBackgroundImage(
            row.pubThemeJson,
            row.pubDid ?? row.did,
          ),
          // The sidecar `app.standard-reader.publicationTheme` fonts still win
          // for collections/magazine rendering; `publicationFonts` is the
          // platform-native pair used by the reader's publication theming.
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

import { eq } from "drizzle-orm";

import type { PublicationThemeColors } from "#/components/reader/publication-theme-scale";
import { publicationThemeFromRow } from "#/components/reader/publication-theme-scale";
import type {
  Db,
  ProfileSummary,
  PublicationCard,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import {
  publicationCardColumns,
  toPublicationCard,
} from "#/integrations/tanstack-query/api-shapes";
import { publicationFontsFromThemeJson } from "#/server/fonts/publication-fonts.server";
import { publicationBackgroundImage } from "#/server/reader/publication-background";

export interface PublicationHeader {
  publication: PublicationCard;
  owner: ProfileSummary;
  /**
   * The publication's own `site.standard.theme.basic` colors, flattened. Only
   * used to repaint the profile page when the reader opted into publication
   * themes (`user.use_publication_theme`); selected here rather than through
   * `getPublicationEmbedMeta` so the palette lands in the same round trip as
   * the header and the page paints themed on the first frame.
   */
  theme: PublicationThemeColors;
}

export async function selectPublicationHeader(
  db: Db,
  schema: Schema,
  publicationUri: string,
): Promise<PublicationHeader | null> {
  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;

  const [row] = await db
    .select({
      ...publicationCardColumns(schema),
      ownerHandle: pr.handle,
      ownerDisplayName: pr.displayName,
      ownerDescription: pr.description,
      ownerBannerUrl: pr.bannerUrl,
      ownerIsBot: pr.isBot,
      themeBackground: p.themeBackground,
      themeForeground: p.themeForeground,
      themeAccent: p.themeAccent,
      themeAccentForeground: p.themeAccentForeground,
      themeJson: p.themeJson,
    })
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(eq(p.uri, publicationUri))
    .limit(1);

  if (!row) return null;

  return {
    publication: toPublicationCard(row),
    owner: {
      did: row.did,
      handle: row.ownerHandle,
      displayName: row.ownerDisplayName,
      description: row.ownerDescription,
      avatarUrl: row.ownerAvatarUrl,
      bannerUrl: row.ownerBannerUrl,
      isBot: row.ownerIsBot ?? false,
    },
    theme: {
      ...publicationThemeFromRow(row),
      fonts: await publicationFontsFromThemeJson(row.themeJson),
      backgroundImage: publicationBackgroundImage(row.themeJson, row.did),
    },
  };
}

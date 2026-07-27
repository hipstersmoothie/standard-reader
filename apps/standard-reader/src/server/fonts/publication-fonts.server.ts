/**
 * Resolves the fonts stated in a publication's native theme into Google Fonts
 * families, using the shared catalog cache.
 *
 * Kept off the synchronous `publicationThemeFromRow` colour path because the
 * catalog is fetched (and cached) asynchronously — the two call sites that need
 * fonts are already async.
 */
import type { PublicationFonts } from "#/lib/publication-fonts";
import {
  NO_PUBLICATION_FONTS,
  publicationFontRequests,
  resolvePublicationFonts,
} from "#/lib/publication-fonts";

import { googleFontLookup } from "./google-catalog.server";

/** Pull `nativeTheme` out of a `publications.theme_json` blob. */
function nativeThemeOf(themeJson: unknown): unknown {
  if (!themeJson || typeof themeJson !== "object") return null;
  return (themeJson as Record<string, unknown>).nativeTheme ?? null;
}

export async function publicationFontsFromThemeJson(
  themeJson: unknown,
): Promise<PublicationFonts> {
  const requests = publicationFontRequests(nativeThemeOf(themeJson));
  if (!requests.heading && !requests.body) return NO_PUBLICATION_FONTS;
  const lookup = await googleFontLookup();
  return resolvePublicationFonts(requests, lookup);
}

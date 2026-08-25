import type { PublicationEmbedMeta } from "#/integrations/tanstack-query/api-publication.functions";
import type { QuoteOgColors } from "#/lib/publication-theme";
import { resolveQuoteOgColors } from "#/lib/publication-theme";

export function publicationThemeColors(
  meta: PublicationEmbedMeta,
): QuoteOgColors {
  return resolveQuoteOgColors({
    themeBackground: meta.themeBackground,
    themeForeground: meta.themeForeground,
    themeAccent: meta.themeAccent,
    themeAccentForeground: meta.themeAccentForeground,
  });
}

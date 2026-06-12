import type { PublicationEmbedMeta } from "#/integrations/tanstack-query/api-publication.functions";
import type { QuoteOgColors } from "#/lib/publication-theme";
import type { CSSProperties } from "react";

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

/** Theme tokens for subscribe card CSS variables. */
export function publicationThemeVars(colors: QuoteOgColors): CSSProperties {
  return {
    "--sub-bg": colors.background,
    "--sub-fg": colors.foreground,
    "--sub-muted": colors.muted,
    "--sub-accent": colors.accent,
    "--sub-accent-fg": colors.accentForeground,
    "--sub-line": colors.line,
  } as CSSProperties;
}

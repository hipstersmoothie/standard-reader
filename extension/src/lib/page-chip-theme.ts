import type { PublicationThemeInput } from "#/lib/publication-theme";
import type { CSSProperties } from "react";

import { resolveQuoteOgColors } from "#/lib/publication-theme";

export function pageChipThemeVars(theme: PublicationThemeInput): CSSProperties {
  const colors = resolveQuoteOgColors(theme);
  return {
    "--chip-accent": colors.accent,
    "--chip-accent-fg": colors.accentForeground,
    "--chip-accent-subtle": colors.accentSubtle,
    "--chip-accent-subtle-fg": colors.accentSubtleFg,
    "--chip-bg": colors.background,
    "--chip-fg": colors.foreground,
    "--chip-hover-bg": colors.hoverBg,
    "--chip-hover-fg": colors.hoverFg,
    "--chip-line": colors.line,
    "--chip-muted": colors.muted,
  } as CSSProperties;
}

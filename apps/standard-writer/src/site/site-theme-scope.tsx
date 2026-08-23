"use client";

import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import type { PublicationThemeColors } from "@standard-reader/publication-theme/scale";
import {
  hasPublicationThemeColors,
  publicationThemeScaleVars,
} from "@standard-reader/publication-theme/scale";
import {
  publicationFonts,
  publicationLink,
  publicationPrimary,
  publicationUi,
} from "@standard-reader/publication-theme/tokens";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { useMemo } from "react";

/**
 * Paints a standalone site in its own colors.
 *
 * The same generator and the same token themes the in-app publication pages
 * use — so a publisher's palette reads identically in both places — but applied
 * unconditionally and over the whole viewport rather than the content column.
 * On a site there is no app chrome left for the theme to sit inside: the page
 * *is* the publication's, so its background is the browser's background.
 *
 * Unlike `PublicationThemeScope`, this deliberately ignores the reader's
 * "use publication themes" preference. That preference is about how much of
 * somebody else's design to allow into the reader's own app; a site is not the
 * reader's app.
 *
 * With no colors stated the wrapper still renders — as a plain box on the
 * editorial palette it inherits from `<body>` — so the DOM shape is the same
 * either way and nothing shifts between a themed and an unthemed site.
 */
export function SiteThemeScope({
  children,
  theme,
}: {
  children: ReactNode;
  theme: PublicationThemeColors | null;
}) {
  const themed = hasPublicationThemeColors(theme);
  const vars = useMemo(
    () => (themed && theme ? publicationThemeScaleVars(theme) : null),
    [theme, themed],
  );

  if (!vars) {
    return <div {...stylex.props(styles.page)}>{children}</div>;
  }

  return (
    <div
      {...stylex.props(
        publicationUi,
        publicationPrimary,
        publicationLink,
        publicationFonts,
        styles.page,
      )}
      style={vars}
    >
      {children}
    </div>
  );
}

const styles = stylex.create({
  page: {
    color: uiColor.text2,
    // The site owns the whole viewport, not a column inside one: fill it even
    // when the archive is one post long, so the theme's paper reaches the
    // bottom of the window instead of stopping mid-screen.
    display: "flex",
    flexDirection: "column",
    backgroundColor: uiColor.bg,
    minHeight: "100dvh",
  },
});

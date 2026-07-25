"use client";

import * as stylex from "@stylexjs/stylex";
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef } from "react";
import { UNSAFE_PortalProvider } from "react-aria";

import { publicationFontsHref } from "#/lib/publication-fonts";
import { usePublicationThemePreference } from "#/lib/use-publication-theme-preference";

import { uiColor } from "../../design-system/theme/color.stylex";
import type { PublicationThemeColors } from "./publication-theme-scale";
import {
  hasPublicationThemeColors,
  publicationThemeScaleVars,
} from "./publication-theme-scale";
import {
  publicationFonts,
  publicationLink,
  publicationPrimary,
  publicationUi,
} from "./publication-theme-tokens";

/**
 * The loader-data key a route sets to opt its page into publication theming.
 * Any route that returns `publicationTheme` from its loader gets repainted in
 * those colors — the shell reads it off the deepest match rather than the route
 * passing it down, so the theme is known before the page renders (no
 * apply-on-effect flash) and the site footer can sit inside the themed region.
 */
export interface PublicationThemedLoaderData {
  publicationTheme?: PublicationThemeColors | null;
}

function usePublicationThemeColors(): PublicationThemeColors | null {
  return useRouterState({
    select: (state) => {
      const data = state.matches.at(-1)?.loaderData as
        | PublicationThemedLoaderData
        | undefined;
      return data?.publicationTheme ?? null;
    },
  });
}

/**
 * Repaints the page in a publication's own colors when the reader has opted
 * into publication themes (`user.use_publication_theme`).
 *
 * The wrapper carries the `publicationUi` / `publicationPrimary` StyleX themes —
 * which override the design-system `uiColor` / `primaryColor` tokens — plus the
 * `--pub-*` custom properties those themes read. Everything inside therefore
 * picks up the publication's palette without knowing anything about theming.
 *
 * Only the content column is themed; the sidebar and mobile bar stay Standard
 * Reader chrome. When the preference is off, or the route published no colors,
 * this renders its children untouched so the DOM matches the unthemed page.
 *
 * Overlays (hover cards, popovers, menus, tooltips, modals) portal to
 * `document.body` by default, which would drop them right back onto the app's
 * own tokens. `UNSAFE_PortalProvider` re-points that portal at this container
 * instead, so they inherit the publication's palette the same way inline content
 * does — no per-component theming.
 */
export function PublicationThemeScope({ children }: { children: ReactNode }) {
  const { enabled } = usePublicationThemePreference();
  const colors = usePublicationThemeColors();
  const scopeRef = useRef<HTMLDivElement | null>(null);
  const getContainer = useCallback(() => scopeRef.current, []);

  const scaleVars = useMemo(
    () =>
      hasPublicationThemeColors(colors)
        ? publicationThemeScaleVars(colors)
        : null,
    [colors],
  );

  // Only the families that actually resolved get a variable; the rest fall back
  // to the editorial stack baked into `publicationFonts`.
  const fonts = colors?.fonts ?? null;
  const fontVars = useMemo(() => {
    const vars: Record<string, string> = {};
    if (fonts?.heading) vars["--pub-font-title"] = `'${fonts.heading}'`;
    if (fonts?.body) vars["--pub-font-body"] = `'${fonts.body}'`;
    return vars;
  }, [fonts]);
  const fontsHref = useMemo(() => publicationFontsHref(fonts), [fonts]);

  if (!enabled || !scaleVars) {
    return <>{children}</>;
  }

  return (
    <div
      ref={scopeRef}
      {...stylex.props(
        publicationUi,
        publicationPrimary,
        publicationLink,
        publicationFonts,
        styles.scope,
      )}
      style={{ ...scaleVars, ...fontVars }}
    >
      {fontsHref ? (
        <link rel="stylesheet" href={fontsHref} referrerPolicy="no-referrer" />
      ) : null}
      <UNSAFE_PortalProvider getContainer={getContainer}>
        {children}
      </UNSAFE_PortalProvider>
    </div>
  );
}

const styles = stylex.create({
  scope: {
    // Stand in for the content column this replaces as a flex child of the app
    // shell's scroller, so wrapping doesn't shift the page's layout…
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
    // …and paint the publication's background across the whole column, since
    // the shell behind it is still painted in the app's own theme.
    backgroundColor: uiColor.bg,
    color: uiColor.text2,
  },
});

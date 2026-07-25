"use client";

import * as stylex from "@stylexjs/stylex";
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef } from "react";
import { UNSAFE_PortalProvider } from "react-aria";

import { publicationFontsHref } from "#/lib/publication-fonts";
import { usePublicationThemePreference } from "#/lib/use-publication-theme-preference";

import { uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import { verticalSpace } from "../../design-system/theme/semantic-spacing.stylex";
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
export function PublicationThemeScope({
  children,
  footer,
}: {
  children: ReactNode;
  /**
   * Site chrome that must sit *outside* the page card but still inside the
   * themed region — it gets its own opaque surface so the canvas image never
   * shows behind it.
   */
  footer?: ReactNode;
}) {
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

  // Leaflet paints a page over a canvas; with a background image the canvas is
  // what shows around the page. Rather than restructure the column, the scope
  // takes the image (fixed to the viewport, so it doesn't scroll with content)
  // and hands the opaque page colour inward via `--pub-page-surface`, which
  // `ReaderContent` picks up. Everything else stays exactly where it was.
  const image = colors?.backgroundImage ?? null;
  const imageVars = useMemo(() => {
    if (!image) return {};
    const vars: Record<string, string> = {
      "--pub-canvas-image": `url("${image.url}")`,
      "--pub-canvas-repeat": image.repeat ? "repeat" : "no-repeat",
      "--pub-canvas-size": image.repeat
        ? image.width
          ? `${image.width}px auto`
          : "auto"
        : "cover",
    };
    if (colors?.canvas) vars["--pub-canvas-color"] = colors.canvas;
    return vars;
  }, [image, colors?.canvas]);

  if (!enabled || !scaleVars) {
    return (
      <>
        {children}
        {footer}
      </>
    );
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
        image ? styles.scopeWithCanvasImage : styles.scopeFlat,
      )}
      style={{ ...scaleVars, ...fontVars, ...imageVars }}
    >
      {fontsHref ? (
        <link rel="stylesheet" href={fontsHref} referrerPolicy="no-referrer" />
      ) : null}
      <UNSAFE_PortalProvider getContainer={getContainer}>
        {children}
        {footer && image ? (
          <div {...stylex.props(styles.footerSurface)}>{footer}</div>
        ) : (
          footer
        )}
      </UNSAFE_PortalProvider>
    </div>
  );
}

const styles = stylex.create({
  scope: {
    // Stand in for the content column this replaces as a flex child of the app
    // shell's scroller, so wrapping doesn't shift the page's layout.
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
    color: uiColor.text2,
  },
  /** No canvas image: the column is simply the publication's page colour. */
  scopeFlat: {
    backgroundColor: uiColor.bg,
  },
  /**
   * With a canvas image the column becomes the canvas, and `ReaderContent` takes
   * the page colour instead (via `--pub-page-surface`) so the image shows around
   * it. `background-attachment: fixed` pins the image to the viewport, so it
   * stays put while the page scrolls.
   */
  scopeWithCanvasImage: {
    backgroundAttachment: "fixed",
    backgroundColor: `var(--pub-canvas-color, ${uiColor.bg})`,
    backgroundImage: "var(--pub-canvas-image)",
    backgroundPosition: "center center",
    backgroundRepeat: "var(--pub-canvas-repeat)",
    backgroundSize: "var(--pub-canvas-size)",
    // Published for `publicationPageCard` below. Only set in this branch, so a
    // page card is inert unless there's actually a canvas to frame it against.
    "--pub-page-surface": uiColor.bg,
    "--pub-page-radius": radius.lg,
    "--pub-page-inset": verticalSpace["10xl"],
    "--pub-page-border": uiColor.border1,
    "--pub-page-border-width": "1px",
    "--pub-page-content-top": verticalSpace["8xl"],
    "--pub-page-content-bottom": verticalSpace["10xl"],
    // Narrower than the 1320px reading shell so the canvas frames the page on
    // desktop instead of being squeezed to a sliver at the very edges.
    "--pub-page-max-width": "1080px",
  },
  /** Footer sits on the page colour, not the canvas image. */
  footerSurface: {
    backgroundColor: uiColor.bg,
  },
});

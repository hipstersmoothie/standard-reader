"use client";

import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { verticalSpace } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import * as stylex from "@stylexjs/stylex";
import { useRouterState } from "@tanstack/react-router";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UNSAFE_PortalProvider } from "react-aria";
import { createPortal } from "react-dom";

import { publicationFontsHref } from "#/lib/publication-fonts";
import { usePublicationThemePreference } from "#/lib/use-publication-theme-preference";

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
 * the themed wrapper is dropped and what's left is the same page structure —
 * the inner surface stays either way, so nothing shifts as themes go on and off.
 *
 * Overlays (hover cards, popovers, menus, tooltips, modals) portal to
 * `document.body` by default, which would drop them right back onto the app's
 * own tokens. `UNSAFE_PortalProvider` re-points that portal at a second copy of
 * the same themed wrapper — `OverlayHost` below — so they inherit the
 * publication's palette the same way inline content does, with no
 * per-component theming.
 *
 * That host deliberately lives at the end of `document.body` rather than inside
 * this container. React Aria positions an overlay against its *containing
 * block*, and inside the page that would be the app shell's `<main>`
 * (`position: relative`, offset by the sidebar and as tall as the whole
 * document). Its fit-to-viewport math then mixes that block's document-space
 * coordinates with the viewport-space body boundary, which pushes menus past
 * the right edge of the window and collapses them to `max-height: 0` once the
 * page is scrolled. Portaling to the body keeps the containing block the
 * viewport, which is the geometry React Aria expects.
 */
export function PublicationThemeScope({
  above,
  children,
  contentRef,
  footer,
}: {
  /**
   * Chrome that belongs inside the themed region but must not move with the
   * page: the pull-to-refresh indicator, which the content is dragged away
   * from. Being in here is what makes it wear the publication's colors, and
   * what puts the publication's own background — not the app's — in the gap the
   * pull opens.
   */
  above?: ReactNode;
  children: ReactNode;
  /**
   * The page surface, everything the pull gesture drags. Wrapped in its own
   * element so the themed background it slides over stays where it is.
   */
  contentRef?: RefObject<HTMLDivElement | null>;
  /**
   * Site chrome that must sit *outside* the page card but still inside the
   * themed region — it gets its own opaque surface so the canvas image never
   * shows behind it.
   */
  footer?: ReactNode;
}) {
  const { enabled } = usePublicationThemePreference();
  const colors = usePublicationThemeColors();
  const overlayHostRef = useRef<HTMLDivElement | null>(null);
  const getContainer = useCallback(() => overlayHostRef.current, []);

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

  const themed = enabled && scaleVars !== null;

  // The page and its footer travel together under `contentRef`; `above` stays
  // behind. Themed or not, the DOM shape is the same, so a page can't shift
  // when the reader turns publication themes on.
  const content = (
    <>
      {above}
      <div ref={contentRef} {...stylex.props(styles.content)}>
        {children}
        {footer && themed && image ? (
          <div {...stylex.props(styles.footerSurface)}>{footer}</div>
        ) : (
          footer
        )}
      </div>
    </>
  );

  if (!themed || !scaleVars) {
    return content;
  }

  const themeVars = { ...scaleVars, ...fontVars };

  return (
    <div
      {...stylex.props(
        publicationUi,
        publicationPrimary,
        publicationLink,
        publicationFonts,
        styles.scope,
        image ? styles.scopeWithCanvasImage : styles.scopeFlat,
      )}
      style={{ ...themeVars, ...imageVars }}
    >
      {fontsHref ? (
        <link rel="stylesheet" href={fontsHref} referrerPolicy="no-referrer" />
      ) : null}
      <OverlayHost ref={overlayHostRef} themeVars={themeVars} />
      <UNSAFE_PortalProvider getContainer={getContainer}>
        {content}
      </UNSAFE_PortalProvider>
    </div>
  );
}

/**
 * The themed container every React Aria overlay portals into. It carries the
 * publication's tokens but none of the page's layout, and sits at the end of
 * `document.body` so overlays resolve their containing block to the viewport —
 * see the note on `PublicationThemeScope`.
 *
 * Rendered only after mount so the first client pass still matches the server
 * HTML; nothing can open an overlay before then.
 */
function OverlayHost({
  ref,
  themeVars,
}: {
  ref: RefObject<HTMLDivElement | null>;
  themeVars: CSSProperties;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      ref={ref}
      {...stylex.props(
        publicationUi,
        publicationPrimary,
        publicationLink,
        publicationFonts,
        styles.overlayHost,
      )}
      style={themeVars}
    />,
    document.body,
  );
}

const styles = stylex.create({
  scope: {
    color: uiColor.text2,
    // Stand in for the content column this replaces as a flex child of the app
    // shell's scroller, so wrapping doesn't shift the page's layout.
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
  },
  /**
   * The page surface: the same flex stand-in the scope itself uses, so wrapping
   * the column costs the layout nothing. Its own element because pull-to-refresh
   * slides it down over the background behind it.
   */
  content: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
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
    "--pub-page-border": uiColor.border1,
    "--pub-page-border-width": "1px",
    "--pub-page-content-bottom": verticalSpace["10xl"],
    "--pub-page-content-top": verticalSpace["8xl"],
    "--pub-page-inset": verticalSpace["10xl"],
    // Narrower than the 1320px reading shell so the canvas frames the page on
    // desktop instead of being squeezed to a sliver at the very edges.
    "--pub-page-max-width": "1080px",
    "--pub-page-radius": radius.lg,
    // Published for `publicationPageCard` below. Only set in this branch, so a
    // page card is inert unless there's actually a canvas to frame it against.
    "--pub-page-surface": uiColor.bg,
    backgroundPosition: "center center",
    backgroundAttachment: "fixed",
    backgroundColor: `var(--pub-canvas-color, ${uiColor.bg})`,
    backgroundImage: "var(--pub-canvas-image)",
    backgroundRepeat: "var(--pub-canvas-repeat)",
    backgroundSize: "var(--pub-canvas-size)",
  },
  /** Footer sits on the page colour, not the canvas image. */
  footerSurface: {
    backgroundColor: uiColor.bg,
  },
  /**
   * Token carrier only — every overlay inside it is positioned, so the host
   * itself must take no space and paint nothing at the end of `<body>`.
   */
  overlayHost: {
    color: uiColor.text2,
    display: "contents",
  },
});

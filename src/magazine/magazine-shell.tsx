import type { CollectionTheme } from "#/lib/collections/theme";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import {
  buildMagazinePalette,
  magazinePaletteCss,
  magazinePaletteInlineStyle,
} from "#/lib/collections/radix-theme";
import { useLayoutEffect, useMemo, useRef } from "react";

import { readMagazineDark } from "./dark-mode";
import { pinElementToVisualViewport } from "./pin-visual-viewport";
import { googleFontsHref, magazineThemeStyle } from "./theme-vars";

const MAGAZINE_DOCUMENT_CHROME_STYLE_ID = "magazine-document-chrome";

function magazineBodyBackdrop(
  theme: CollectionTheme | null | undefined,
  dark: boolean,
): string {
  const palette = buildMagazinePalette(theme);
  const vars = palette ? (dark ? palette.dark : palette.light) : null;
  return (
    vars?.["--ink"] ?? (dark ? "oklch(0.93 0.012 80)" : "oklch(0.245 0.012 60)")
  );
}

/** Shared css for route head (SSR) and the client-managed document chrome style. */
export function magazineDocumentChromeCss(
  theme: CollectionTheme | null | undefined,
  dark: boolean,
): string {
  const bg = magazineBodyBackdrop(theme, dark);
  return `html,body{background-color:${bg}!important;overflow:hidden}`;
}

/** Route head: paint html/body before React mounts the magazine shell. */
export function magazineRouteBackdropStyle(
  theme: CollectionTheme | null | undefined,
): { type: "text/css"; children: string } | null {
  const dark = readMagazineDark(theme);
  return {
    type: "text/css",
    children: magazineDocumentChromeCss(theme, dark),
  };
}

let magazineShellMountCount = 0;
let savedDocumentChrome: {
  htmlOverflow: string;
  bodyOverflow: string;
  htmlBackgroundColor: string;
  bodyBackgroundColor: string;
} | null = null;

function installMagazineDocumentChrome(
  theme: CollectionTheme | null | undefined,
  dark: boolean,
) {
  if (globalThis.document === undefined) return;

  let style = document.getElementById(MAGAZINE_DOCUMENT_CHROME_STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = MAGAZINE_DOCUMENT_CHROME_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = magazineDocumentChromeCss(theme, dark);
  // Leave route-head <style> tags to HeadContent — removing duplicates here
  // races TanStack Router on navigation and throws removeChild errors.

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

function clearMagazineDocumentChrome(
  saved: NonNullable<typeof savedDocumentChrome>,
) {
  if (globalThis.document === undefined) return;

  document.getElementById(MAGAZINE_DOCUMENT_CHROME_STYLE_ID)?.remove();

  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = saved.htmlOverflow;
  body.style.overflow = saved.bodyOverflow;
  html.style.backgroundColor = saved.htmlBackgroundColor;
  body.style.backgroundColor = saved.bodyBackgroundColor;
}

/** Themed `.mag` root — shared by the loading shell and the live viewer. */
export function MagazineShell({
  theme,
  dark,
  children,
  className,
  style,
  ...rest
}: {
  theme: CollectionTheme | null | undefined;
  dark?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
} & HTMLAttributes<HTMLDivElement>) {
  const themePalette = useMemo(() => buildMagazinePalette(theme), [theme]);
  const paletteCss = themePalette ? magazinePaletteCss(themePalette) : null;
  const fontsHref = googleFontsHref(theme);
  const isDark = dark ?? readMagazineDark(theme);
  const isThemed = Boolean(theme?.accent);
  const shellRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    return pinElementToVisualViewport(el);
  }, []);

  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    if (magazineShellMountCount === 0) {
      savedDocumentChrome = {
        htmlOverflow: html.style.overflow,
        bodyOverflow: body.style.overflow,
        htmlBackgroundColor: html.style.backgroundColor,
        bodyBackgroundColor: body.style.backgroundColor,
      };
    }
    magazineShellMountCount += 1;
    return () => {
      magazineShellMountCount -= 1;
      if (magazineShellMountCount === 0 && savedDocumentChrome) {
        const saved = savedDocumentChrome;
        savedDocumentChrome = null;
        requestAnimationFrame(() => {
          if (magazineShellMountCount > 0) return;
          clearMagazineDocumentChrome(saved);
        });
      }
    };
  }, []);

  useLayoutEffect(() => {
    installMagazineDocumentChrome(theme, isDark);
  }, [theme, isDark]);

  return (
    <div
      ref={shellRef}
      className={`mag ${isDark ? "is-dark" : ""} ${isThemed ? "is-themed" : ""}${className ? ` ${className}` : ""}`}
      style={{
        colorScheme: isDark ? "dark" : "light",
        ...magazineThemeStyle(theme),
        ...magazinePaletteInlineStyle(theme, isDark),
        ...style,
      }}
      {...rest}
    >
      {fontsHref ? <link rel="stylesheet" href={fontsHref} /> : null}
      {paletteCss ? (
        // eslint-disable-next-line react/no-danger
        <style dangerouslySetInnerHTML={{ __html: paletteCss }} />
      ) : null}
      {children}
    </div>
  );
}

/** Centered loading chrome — mount inside {@link MagazineShell}. */
export function MagazineBuilding({ label }: { label: string }) {
  return (
    <div className="building" aria-busy="true" aria-label={label}>
      <div>
        <div className="spin" />
        {label}
      </div>
    </div>
  );
}

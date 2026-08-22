/**
 * The web app manifest, built per request so its colors match the theme the
 * reader is actually looking at.
 *
 * This used to be a static `public/manifest.json`. It can't be: Firefox on
 * Android paints an installed PWA's status bar and navigation bar from
 * `theme_color` and never consults the live `<meta name="theme-color">`, so a
 * hardcoded light color framed a dark-mode reader's page in pale bands. The
 * colors come from `PWA_THEME_COOKIE`, which the shell writes pre-paint from
 * the same values it gives the meta tag (see `#/lib/theme`).
 */

import type { PwaThemeColors } from "#/lib/theme";

export interface WebAppManifest {
  id: string;
  short_name: string;
  name: string;
  description: string;
  icons: Array<{
    src: string;
    type: string;
    sizes: string;
    purpose: string;
  }>;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  theme_color: string;
  background_color: string;
  categories: Array<string>;
}

export function buildWebAppManifest(colors: PwaThemeColors): WebAppManifest {
  return {
    id: "/",
    short_name: "Standard Reader",
    name: "Standard Reader",
    description:
      "A warm reader for standard.site publications on the Atmosphere.",
    icons: [
      {
        src: "favicon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "icon-192.png",
        type: "image/png",
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: "icon-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any",
      },
      {
        src: "icon-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: colors.themeColor,
    background_color: colors.backgroundColor,
    categories: ["news", "books"],
  };
}

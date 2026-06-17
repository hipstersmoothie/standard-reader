import type { CollectionTheme } from "#/lib/collections/theme";

import { googleFontsHref } from "./theme-vars";

export type MagazineFontHeadLink = {
  rel: string;
  href: string;
  as?: string;
  type?: string;
  crossOrigin?: "anonymous";
};

/** Preconnect + stylesheet links for a collection theme (route head). */
export function magazineThemeFontHeadLinks(
  theme: CollectionTheme | null | undefined,
): Array<MagazineFontHeadLink> {
  const href = googleFontsHref(theme);
  if (!href) return [];
  return [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    {
      rel: "preconnect",
      href: "https://fonts.gstatic.com",
      crossOrigin: "anonymous",
    },
    { rel: "stylesheet", href },
  ];
}

import type { SiteStyle } from "@standard-reader/site-config";

/**
 * How each style is described in the picker. Plain strings: Standard Writer has
 * no i18n layer yet, unlike the reader — when it grows one these become message
 * descriptors, and this is the only file that has to change.
 */
export const SITE_STYLE_COPY: Record<
  SiteStyle,
  { name: string; description: string }
> = {
  broadsheet: {
    name: "Broadsheet",
    description:
      "A newspaper front page: a masthead over a lead story, with the rest of the archive set in columns beneath it.",
  },
  journal: {
    name: "Journal",
    description:
      "One quiet column, dated entries, and a lot of white space. Reads like a notebook left open.",
  },
  gallery: {
    name: "Gallery",
    description:
      "A grid of covers. Best when the work is what the reader should see first — comics, photo essays, anything illustrated.",
  },
  marquee: {
    name: "Marquee",
    description:
      "A full-height opening title, then selected work and a compact index. The most site-like of the four.",
  },
};

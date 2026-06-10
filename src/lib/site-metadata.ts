/** Shared site copy for `<head>` and social previews. */
export const SITE_NAME = "Standard Reader";

/** Primary meta description — keep under ~160 characters for search snippets. */
export const SITE_DESCRIPTION =
  "Read and discover standard.site publications on the Atmosphere. Follow the writers you love and find new long-form voices across the network.";

/** Shorter line for OG cards and manifest text. */
export const SITE_TAGLINE =
  "A warm reader for standard.site publications on the Atmosphere.";

export const SITE_OG_IMAGE_PATH = "/api/og/site";

export function siteOgImageUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}${SITE_OG_IMAGE_PATH}`;
}

/**
 * Static OG card copy for the main routes, keyed by the slug used in
 * `/api/og/page/$slug`. `title` is the card headline; `tagline` doubles as
 * the card subtitle and the social/meta description for the page.
 */
export const PAGE_OG_CARDS = {
  today: {
    path: "/",
    title: "Today",
    tagline: "Fresh writing from the publications you follow, every day.",
  },
  discover: {
    path: "/discover",
    title: "Discover",
    tagline:
      "Browse and follow standard.site publications across the Atmosphere.",
  },
  latest: {
    path: "/latest",
    title: "Latest",
    tagline: "The newest articles from across the network, as they publish.",
  },
  saved: {
    path: "/saved",
    title: "Saved for later",
    tagline: "Your private reading queue — articles you've saved for later.",
  },
  likes: {
    path: "/likes",
    title: "Liked articles",
    tagline: "Articles you've liked across the network.",
  },
  search: {
    path: "/search",
    title: "Search",
    tagline: "Find articles and publications across the Atmosphere.",
  },
  about: {
    path: "/about",
    title: "About",
    tagline: "What Standard Reader is, and how it fits the Atmosphere.",
  },
  login: {
    path: "/login",
    title: "Sign in",
    tagline: "Use your Atmosphere account to follow writers and save reads.",
  },
} as const;

export type PageOgSlug = keyof typeof PAGE_OG_CARDS;

export function isPageOgSlug(value: string): value is PageOgSlug {
  return Object.hasOwn(PAGE_OG_CARDS, value);
}

export function pageOgImageUrl(baseUrl: string, slug: PageOgSlug): string {
  return `${baseUrl.replace(/\/$/, "")}/api/og/page/${slug}`;
}

/** Dynamic OG card for an article (`/a/$did/$rkey`). */
export function articleOgImageUrl(
  baseUrl: string,
  did: string,
  rkey: string,
): string {
  const params = new URLSearchParams({ did, rkey });
  return `${baseUrl.replace(/\/$/, "")}/api/og/article?${params.toString()}`;
}

/** Dynamic OG card for a publication profile (`/p/$did/$rkey`). */
export function publicationOgImageUrl(
  baseUrl: string,
  did: string,
  rkey: string,
): string {
  const params = new URLSearchParams({ did, rkey });
  return `${baseUrl.replace(/\/$/, "")}/api/og/publication?${params.toString()}`;
}

/** Dynamic OG card for a publication list (`/l/$did/$rkey`). */
export function listOgImageUrl(
  baseUrl: string,
  did: string,
  rkey: string,
): string {
  const params = new URLSearchParams({ did, rkey });
  return `${baseUrl.replace(/\/$/, "")}/api/og/list?${params.toString()}`;
}

/** Full social meta for one of the main routes (title, OG card, URL). */
export function pageSocialMeta(
  slug: PageOgSlug,
  baseUrl: string,
): Array<HeadMetaEntry> {
  const card = PAGE_OG_CARDS[slug];
  return siteSocialMeta({
    title: `${card.title} · ${SITE_NAME}`,
    description: card.tagline,
    url: `${baseUrl.replace(/\/$/, "")}${card.path === "/" ? "" : card.path}`,
    ogImage: pageOgImageUrl(baseUrl, slug),
  });
}

type HeadMetaEntry =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };

/** Default Open Graph + Twitter tags for site-level pages. */
export function siteSocialMeta(
  options: {
    title?: string;
    description?: string;
    url?: string;
    ogImage?: string;
    ogType?: "website" | "article";
  } = {},
): Array<HeadMetaEntry> {
  const title = options.title ?? SITE_NAME;
  const description = options.description ?? SITE_DESCRIPTION;
  const ogType = options.ogType ?? "website";

  const meta: Array<HeadMetaEntry> = [
    { title },
    { name: "description", content: description },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: ogType },
  ];

  if (options.url) {
    meta.push({ property: "og:url", content: options.url });
  }

  if (options.ogImage) {
    meta.push(
      { property: "og:image", content: options.ogImage },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: options.ogImage },
    );
  } else {
    meta.push({ name: "twitter:card", content: "summary" });
  }

  meta.push(
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  );

  return meta;
}

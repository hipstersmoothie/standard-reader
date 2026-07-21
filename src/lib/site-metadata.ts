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
    tagline: "Fresh writing from the publications you subscribe to, every day.",
  },
  discover: {
    path: "/discover",
    title: "Discover",
    tagline:
      "Browse and subscribe to standard.site publications across the Atmosphere.",
  },
  latest: {
    path: "/latest",
    title: "Latest",
    tagline: "The newest articles from across the network, as they publish.",
  },
  saved: {
    path: "/saved",
    title: "Saved for later",
    tagline:
      "Articles you've saved for later — in your repo, synced across devices.",
  },
  friends: {
    path: "/friends",
    title: "People you follow",
    tagline:
      "Publications written by the people you follow on Bluesky, all in one place.",
  },
  recommended: {
    path: "/recommended",
    title: "Recommended articles",
    tagline: "Articles you've recommended across the network.",
  },
  history: {
    path: "/history",
    title: "Reading history",
    tagline:
      "Articles you've opened — public records in your repo, synced across devices.",
  },
  search: {
    path: "/search",
    title: "Search",
    tagline: "Find articles and publications across the Atmosphere.",
  },
  about: {
    path: "/about",
    title: "A home for the writing you love",
    tagline:
      "New writing from the standard.site publications you subscribe to — calm, chronological, and yours to take anywhere.",
  },
  docsIntroduction: {
    path: "/docs/introduction",
    title: "Introduction",
    tagline:
      "Build on Standard — an open reading network on the AT Protocol. What the developer docs cover.",
  },
  docsApi: {
    path: "/docs/api",
    title: "API",
    tagline:
      "AppView XRPC queries and procedures for the Standard Reader read-model.",
  },
  docsLabelers: {
    path: "/docs/labelers",
    title: "Labelers",
    tagline:
      "Publish AT Protocol labels Standard Reader shows — and can warn or hide by — as readers read.",
  },
  docsLexicons: {
    path: "/docs/lexicons",
    title: "Lexicons",
    tagline:
      "Published app.standard-reader.* record schemas for reader repo state.",
  },
  docsPublishing: {
    path: "/docs/publishing",
    title: "Publishing",
    tagline: "Wire a personal site's own site.standard.* records by hand.",
  },
  docsRenderers: {
    path: "/docs/renderers",
    title: "Renderers",
    tagline:
      "Headless, unstyled renderers for Standard Site documents — React, Vue, Solid, Svelte, Lit, and Angular.",
  },
  privacy: {
    path: "/privacy",
    title: "Privacy",
    tagline:
      "What Standard Reader collects, where your data lives, and your choices.",
  },
  terms: {
    path: "/terms",
    title: "Terms of service",
    tagline:
      "The terms for using Standard Reader — what you can expect and what we ask of you.",
  },
  privacyExtension: {
    path: "/privacy/extension",
    title: "Extension privacy",
    tagline:
      "What the Standard Reader browser extension accesses and how it uses your data.",
  },
  settings: {
    path: "/settings",
    title: "Settings",
    tagline:
      "Appearance, reading preferences, and personal data for your account.",
  },
  login: {
    path: "/login",
    title: "Sign in",
    tagline:
      "Use your Atmosphere account to subscribe to writers and save reads.",
  },
  feedback: {
    path: "/feedback",
    title: "Feedback",
    tagline:
      "Bug reports, feature requests, and questions for Standard Reader — hosted on userinput.app.",
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

/** Dynamic OG card for an author profile (`/u/$did`). */
export function profileOgImageUrl(baseUrl: string, did: string): string {
  const params = new URLSearchParams({ did });
  return `${baseUrl.replace(/\/$/, "")}/api/og/profile?${params.toString()}`;
}

/** Dynamic OG card for a curated collection (`/collection/$did/$rkey`). */
export { collectionOgImageUrl } from "#/lib/collections/og-meta";

/** Personalized "your latest" RSS feed (`/feed/latest/$did`) — public, keyed by DID. */
export function latestFeedUrl(baseUrl: string, did: string): string {
  return `${baseUrl.replace(/\/$/, "")}/feed/latest/${encodeURIComponent(did)}`;
}

/** Publication RSS feed (`/feed/p/$did/$rkey`). */
export function publicationFeedUrl(
  baseUrl: string,
  did: string,
  rkey: string,
): string {
  return `${baseUrl.replace(/\/$/, "")}/feed/p/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`;
}

/** Tag RSS feed (`/feed/tag/$tag`). */
export function tagFeedUrl(baseUrl: string, tag: string): string {
  return `${baseUrl.replace(/\/$/, "")}/feed/tag/${encodeURIComponent(tag)}`;
}

/** Author RSS feed (`/feed/u/$did`). */
export function authorFeedUrl(baseUrl: string, did: string): string {
  return `${baseUrl.replace(/\/$/, "")}/feed/u/${encodeURIComponent(did)}`;
}

/** List RSS feed (`/feed/l/$did/$rkey`). */
export function listFeedUrl(
  baseUrl: string,
  did: string,
  rkey: string,
): string {
  return `${baseUrl.replace(/\/$/, "")}/feed/l/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`;
}

/** Curated collection RSS feed (`/feed/collection/$did/$rkey`). */
export function collectionFeedUrl(
  baseUrl: string,
  did: string,
  rkey: string,
): string {
  return `${baseUrl.replace(/\/$/, "")}/feed/collection/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`;
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

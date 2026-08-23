import type { SiteArticle, SitePage } from "#/server/site.server";

/**
 * What every presentation is handed. The styles differ in layout and voice, not
 * in what they know: one masthead, one page of the archive, and where the older
 * pages are. Adding a style means adding a component that takes this and
 * nothing else.
 */
export interface SiteViewProps {
  page: SitePage;
  articles: Array<SiteArticle>;
  /** URL of the next page of the archive, or null at the end of it. */
  olderHref: string | null;
}

/**
 * The kicker above a headline: which publication a post came from. Only ever
 * shown on an author site, where the posts come from several — on a
 * publication's own site every row would carry the same word.
 */
export function siteArticleKicker(
  page: SitePage,
  article: SiteArticle,
): string | null {
  if (page.kind !== "author") return null;
  return article.publicationName?.trim() || null;
}

/** A cover for a post, or null. */
export function siteArticleImage(article: SiteArticle): string | null {
  return article.coverImageUrl;
}

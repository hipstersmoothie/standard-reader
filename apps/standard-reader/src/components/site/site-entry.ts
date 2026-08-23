import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";
import type { SitePage } from "#/integrations/tanstack-query/api-site.functions";

/**
 * What every presentation is handed. The styles differ in layout and voice, not
 * in what they know: one masthead, one archive, one way to ask for more of it.
 * Adding a style means adding a component that takes this and nothing else.
 */
export interface SiteViewProps {
  page: SitePage;
  articles: Array<ArticleCard>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

/**
 * The kicker above a headline: which publication a post came from. Only ever
 * shown on an author site, where the posts come from several — on a
 * publication's own site every row would carry the same word.
 */
export function siteArticleKicker(
  page: SitePage,
  article: ArticleCard,
): string | null {
  if (page.kind !== "author") return null;
  return article.publicationName?.trim() || null;
}

/**
 * A cover for a post, or null. Falls back to the owning publication's banner so
 * an image-led layout still has something to lead with — the same fallback
 * chain the in-app cards use.
 */
export function siteArticleImage(article: ArticleCard): string | null {
  return article.coverImageUrl ?? article.publicationBannerUrl ?? null;
}

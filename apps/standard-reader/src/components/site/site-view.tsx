"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";
import type { SitePage } from "#/integrations/tanstack-query/api-site.functions";
import {
  SITE_PAGE_SIZE,
  siteApi,
} from "#/integrations/tanstack-query/api-site.functions";
import type { SiteStyle } from "#/lib/site/styles";

import { SiteBroadsheet } from "./site-broadsheet";
import type { SiteViewProps } from "./site-entry";
import { SiteGallery } from "./site-gallery";
import { SiteJournal } from "./site-journal";
import { SiteMarquee } from "./site-marquee";
import { SiteThemeScope } from "./site-theme-scope";

const VIEWS: Record<SiteStyle, (props: SiteViewProps) => React.ReactNode> = {
  broadsheet: SiteBroadsheet,
  gallery: SiteGallery,
  journal: SiteJournal,
  marquee: SiteMarquee,
};

/**
 * A standalone site: one presentation, painted in the site's own colors.
 *
 * The archive's paging lives here rather than in each style, so a style is only
 * ever a layout — it receives the accumulated list and a way to ask for more,
 * and never has to know how either works.
 */
export function SiteView({
  page,
  style,
}: {
  page: SitePage;
  /**
   * The style to render in. Normally the owner's, but the route lets `?style=`
   * override it so the settings preview can show a style before it is saved.
   */
  style: SiteStyle;
}) {
  const [articles, setArticles] = useState<Array<ArticleCard>>(
    () => page.articles,
  );
  const [nextOffset, setNextOffset] = useState<number | null>(
    () => page.nextOffset,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);

  // Navigating between sites (or reloading one) replaces the archive rather
  // than appending to it.
  useEffect(() => {
    setArticles(page.articles);
    setNextOffset(page.nextOffset);
  }, [page.articles, page.nextOffset]);

  const loadMore = useCallback(async () => {
    if (nextOffset == null || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const next = await siteApi.getSitePage({
        data: {
          did: page.did,
          rkey: page.rkey ?? undefined,
          limit: SITE_PAGE_SIZE,
          offset: nextOffset,
        },
      });
      if (next) {
        setArticles((prev) => {
          const seen = new Set(prev.map((article) => article.uri));
          return [
            ...prev,
            ...next.articles.filter((article) => !seen.has(article.uri)),
          ];
        });
        setNextOffset(next.nextOffset);
      } else {
        setNextOffset(null);
      }
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [nextOffset, page.did, page.rkey]);

  const View = VIEWS[style];

  return (
    <SiteThemeScope theme={page.theme}>
      <View
        page={page}
        articles={articles}
        hasMore={nextOffset != null}
        loadingMore={loadingMore}
        onLoadMore={() => void loadMore()}
      />
    </SiteThemeScope>
  );
}

import type { SiteStyle } from "@standard-reader/site-config";

import type { SitePage } from "#/server/site.server";

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
 * Paging is by URL rather than by appending to a list in memory. A site is a
 * public page whose whole job is to be linked to and crawled — every page of
 * the archive should have an address, and a visitor who lands on page three
 * should see page three. That also keeps a style a pure layout: it is handed a
 * page of posts and, when there are older ones, somewhere to send the reader.
 */
export function SiteView({
  page,
  style,
  olderHref,
}: {
  page: SitePage;
  /**
   * The style to render in. Normally the owner's, but the route lets `?style=`
   * override it so the editor can preview one before it is saved.
   */
  style: SiteStyle;
  /** The next page of the archive, or null at the end of it. */
  olderHref: string | null;
}) {
  const View = VIEWS[style];

  return (
    <SiteThemeScope theme={page.theme}>
      <View page={page} articles={page.articles} olderHref={olderHref} />
    </SiteThemeScope>
  );
}

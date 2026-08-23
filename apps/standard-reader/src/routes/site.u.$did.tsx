import { Trans } from "@lingui/react/macro";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { SiteNotFound } from "#/components/site/site-not-found";
import { SiteView } from "#/components/site/site-view";
import { siteApi } from "#/integrations/tanstack-query/api-site.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import {
  authorFeedUrl,
  canonicalLink,
  profileOgImageUrl,
  siteSocialMeta,
} from "#/lib/site-metadata";
import { SITE_STYLES, toSiteStyle } from "#/lib/site/styles";

const siteSearch = z.object({
  /** Preview a style without saving it — see `/site/p/$did/$rkey`. */
  style: z.enum(SITE_STYLES).optional(),
});

export const Route = createFileRoute("/site/u/$did")({
  validateSearch: siteSearch,
  loader: async ({ context, params, preload }) => {
    const options = siteApi.getSitePageQueryOptions({ did: params.did });
    if (preload) {
      void context.queryClient.prefetchQuery(options);
      return { page: null };
    }
    const page = await context.queryClient.ensureQueryData(options);
    if (page && page.did !== params.did) {
      throw redirect({
        to: "/site/u/$did",
        params: { did: page.did },
        search: (prev) => prev,
      });
    }
    return { page };
  },
  head: ({ loaderData, match }) => {
    const page = loaderData?.page;
    if (!page) {
      return { meta: siteSocialMeta() };
    }
    const baseUrl = getPublicUrlClient();
    const url = `${baseUrl}${match.pathname}`;
    return {
      meta: siteSocialMeta({
        title: page.masthead.name,
        description:
          page.config.tagline?.trim() ||
          page.masthead.description?.trim() ||
          `Writing by ${page.masthead.name}.`,
        url,
        ogImage: profileOgImageUrl(baseUrl, page.did),
      }),
      links: [
        canonicalLink(url),
        {
          rel: "alternate",
          type: "application/rss+xml",
          title: page.masthead.name,
          href: authorFeedUrl(baseUrl, page.did),
        },
      ],
    };
  },
  component: AuthorSitePage,
});

function AuthorSitePage() {
  const { page } = Route.useLoaderData();
  const { style } = Route.useSearch();

  if (!page) {
    return (
      <SiteNotFound>
        <Trans>We couldn’t find that account.</Trans>
      </SiteNotFound>
    );
  }

  return (
    <SiteView page={page} style={toSiteStyle(style ?? page.config.style)} />
  );
}

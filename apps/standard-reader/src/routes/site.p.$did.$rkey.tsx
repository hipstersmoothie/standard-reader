import { Trans } from "@lingui/react/macro";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { publicationUriFromParams } from "#/components/reader/format";
import { SiteNotFound } from "#/components/site/site-not-found";
import { SiteView } from "#/components/site/site-view";
import { siteApi } from "#/integrations/tanstack-query/api-site.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import {
  canonicalLink,
  publicationFeedUrl,
  publicationOgImageUrl,
  siteSocialMeta,
} from "#/lib/site-metadata";
import { SITE_STYLES, toSiteStyle } from "#/lib/site/styles";

const siteSearch = z.object({
  /**
   * Preview a style without saving it — what the settings editor opens the site
   * with. Absent (the normal case) renders the owner's chosen style.
   */
  style: z.enum(SITE_STYLES).optional(),
});

export const Route = createFileRoute("/site/p/$did/$rkey")({
  validateSearch: siteSearch,
  loader: async ({ context, params, preload }) => {
    const options = siteApi.getSitePageQueryOptions({
      did: params.did,
      rkey: params.rkey,
    });
    if (preload) {
      void context.queryClient.prefetchQuery(options);
      return { page: null };
    }
    const page = await context.queryClient.ensureQueryData(options);
    // `$did` accepts a handle too — canonicalize to the resolved DID so a
    // handle-based link settles on one URL rather than two that render alike.
    if (page && page.did !== params.did) {
      throw redirect({
        to: "/site/p/$did/$rkey",
        params: { did: page.did, rkey: params.rkey },
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
      // The site is the publication's page, so its title is the publication's
      // name alone — no " · Standard Reader" suffix. This is the one surface
      // where we are the printer, not the publisher.
      meta: siteSocialMeta({
        title: page.masthead.name,
        description:
          page.config.tagline?.trim() ||
          page.masthead.description?.trim() ||
          `Writing by ${page.masthead.name}.`,
        url,
        ogImage: publicationOgImageUrl(baseUrl, page.did, match.params.rkey),
      }),
      links: [
        canonicalLink(url),
        {
          rel: "site.standard.publication",
          href: publicationUriFromParams(page.did, match.params.rkey),
        },
        {
          rel: "alternate",
          type: "application/rss+xml",
          title: page.masthead.name,
          href: publicationFeedUrl(baseUrl, page.did, match.params.rkey),
        },
      ],
    };
  },
  component: PublicationSitePage,
});

function PublicationSitePage() {
  const { page } = Route.useLoaderData();
  const { style } = Route.useSearch();

  if (!page) {
    return (
      <SiteNotFound>
        <Trans>We couldn’t find that publication.</Trans>
      </SiteNotFound>
    );
  }

  return (
    <SiteView page={page} style={toSiteStyle(style ?? page.config.style)} />
  );
}

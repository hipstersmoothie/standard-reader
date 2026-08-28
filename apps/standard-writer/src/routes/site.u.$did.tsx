import {
  SITE_STYLES,
  authorSitePath,
  toSiteStyle,
} from "@standard-reader/site-config";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getSitePage } from "#/server/site";
import { SiteNotFound } from "#/site/site-not-found";
import { SiteView } from "#/site/site-view";

const siteSearch = z.object({
  /** Preview a style without saving it — see `/site/p/$did/$rkey`. */
  style: z.enum(SITE_STYLES).optional(),
  /** Which page of the archive; read through `loaderDeps`. */
  offset: z.coerce.number().int().min(0).optional(),
});

export const Route = createFileRoute("/site/u/$did")({
  validateSearch: siteSearch,
  loaderDeps: ({ search }) => ({ offset: search.offset ?? 0 }),
  loader: async ({ params, deps }) => {
    const page = await getSitePage({
      data: { did: params.did, offset: deps.offset },
    });
    return { page };
  },
  head: ({ loaderData }) => {
    const page = loaderData?.page;
    if (!page) return {};
    return {
      meta: [
        { title: page.masthead.name },
        {
          name: "description",
          content:
            page.config.tagline?.trim() ||
            page.masthead.description?.trim() ||
            `Writing by ${page.masthead.name}.`,
        },
        { property: "og:title", content: page.masthead.name },
        { property: "og:type", content: "website" },
      ],
    };
  },
  component: AuthorSitePage,
});

function AuthorSitePage() {
  const { page } = Route.useLoaderData();
  const { style } = Route.useSearch();
  const params = Route.useParams();

  if (!page) {
    return <SiteNotFound>We couldn’t find that account.</SiteNotFound>;
  }

  const olderHref =
    page.nextOffset == null
      ? null
      : `${authorSitePath(params.did)}?${new URLSearchParams({
          ...(style ? { style } : {}),
          offset: String(page.nextOffset),
        }).toString()}`;

  return (
    <SiteView
      page={page}
      style={toSiteStyle(style ?? page.config.style)}
      olderHref={olderHref}
    />
  );
}

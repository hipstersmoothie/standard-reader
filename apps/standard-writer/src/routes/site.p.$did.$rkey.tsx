import {
  SITE_STYLES,
  publicationSitePath,
  toSiteStyle,
} from "@standard-reader/site-config";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getSitePage } from "#/server/site";
import { SiteNotFound } from "#/site/site-not-found";
import { SiteView } from "#/site/site-view";

const siteSearch = z.object({
  /**
   * Preview a style without saving it — what the editor's "Preview this style"
   * opens. Absent (the normal case) renders the owner's chosen style.
   */
  style: z.enum(SITE_STYLES).optional(),
  /**
   * Which page of the archive. Sites paginate by URL so every page has an
   * address; read through `loaderDeps` so the loader re-runs when it changes.
   */
  offset: z.coerce.number().int().min(0).optional(),
});

export const Route = createFileRoute("/site/p/$did/$rkey")({
  validateSearch: siteSearch,
  loaderDeps: ({ search }) => ({ offset: search.offset ?? 0 }),
  loader: async ({ params, deps }) => {
    const page = await getSitePage({
      data: { did: params.did, rkey: params.rkey, offset: deps.offset },
    });
    return { page };
  },
  head: ({ loaderData }) => {
    const page = loaderData?.page;
    if (!page) return {};
    return {
      // A site's title is the publication's name alone — no product suffix.
      // This is the one surface where we are the printer, not the publisher.
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
  component: PublicationSitePage,
});

function PublicationSitePage() {
  const { page } = Route.useLoaderData();
  const { style } = Route.useSearch();
  const params = Route.useParams();

  if (!page) {
    return <SiteNotFound>We couldn’t find that publication.</SiteNotFound>;
  }

  const olderHref =
    page.nextOffset == null
      ? null
      : `${publicationSitePath(params.did, params.rkey)}?${new URLSearchParams({
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

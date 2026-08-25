import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import type { OpdsLink } from "#/lib/opds/model";
import { feedTypeFor } from "#/lib/opds/model";
import { opdsFormatFromRequest, opdsResponse } from "#/lib/opds/respond";
import { opdsPublicationsUrl } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import { SITE_NAME } from "#/lib/site-metadata";
import {
  navigationFeed,
  OPDS_PAGE_SIZE,
  pageFromRequest,
  publicationEntries,
} from "#/server/opds/catalog";
import {
  countKnownPublications,
  discoverDirectoryPublications,
} from "#/server/reader/queries";

/** Sort facets, matching the Discover directory's own controls. */
const SORTS = [
  { key: "active", label: "Recently published" },
  { key: "readers", label: "Most subscribers" },
  { key: "az", label: "A–Z" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

function sortFromRequest(request: Request): SortKey {
  const raw = new URL(request.url).searchParams.get("sort");
  return SORTS.some((sort) => sort.key === raw) ? (raw as SortKey) : "active";
}

export const Route = createFileRoute("/opds/publications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const baseUrl = getPublicUrl();
        const page = pageFromRequest(request);
        const sort = sortFromRequest(request);
        const self = opdsPublicationsUrl(baseUrl);

        const [publications, total] = await Promise.all([
          discoverDirectoryPublications(db, schema, {
            limit: OPDS_PAGE_SIZE,
            offset: (page - 1) * OPDS_PAGE_SIZE,
            sort,
          }),
          countKnownPublications(db),
        ]);

        // Facets are how a catalog client offers a sort menu — one group, one
        // active entry, so the reader sees which order they are in.
        const facets: Array<OpdsLink> = SORTS.map((option) => ({
          activeFacet: option.key === sort,
          facetGroup: "Sort",
          href: `${self}?sort=${option.key}`,
          rel: "http://opds-spec.org/facet",
          title: option.label,
          type: feedTypeFor("navigation"),
        }));

        return opdsResponse(
          navigationFeed(publicationEntries(publications, baseUrl), {
            baseUrl,
            extraLinks: facets,
            id: self,
            page,
            selfHref: sort === "active" ? self : `${self}?sort=${sort}`,
            subtitle: `Every publication on ${SITE_NAME}.`,
            title: "Publications",
            totalResults: total,
          }),
          opdsFormatFromRequest(request),
        );
      },
    },
  },
});

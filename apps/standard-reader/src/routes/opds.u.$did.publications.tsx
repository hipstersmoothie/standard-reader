import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { didFromParam } from "#/lib/opds/did-param";
import {
  OPDS_PRIVATE_CACHE_CONTROL,
  opdsFormatFromRequest,
  opdsResponse,
} from "#/lib/opds/respond";
import { opdsShelfUrl } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import { navigationFeed, publicationEntries } from "#/server/opds/catalog";
import { followedPublications } from "#/server/reader/queries";
import { effectiveFollowUris } from "#/server/reader/saved-lists";

export const Route = createFileRoute("/opds/u/$did/publications")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const did = didFromParam(params.did);
        if (!did) {
          return new Response("Bad Request", { status: 400 });
        }

        const baseUrl = getPublicUrl();
        const uris = await effectiveFollowUris(db, schema, did);
        const publications = await followedPublications(db, schema, uris);
        const self = `${opdsShelfUrl(baseUrl, did)}/publications`;

        return opdsResponse(
          navigationFeed(publicationEntries(publications, baseUrl), {
            baseUrl,
            id: self,
            selfHref: self,
            subtitle:
              "Every publication you subscribe to — open one to browse or download it.",
            title: "Your publications",
            upHref: opdsShelfUrl(baseUrl, did),
          }),
          opdsFormatFromRequest(request),
          { cacheControl: OPDS_PRIVATE_CACHE_CONTROL },
        );
      },
    },
  },
});

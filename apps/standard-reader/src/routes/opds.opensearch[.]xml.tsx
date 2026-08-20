import { createFileRoute } from "@tanstack/react-router";

import { renderOpenSearchDescription } from "#/lib/opds/atom";
import { withJsonFormat } from "#/lib/opds/json";
import { OPDS_CACHE_CONTROL } from "#/lib/opds/respond";
import { opdsSearchTemplate } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import { SITE_NAME } from "#/lib/site-metadata";

export const Route = createFileRoute("/opds/opensearch.xml")({
  server: {
    handlers: {
      GET: () => {
        const baseUrl = getPublicUrl();
        const template = opdsSearchTemplate(baseUrl);

        const xml = renderOpenSearchDescription({
          description: `Search articles across ${SITE_NAME}.`,
          // `{searchTerms}` must survive as a literal placeholder — the client
          // substitutes it, so it is not URL-encoded on either template.
          jsonSearchTemplate: withJsonFormat(template).replace(
            "%7BsearchTerms%7D",
            "{searchTerms}",
          ),
          searchTemplate: template,
          shortName: SITE_NAME,
        });

        return new Response(xml, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": OPDS_CACHE_CONTROL,
            "Content-Type":
              "application/opensearchdescription+xml; charset=utf-8",
          },
        });
      },
    },
  },
});

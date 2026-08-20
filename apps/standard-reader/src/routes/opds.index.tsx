import { createFileRoute } from "@tanstack/react-router";

import { opdsFormatFromRequest, opdsResponse } from "#/lib/opds/respond";
import { getPublicUrl } from "#/lib/public-url";
import { rootFeed } from "#/server/opds/catalog";

export const Route = createFileRoute("/opds/")({
  server: {
    handlers: {
      GET: ({ request }) =>
        opdsResponse(rootFeed(getPublicUrl()), opdsFormatFromRequest(request)),
    },
  },
});

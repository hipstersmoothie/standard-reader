import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import { opdsFormatFromRequest, opdsResponse } from "#/lib/opds/respond";
import { opdsTagsUrl } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import { navigationFeed, topicEntries } from "#/server/opds/catalog";
import { discoverPublicationTopics } from "#/server/reader/queries";

/** One page of topics is the whole list — there are not many, and paging hurts. */
const TOPIC_LIMIT = 200;

export const Route = createFileRoute("/opds/tags")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const baseUrl = getPublicUrl();
        const topics = await discoverPublicationTopics(db, {
          limit: TOPIC_LIMIT,
        });

        return opdsResponse(
          navigationFeed(topicEntries(topics, baseUrl), {
            baseUrl,
            id: opdsTagsUrl(baseUrl),
            selfHref: opdsTagsUrl(baseUrl),
            subtitle: "Browse the network by subject.",
            title: "Topics",
          }),
          opdsFormatFromRequest(request),
        );
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";

import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { AboutView } from "../components/reader/about-view";

export const Route = createFileRoute("/_layout/about")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        discoverApi.getKnownPublicationCountQueryOptions(),
      ),
      context.queryClient.ensureQueryData(
        discoverApi.getPublicationsQueryOptions({ limit: 24 }),
      ),
      context.queryClient.ensureQueryData(
        discoverApi.getTrendingPublicationsQueryOptions({ limit: 12 }),
      ),
    ]);
  },
  head: () => ({
    meta: pageSocialMeta("about", getPublicUrlClient()),
  }),
  component: About,
});

function About() {
  return <AboutView />;
}

import { createFileRoute } from "@tanstack/react-router";
import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { AboutView } from "../components/reader/about-view";

export const Route = createFileRoute("/_layout/about")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      discoverApi.getKnownPublicationCountQueryOptions(),
    );
  },
  head: () => ({
    meta: pageSocialMeta("about", getPublicUrlClient()),
  }),
  component: About,
});

function About() {
  return <AboutView />;
}

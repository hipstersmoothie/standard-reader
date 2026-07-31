import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { GettingStartedGuidePage } from "../components/guide/pages/getting-started-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/getting-started")({
  head: () => ({
    meta: pageSocialMeta("guideGettingStarted", getPublicUrlClient()),
  }),
  component: GettingStartedGuidePage,
});

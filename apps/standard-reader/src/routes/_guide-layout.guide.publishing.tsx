import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { PublishingGuidePage } from "../components/guide/pages/publishing-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/publishing")({
  head: () => ({
    meta: pageSocialMeta("guidePublishing", getPublicUrlClient()),
  }),
  component: PublishingGuidePage,
});

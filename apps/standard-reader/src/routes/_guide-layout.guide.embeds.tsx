import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { EmbedsGuidePage } from "../components/guide/pages/embeds-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/embeds")({
  head: () => ({
    meta: pageSocialMeta("guideEmbeds", getPublicUrlClient()),
  }),
  component: EmbedsGuidePage,
});

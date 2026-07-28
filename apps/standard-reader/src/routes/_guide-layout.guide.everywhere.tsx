import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { EverywhereGuidePage } from "../components/guide/pages/everywhere-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/everywhere")({
  head: () => ({
    meta: pageSocialMeta("guideEverywhere", getPublicUrlClient()),
  }),
  component: EverywhereGuidePage,
});

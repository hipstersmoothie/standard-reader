import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { PersonalizingGuidePage } from "../components/guide/pages/personalizing-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/personalizing")({
  head: () => ({
    meta: pageSocialMeta("guidePersonalizing", getPublicUrlClient()),
  }),
  component: PersonalizingGuidePage,
});

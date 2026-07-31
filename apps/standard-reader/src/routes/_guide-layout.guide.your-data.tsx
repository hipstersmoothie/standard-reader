import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { YourDataGuidePage } from "../components/guide/pages/your-data-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/your-data")({
  head: () => ({
    meta: pageSocialMeta("guideYourData", getPublicUrlClient()),
  }),
  component: YourDataGuidePage,
});

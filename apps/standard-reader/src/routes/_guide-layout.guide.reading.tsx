import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { ReadingGuidePage } from "../components/guide/pages/reading-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/reading")({
  head: () => ({
    meta: pageSocialMeta("guideReading", getPublicUrlClient()),
  }),
  component: ReadingGuidePage,
});

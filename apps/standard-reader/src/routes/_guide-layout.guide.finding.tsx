import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { FindingGuidePage } from "../components/guide/pages/finding-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/finding")({
  head: () => ({
    meta: pageSocialMeta("guideFinding", getPublicUrlClient()),
  }),
  component: FindingGuidePage,
});

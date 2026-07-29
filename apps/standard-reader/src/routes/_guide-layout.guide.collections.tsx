import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { CollectionsGuidePage } from "../components/guide/pages/collections-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/collections")({
  head: () => ({
    meta: pageSocialMeta("guideCollections", getPublicUrlClient()),
  }),
  component: CollectionsGuidePage,
});

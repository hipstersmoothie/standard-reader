import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { ListsGuidePage } from "../components/guide/pages/lists-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/lists")({
  head: () => ({
    meta: pageSocialMeta("guideLists", getPublicUrlClient()),
  }),
  component: ListsGuidePage,
});

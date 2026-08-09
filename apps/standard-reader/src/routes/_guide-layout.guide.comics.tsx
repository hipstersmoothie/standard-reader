import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { ComicsGuidePage } from "../components/guide/pages/comics-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/comics")({
  head: () => ({
    meta: pageSocialMeta("guideComics", getPublicUrlClient()),
  }),
  component: ComicsGuidePage,
});

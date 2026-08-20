import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { EreadersGuidePage } from "../components/guide/pages/e-readers-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/e-readers")({
  head: () => ({
    meta: pageSocialMeta("guideEreaders", getPublicUrlClient()),
  }),
  component: EreadersGuidePage,
});

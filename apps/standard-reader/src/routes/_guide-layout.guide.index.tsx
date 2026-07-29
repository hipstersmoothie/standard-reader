import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { WelcomeGuidePage } from "../components/guide/pages/welcome-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/")({
  head: () => ({
    meta: pageSocialMeta("guide", getPublicUrlClient()),
  }),
  component: WelcomeGuidePage,
});

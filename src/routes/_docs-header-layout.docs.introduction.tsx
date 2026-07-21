import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { IntroductionDocsPage } from "../components/docs/introduction-docs-page";

export const Route = createFileRoute("/_docs-header-layout/docs/introduction")({
  head: () => ({
    meta: pageSocialMeta("docsIntroduction", getPublicUrlClient()),
  }),
  component: IntroductionDocsPage,
});

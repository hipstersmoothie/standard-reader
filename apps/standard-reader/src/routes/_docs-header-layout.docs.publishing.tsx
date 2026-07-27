import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { PublishingDocsPage } from "../components/docs/publishing-docs-page";

export const Route = createFileRoute("/_docs-header-layout/docs/publishing")({
  head: () => ({
    meta: pageSocialMeta("docsPublishing", getPublicUrlClient()),
  }),
  component: PublishingDocsPage,
});

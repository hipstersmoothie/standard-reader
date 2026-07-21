import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { LabelersDocsPage } from "../components/docs/labelers-docs-page";

export const Route = createFileRoute("/_docs-header-layout/docs/labelers")({
  head: () => ({
    meta: pageSocialMeta("docsLabelers", getPublicUrlClient()),
  }),
  component: LabelersDocsPage,
});

import { createFileRoute } from "@tanstack/react-router";
import { getApiDocsPageData } from "#/integrations/tanstack-query/api-docs.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { ApiDocsPage } from "../components/docs/api-docs-page";

export const Route = createFileRoute(
  "/_docs-header-layout/_docs-api-layout/docs/api",
)({
  head: () => ({
    meta: pageSocialMeta("docsApi", getPublicUrlClient()),
  }),
  loader: async () => getApiDocsPageData(),
  component: ApiDocsPage,
});

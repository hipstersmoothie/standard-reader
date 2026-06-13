import { createFileRoute } from "@tanstack/react-router";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { loadApiDocsPageData } from "#/server/api-docs/fixtures.server";

import { ApiDocsPage } from "../components/docs/api-docs-page";

export const Route = createFileRoute(
  "/_docs-header-layout/_docs-api-layout/docs/api",
)({
  head: () => ({
    meta: pageSocialMeta("docsApi", getPublicUrlClient()),
  }),
  loader: async () => loadApiDocsPageData(),
  component: ApiDocsPage,
});

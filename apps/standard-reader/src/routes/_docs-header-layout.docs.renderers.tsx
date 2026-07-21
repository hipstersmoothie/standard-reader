import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { RenderersDocsPage } from "../components/docs/renderers-docs-page";

export const Route = createFileRoute("/_docs-header-layout/docs/renderers")({
  head: () => ({
    meta: pageSocialMeta("docsRenderers", getPublicUrlClient()),
  }),
  component: RenderersDocsPage,
});

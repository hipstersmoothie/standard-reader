import { createFileRoute } from "@tanstack/react-router";
import { getLexiconDocsPageData } from "#/integrations/tanstack-query/api-lexicon-docs.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { LexiconDocsPage } from "../components/docs/lexicon-docs-page";

export const Route = createFileRoute("/_docs-header-layout/docs/lexicons")({
  head: () => ({
    meta: pageSocialMeta("docsLexicons", getPublicUrlClient()),
  }),
  loader: async () => getLexiconDocsPageData(),
  component: LexiconDocsPage,
});

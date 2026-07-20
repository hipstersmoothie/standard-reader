import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { TermsView } from "../components/reader/terms-view";

export const Route = createFileRoute("/_layout/terms")({
  head: () => ({
    meta: pageSocialMeta("terms", getPublicUrlClient()),
  }),
  component: Terms,
});

function Terms() {
  return <TermsView />;
}

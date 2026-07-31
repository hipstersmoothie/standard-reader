import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { PrivacyView } from "../components/reader/privacy-view";

export const Route = createFileRoute("/_layout/privacy")({
  head: () => ({
    meta: pageSocialMeta("privacy", getPublicUrlClient()),
  }),
  component: Privacy,
});

function Privacy() {
  return <PrivacyView />;
}

import { createFileRoute } from "@tanstack/react-router";

import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { ExtensionGuidePage } from "../components/guide/pages/extension-guide-page";

export const Route = createFileRoute("/_guide-layout/guide/extension")({
  head: () => ({
    meta: pageSocialMeta("guideExtension", getPublicUrlClient()),
  }),
  component: ExtensionGuidePage,
});

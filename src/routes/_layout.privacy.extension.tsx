import { createFileRoute } from "@tanstack/react-router";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import { ExtensionPrivacyView } from "../components/reader/extension-privacy-view";

export const Route = createFileRoute("/_layout/privacy/extension")({
  head: () => ({
    meta: pageSocialMeta("privacyExtension", getPublicUrlClient()),
  }),
  component: ExtensionPrivacy,
});

function ExtensionPrivacy() {
  return <ExtensionPrivacyView />;
}

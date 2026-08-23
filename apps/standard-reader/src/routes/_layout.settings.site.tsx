import { createFileRoute, redirect } from "@tanstack/react-router";

import { SiteSettingsView } from "#/components/site-settings-view";
import { siteApi } from "#/integrations/tanstack-query/api-site.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

export const Route = createFileRoute("/_layout/settings/site")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: buildAuthRedirectPath("/settings/site") },
      });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      siteApi.getOwnedSitesQueryOptions,
    );
  },
  head: () => ({
    meta: pageSocialMeta("settings", getPublicUrlClient()),
  }),
  component: SitesPage,
});

function SitesPage() {
  return <SiteSettingsView />;
}

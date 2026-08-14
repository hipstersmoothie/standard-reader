import { createFileRoute, redirect } from "@tanstack/react-router";

import { MutedSettingsView } from "#/components/muted-settings-view";
import { mutesApi } from "#/integrations/tanstack-query/api-mutes.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

export const Route = createFileRoute("/_layout/settings/muted")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: buildAuthRedirectPath("/settings/muted") },
      });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      mutesApi.getMutedSettingsQueryOptions(),
    );
  },
  head: () => ({
    meta: pageSocialMeta("settings", getPublicUrlClient()),
  }),
  component: MutedPage,
});

function MutedPage() {
  return <MutedSettingsView />;
}

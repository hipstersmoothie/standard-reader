import { createFileRoute, redirect } from "@tanstack/react-router";
import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { LabelersSettingsView } from "../components/labelers-settings-view";

export const Route = createFileRoute("/_layout/settings/labelers")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: buildAuthRedirectPath("/settings/labelers") },
      });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      labelerApi.getLabelersQueryOptions(),
    );
  },
  head: () => ({
    meta: pageSocialMeta("settings", getPublicUrlClient()),
  }),
  component: LabelersPage,
});

function LabelersPage() {
  return <LabelersSettingsView />;
}

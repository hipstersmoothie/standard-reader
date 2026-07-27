import { createFileRoute, redirect } from "@tanstack/react-router";

import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { LabelersSettingsView } from "../components/labelers-settings-view";

export const Route = createFileRoute("/_layout/labelers/")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: buildAuthRedirectPath("/labelers") },
      });
    }
  },
  head: () => ({
    meta: pageSocialMeta("settings", getPublicUrlClient()),
  }),
  component: LabelersPage,
});

function LabelersPage() {
  return <LabelersSettingsView />;
}

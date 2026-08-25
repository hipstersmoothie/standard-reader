import { createFileRoute, redirect } from "@tanstack/react-router";

import { BlocksSettingsView } from "#/components/blocks-settings-view";
import { blocksApi } from "#/integrations/tanstack-query/api-blocks.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

export const Route = createFileRoute("/_layout/settings/blocks")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: buildAuthRedirectPath("/settings/blocks") },
      });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      blocksApi.getBlocksSettingsQueryOptions(),
    );
  },
  head: () => ({
    meta: pageSocialMeta("settings", getPublicUrlClient()),
  }),
  component: BlocksPage,
});

function BlocksPage() {
  return <BlocksSettingsView />;
}

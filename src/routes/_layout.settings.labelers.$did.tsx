import { createFileRoute, redirect } from "@tanstack/react-router";
import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { LabelerDetailView } from "../components/labeler-detail-view";

export const Route = createFileRoute("/_layout/settings/labelers/$did")({
  beforeLoad: async ({ context, params }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: {
          redirect: buildAuthRedirectPath(`/settings/labelers/${params.did}`),
        },
      });
    }
  },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      labelerApi.getLabelerQueryOptions(params.did),
    );
  },
  head: () => ({
    meta: pageSocialMeta("settings", getPublicUrlClient()),
  }),
  component: LabelerDetailPage,
});

function LabelerDetailPage() {
  const { did } = Route.useParams();
  return <LabelerDetailView did={did} />;
}
